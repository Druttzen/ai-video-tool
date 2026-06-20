"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Panel } from "./ui-blocks";
import { PanelActions } from "./panel-actions";
import { useProjectWorkspace } from "../context/project-workspace-context";
import { loadDirectorSettingsFromStorage, saveDirectorSettingsToStorage } from "../lib/director-settings";
import { loadOpenSoraSettingsFromStorage } from "../lib/open-sora-settings";
import {
  applyMaxedStandaloneProfile,
  clearPersistedSetupScan,
  getMissingSetupChecklist,
  getSetupHubModules,
  linkOpenSoraToDirector,
  loadPersistedSetupScan,
  runSetupEnvironmentScan,
  scrollToSetupTarget,
  SETUP_HUB_EVENT,
  summarizeSetupScan,
} from "../lib/setup-hub";
import { PROJECT_RESET_EVENT } from "../lib/project-reset";
import { isElectronApp } from "../lib/electron-bridge";
import {
  checkAddonUpdatesFromHost,
  loadAddonAutoUpdateSetting,
  saveAddonAutoUpdateSetting,
  summarizeAddonUpdateReport,
  updateAddonFromHost,
  updateAllAddonsFromHost,
} from "../lib/setup-addon-updates";

const STATUS_STYLES = {
  ready: "border-emerald-400/40 bg-emerald-500/10 text-emerald-100",
  optional: "border-amber-400/30 bg-amber-500/10 text-amber-100",
  offline: "border-sky-400/30 bg-sky-500/10 text-sky-100",
  missing: "border-rose-400/40 bg-rose-500/10 text-rose-100",
  unknown: "border-white/15 bg-black/30 text-white/50",
};

function statusLabel(status) {
  if (status === "ready") return "Ready";
  if (status === "optional") return "Optional";
  if (status === "offline") return "Offline";
  if (status === "missing") return "Missing";
  return "Unknown";
}

export const CenterSetupHubPanel = memo(function CenterSetupHubPanel() {
  const ws = useProjectWorkspace();
  const [scan, setScan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [linkPath, setLinkPath] = useState("");
  const [addonReport, setAddonReport] = useState(null);
  const [autoUpdateAddons, setAutoUpdateAddons] = useState(true);
  const [addonBusy, setAddonBusy] = useState(false);

  const modules = getSetupHubModules();
  const summary = useMemo(() => summarizeSetupScan(scan), [scan]);
  const missingChecklist = useMemo(() => getMissingSetupChecklist(scan), [scan]);

  const applyAddonUpdatePaths = useCallback((results) => {
    if (!Array.isArray(results)) return;
    for (const row of results) {
      if (!row?.ok || row.skipped) continue;
      if (row.id === "open-sora" && row.path) {
        linkOpenSoraToDirector(row.path);
        setLinkPath(row.path);
      }
      if (row.id === "python" && row.path) {
        const director = { ...loadDirectorSettingsFromStorage(), localPythonPath: row.path };
        saveDirectorSettingsToStorage(director);
        window.dispatchEvent(new CustomEvent("director-settings-updated", { detail: director }));
      }
    }
  }, []);

  const checkAddons = useCallback(async (scanSnapshot) => {
    if (!isElectronApp()) return null;
    const report = await checkAddonUpdatesFromHost({
      scan: scanSnapshot,
      openSoraInstallPath: loadOpenSoraSettingsFromStorage().installPath,
    });
    if (report?.ok) setAddonReport(report);
    return report;
  }, []);

  const runAddonAutoUpdate = useCallback(
    async (scanSnapshot) => {
      if (!isElectronApp() || !loadAddonAutoUpdateSetting()) return;
      setAddonBusy(true);
      try {
        const report = await checkAddons(scanSnapshot);
        if (!report?.items?.some((i) => i.updateAvailable)) return;
        const batch = await updateAllAddonsFromHost({
          openSoraInstallPath: loadOpenSoraSettingsFromStorage().installPath,
          directorSettings: loadDirectorSettingsFromStorage(),
        });
        if (batch?.results) applyAddonUpdatePaths(batch.results);
        const rescan = await runSetupEnvironmentScan({
          directorSettings: loadDirectorSettingsFromStorage(),
          openSoraSettings: loadOpenSoraSettingsFromStorage(),
          coProducerLlmSettings: ws.coProducerLlmSettings,
        });
        if (rescan?.scan) {
          setScan(rescan.scan);
          await checkAddons(rescan.scan);
        }
        ws.setStatusWithTime(
          batch?.ok ? "Addon auto-update finished" : summarizeAddonUpdateReport(report),
          batch?.ok ? "info" : "warning",
        );
      } finally {
        setAddonBusy(false);
      }
    },
    [applyAddonUpdatePaths, checkAddons, ws],
  );

  const runScan = useCallback(async () => {
    setBusy(true);
    try {
      const directorSettings = loadDirectorSettingsFromStorage();
      const openSoraSettings = loadOpenSoraSettingsFromStorage();
      const result = await runSetupEnvironmentScan({
        directorSettings,
        openSoraSettings,
        coProducerLlmSettings: ws.coProducerLlmSettings,
      });
      if (result?.scan) {
        setScan(result.scan);
        if (isElectronApp()) await runAddonAutoUpdate(result.scan);
      }
      ws.setStatusWithTime(
        result?.ok ? `Setup scan — ${summarizeSetupScan(result.scan).label}` : result?.error || "Scan failed",
        result?.ok ? "info" : "warning",
      );
    } finally {
      setBusy(false);
    }
  }, [ws, runAddonAutoUpdate]);

  useEffect(() => {
    setAutoUpdateAddons(loadAddonAutoUpdateSetting());
    const cached = loadPersistedSetupScan();
    if (cached) setScan(cached);
    setLinkPath(loadOpenSoraSettingsFromStorage().installPath || "");
  }, []);

  useEffect(() => {
    const onUpdate = (event) => {
      if (event.detail) setScan(event.detail);
    };
    window.addEventListener(SETUP_HUB_EVENT, onUpdate);
    return () => window.removeEventListener(SETUP_HUB_EVENT, onUpdate);
  }, []);

  useEffect(() => {
    if (!isElectronApp()) return;
    void runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onProjectReset = () => {
      setScan(null);
      clearPersistedSetupScan();
    };
    window.addEventListener(PROJECT_RESET_EVENT, onProjectReset);
    return () => window.removeEventListener(PROJECT_RESET_EVENT, onProjectReset);
  }, []);

  const onApplyMaxed = async () => {
    setBusy(true);
    try {
      const directorSettings = loadDirectorSettingsFromStorage();
      const openSoraSettings = loadOpenSoraSettingsFromStorage();
      const first = await runSetupEnvironmentScan({
        directorSettings,
        openSoraSettings,
        coProducerLlmSettings: ws.coProducerLlmSettings,
      });
      if (first?.scan) {
        applyMaxedStandaloneProfile(first.scan);
        const second = await runSetupEnvironmentScan({
          directorSettings: loadDirectorSettingsFromStorage(),
          openSoraSettings: loadOpenSoraSettingsFromStorage(),
          coProducerLlmSettings: ws.coProducerLlmSettings,
        });
        if (second?.scan) setScan(second.scan);
      }
      ws.setStatusWithTime("Applied maxed standalone profile — Director, GPU, Open-Sora linked", "info");
    } finally {
      setBusy(false);
    }
  };

  const onCheckAddons = async () => {
    setAddonBusy(true);
    try {
      const report = await checkAddons(scan);
      ws.setStatusWithTime(summarizeAddonUpdateReport(report), report?.ok ? "info" : "warning");
    } finally {
      setAddonBusy(false);
    }
  };

  const onUpdateAllAddons = async () => {
    setAddonBusy(true);
    try {
      const batch = await updateAllAddonsFromHost({
        openSoraInstallPath: linkPath || loadOpenSoraSettingsFromStorage().installPath,
        directorSettings: loadDirectorSettingsFromStorage(),
      });
      if (batch?.results) applyAddonUpdatePaths(batch.results);
      await runScan();
      ws.setStatusWithTime(batch?.ok ? "Addon updates finished — rescan complete" : "Some addon updates failed", batch?.ok ? "info" : "warning");
    } finally {
      setAddonBusy(false);
    }
  };

  const onUpdateOneAddon = async (addonId) => {
    setAddonBusy(true);
    try {
      const result = await updateAddonFromHost({
        addonId,
        scan,
        openSoraPath: linkPath,
        directorSettings: loadDirectorSettingsFromStorage(),
      });
      applyAddonUpdatePaths([{ id: addonId, ...result }]);
      await runScan();
      ws.setStatusWithTime(result?.message || result?.error || "Addon update", result?.ok ? "info" : "warning");
    } finally {
      setAddonBusy(false);
    }
  };

  const onLinkOpenSora = () => {
    const result = linkOpenSoraToDirector(linkPath);
    if (!result.ok) {
      ws.setStatusWithTime(result.error || "Link failed", "warning");
      return;
    }
    ws.setStatusWithTime("Open-Sora path linked to Director pipeline", "info");
    runScan();
  };

  return (
    <Panel
      title="All-in-One Setup Hub"
      hint="Scan Python, pipeline, GPU, ffmpeg, and optional Open-Sora — then apply the maxed standalone profile for local MP4 render."
      data-testid="setup-hub-panel"
      actions={
        <PanelActions
          topic="setup-hub"
          onClear={() => {
            setScan(null);
            clearPersistedSetupScan();
          }}
          clearLabel="Clear scan"
        />
      }
    >
      <div className="rounded-2xl border border-cyan-400/25 bg-cyan-500/5 p-4">
        <div className="text-sm font-semibold text-cyan-100" data-testid="setup-hub-summary-label">
          {summary.label}
        </div>
        <div className="mt-1 text-xs text-white/55">
          {summary.ready}/{summary.total} modules ready
          {!isElectronApp() ? " · Browser mode — export studio only" : ""}
        </div>
        {scan?.scannedAt ? (
          <div className="mt-1 text-[10px] uppercase tracking-wider text-white/35">
            Last scan {scan.scannedAt.replace("T", " ").slice(0, 19)}
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={runScan}
          className="rounded-xl border border-cyan-400/35 bg-cyan-500/15 px-4 py-2 text-xs font-bold uppercase tracking-wide text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-40"
          data-testid="setup-hub-scan"
        >
          {busy ? "Scanning…" : "Scan environment"}
        </button>
        <button
          type="button"
          disabled={busy || addonBusy || !isElectronApp()}
          onClick={onApplyMaxed}
          className="rounded-xl border border-emerald-400/35 bg-emerald-500/15 px-4 py-2 text-xs font-bold uppercase tracking-wide text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-40"
          data-testid="setup-hub-apply-maxed"
        >
          Apply maxed profile
        </button>
        <button
          type="button"
          disabled={busy || addonBusy || !isElectronApp()}
          onClick={onCheckAddons}
          className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white/80 hover:bg-white/10 disabled:opacity-40"
          data-testid="setup-hub-check-addons"
        >
          Check addon updates
        </button>
        <button
          type="button"
          disabled={busy || addonBusy || !isElectronApp()}
          onClick={onUpdateAllAddons}
          className="rounded-xl border border-violet-400/35 bg-violet-500/15 px-4 py-2 text-xs font-bold uppercase tracking-wide text-violet-100 hover:bg-violet-500/25 disabled:opacity-40"
          data-testid="setup-hub-update-all-addons"
        >
          Update all addons
        </button>
      </div>

      {isElectronApp() ? (
        <label className="mt-2 flex items-center gap-2 text-xs text-white/60">
          <input
            type="checkbox"
            checked={autoUpdateAddons}
            onChange={(e) => {
              setAutoUpdateAddons(e.target.checked);
              saveAddonAutoUpdateSetting(e.target.checked);
            }}
            data-testid="setup-hub-auto-update-addons"
          />
          Auto-update Open-Sora, Python embed, and FFmpeg after each environment scan
        </label>
      ) : null}

      {addonReport?.items?.length ? (
        <div
          className="mt-4 rounded-2xl border border-violet-400/20 bg-violet-500/5 p-3"
          data-testid="setup-hub-addon-updates"
        >
          <div className="text-xs font-bold uppercase tracking-wider text-violet-100/90">Addon updates</div>
          <ul className="mt-2 space-y-2">
            {addonReport.items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 p-2">
                <div>
                  <div className="text-sm font-semibold text-white">{item.label}</div>
                  <div className="text-xs text-white/55">
                    {item.currentVersion ? `Current: ${item.currentVersion}` : "Not installed"}
                    {item.latestVersion ? ` · Latest: ${item.latestVersion}` : ""}
                  </div>
                  <div className="text-xs text-white/45">{item.message}</div>
                </div>
                {item.updateAvailable ? (
                  <button
                    type="button"
                    disabled={addonBusy}
                    onClick={() => onUpdateOneAddon(item.id)}
                    className="rounded-lg border border-violet-400/30 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-100 hover:bg-violet-500/20 disabled:opacity-40"
                    data-testid={`setup-hub-update-addon-${item.id}`}
                  >
                    Update
                  </button>
                ) : (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-200/80">OK</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {missingChecklist.length > 0 ? (
        <div
          className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-500/5 p-3"
          data-testid="setup-hub-missing-checklist"
        >
          <div className="text-xs font-bold uppercase tracking-wider text-rose-100/90">
            Fix for local MP4 ({missingChecklist.length})
          </div>
          <ul className="mt-2 space-y-2">
            {missingChecklist.map((item) => (
              <li key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-2">
                <div className="text-sm font-semibold text-white">{item.label}</div>
                <div className="mt-1 text-xs text-white/55">{item.fixHint}</div>
                {item.scrollTarget ? (
                  <button
                    type="button"
                    className="mt-2 text-[10px] font-bold uppercase tracking-wide text-cyan-200/80 hover:text-cyan-100"
                    onClick={() => scrollToSetupTarget(item.scrollTarget)}
                  >
                    Go to fix ↓
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {modules.map((mod) => {
          const row = scan?.modules?.[mod.id];
          const status = row?.status || "unknown";
          return (
            <div
              key={mod.id}
              className="rounded-2xl border border-white/10 bg-black/25 p-3"
              data-testid={`setup-module-${mod.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-white">{mod.label}</div>
                  <div className="mt-0.5 text-xs text-white/45">{mod.description}</div>
                </div>
                <span
                  className={`shrink-0 rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLES[status] || STATUS_STYLES.unknown}`}
                >
                  {statusLabel(status)}
                </span>
              </div>
              {row?.message ? (
                <div className="mt-2 text-xs text-white/60">{row.message}</div>
              ) : null}
              {mod.scrollTarget ? (
                <button
                  type="button"
                  className="mt-2 text-[10px] font-bold uppercase tracking-wide text-cyan-200/80 hover:text-cyan-100"
                  onClick={() => scrollToSetupTarget(mod.scrollTarget)}
                >
                  Open panel ↓
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
        <div className="text-xs font-bold uppercase tracking-wider text-white/45">Link Open-Sora → Director</div>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            value={linkPath}
            onChange={(e) => setLinkPath(e.target.value)}
            placeholder="E:\\Open-Sora or clone path"
            className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none focus:border-cyan-300"
            data-testid="setup-hub-link-path"
          />
          <button
            type="button"
            disabled={!linkPath.trim()}
            onClick={onLinkOpenSora}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white/80 hover:bg-white/10 disabled:opacity-40"
            data-testid="setup-hub-link-open-sora"
          >
            Link path
          </button>
        </div>
      </div>
    </Panel>
  );
});
