"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel } from "./ui-blocks";
import { PanelActions } from "./panel-actions";
import { useProjectWorkspace } from "../context/project-workspace-context";
import { loadDirectorSettingsFromStorage, saveDirectorSettingsToStorage } from "../lib/director-settings";
import { resolveRenderPythonFromScan } from "../lib/video-production-pipeline";
import { loadOpenSoraSettingsFromStorage } from "../lib/open-sora-settings";
import { getDefaultOpenSoraInstallPath } from "../lib/open-sora-paths";
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
  openExternalUrlFromHost,
  saveAddonAutoUpdateSetting,
  summarizeAddonUpdateReport,
  updateAddonFromHost,
  updateAllAddonsFromHost,
  scanMissingToolsFromHost,
  installToolsFromHost,
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
  const skipAutoUpdateRef = useRef(false);
  const forceManaged = Boolean(scan?.forceManaged);

  const modules = getSetupHubModules();
  const summary = useMemo(() => summarizeSetupScan(scan), [scan]);
  const missingChecklist = useMemo(() => getMissingSetupChecklist(scan), [scan]);

  const applyAddonUpdatePaths = useCallback((results, scanSnapshot) => {
    if (!Array.isArray(results)) return;
    const director = { ...loadDirectorSettingsFromStorage() };
    let changedDirector = false;

    for (const row of results) {
      if (!row?.ok || row.skipped) continue;
      if (row.id === "open-sora" && row.path) {
        linkOpenSoraToDirector(row.path);
        setLinkPath(row.path);
      }
      if ((row.id === "python" || row.id === "venv" || row.id === "pip-deps") && row.path) {
        director.localPythonPath = row.path;
        changedDirector = true;
      }
    }

    const scanRaw = scanSnapshot?.raw || scanSnapshot;
    if (scanRaw) {
      const python = resolveRenderPythonFromScan(scanRaw, director);
      if (python.localPythonPath && python.localPythonPath !== director.localPythonPath) {
        director.localPythonPath = python.localPythonPath;
        changedDirector = true;
      }
      if (python.preferWslRender) {
        director.preferWslRender = true;
        changedDirector = true;
      }
    } else {
      for (const row of results) {
        if (row.id === "wsl" && row.ok && row.path) {
          director.localPythonPath = row.path;
          director.preferWslRender = true;
          changedDirector = true;
        }
      }
    }

    if (changedDirector) {
      saveDirectorSettingsToStorage(director);
      window.dispatchEvent(new CustomEvent("director-settings-updated", { detail: director }));
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
        if (batch?.results) applyAddonUpdatePaths(batch.results, scanSnapshot);
        const rescan = await runSetupEnvironmentScan({
          directorSettings: loadDirectorSettingsFromStorage(),
          openSoraSettings: loadOpenSoraSettingsFromStorage(),
          coProducerLlmSettings: ws.coProducerLlmSettings,
        });
        if (rescan?.scan) {
          setScan(rescan.scan);
          if (batch?.results) applyAddonUpdatePaths(batch.results, rescan.scan);
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

  const runScan = useCallback(async ({ skipAutoUpdate = false } = {}) => {
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
        if (isElectronApp() && !skipAutoUpdate && !skipAutoUpdateRef.current) {
          await runAddonAutoUpdate(result.scan);
        }
      }
      ws.setStatusWithTime(
        result?.ok ? `Setup scan — ${summarizeSetupScan(result.scan).label}` : result?.error || "Scan failed",
        result?.ok ? "info" : "warning",
      );
    } finally {
      skipAutoUpdateRef.current = false;
      setBusy(false);
    }
  }, [ws, runAddonAutoUpdate]);

  useEffect(() => {
    setAutoUpdateAddons(loadAddonAutoUpdateSetting());
    const cached = loadPersistedSetupScan();
    if (cached) setScan(cached);
    setLinkPath(loadOpenSoraSettingsFromStorage().installPath || getDefaultOpenSoraInstallPath());
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
    void runScan({ skipAutoUpdate: true });
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

  const onScanMissingTools = async () => {
    setAddonBusy(true);
    try {
      const report = await scanMissingToolsFromHost();
      if (report?.items) setAddonReport({ ok: report.ok, checkedAt: report.scannedAt, items: report.items });
      ws.setStatusWithTime(report?.summary || "Tool scan complete", report?.ok ? "info" : "warning");
    } finally {
      setAddonBusy(false);
    }
  };

  const onInstallAllTools = async () => {
    setAddonBusy(true);
    try {
      skipAutoUpdateRef.current = true;
      const batch = await installToolsFromHost({ forcePipeline: true });
      if (batch?.launched) {
        ws.setStatusWithTime(batch.message || "Install Addons CMD opened", "info");
        return;
      }
      if (batch?.postScan?.items) setAddonReport({ ok: batch.postScan.ok, checkedAt: batch.postScan.scannedAt, items: batch.postScan.items });
      if (batch?.results) applyAddonUpdatePaths(batch.results, scan);
      await runScan({ skipAutoUpdate: true });
      const latest = loadPersistedSetupScan();
      if (batch?.results && latest) applyAddonUpdatePaths(batch.results, latest);
      ws.setStatusWithTime(batch?.ok ? "Tool install finished" : "Some tools failed to install", batch?.ok ? "info" : "warning");
    } finally {
      setAddonBusy(false);
    }
  };

  const onUpdateAllAddons = async () => {
    setAddonBusy(true);
    try {
      skipAutoUpdateRef.current = true;
      const batch = await installToolsFromHost({ forcePipeline: false });
      if (batch?.launched) {
        ws.setStatusWithTime(batch.message || "Install Addons CMD opened", "info");
        return;
      }
      if (batch?.postScan?.items) {
        setAddonReport({
          ok: batch.postScan.ok,
          checkedAt: batch.postScan.scannedAt,
          items: batch.postScan.items,
        });
      }
      if (batch?.results) applyAddonUpdatePaths(batch.results, scan);
      await runScan({ skipAutoUpdate: true });
      const latest = loadPersistedSetupScan();
      if (batch?.results && latest) applyAddonUpdatePaths(batch.results, latest);
      ws.setStatusWithTime(
        batch?.ok ? "Addon updates finished — rescan complete" : "Some addon updates failed",
        batch?.ok ? "info" : "warning",
      );
    } finally {
      setAddonBusy(false);
    }
  };

  const onUpdateOneAddon = async (addonId, item) => {
    if (item?.needsManualInstall && item?.installUrl) {
      await openExternalUrlFromHost(item.installUrl);
      ws.setStatusWithTime("Opened Git installer — install Git then run Update all addons", "info");
      return;
    }
    setAddonBusy(true);
    try {
      skipAutoUpdateRef.current = true;
      const result = await updateAddonFromHost({
        addonId,
        scan,
        openSoraPath: linkPath,
        directorSettings: loadDirectorSettingsFromStorage(),
      });
      applyAddonUpdatePaths([{ id: addonId, ...result }], scan);
      await runScan({ skipAutoUpdate: true });
      const latest = loadPersistedSetupScan();
      if (latest) applyAddonUpdatePaths([{ id: addonId, ...result }], latest);
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
      hint="Scan managed addons under AppData — Python, venv, Open-Sora, pip deps, FFmpeg, models. Use Install Addons (CMD) or Install all tools here."
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
          onClick={() => runScan()}
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
          onClick={onScanMissingTools}
          className="rounded-xl border border-amber-400/35 bg-amber-500/15 px-4 py-2 text-xs font-bold uppercase tracking-wide text-amber-100 hover:bg-amber-500/25 disabled:opacity-40"
          data-testid="setup-hub-scan-missing-tools"
        >
          Scan missing tools
        </button>
        <button
          type="button"
          disabled={busy || addonBusy || !isElectronApp()}
          onClick={onInstallAllTools}
          className="rounded-xl border border-violet-400/35 bg-violet-500/15 px-4 py-2 text-xs font-bold uppercase tracking-wide text-violet-100 hover:bg-violet-500/25 disabled:opacity-40"
          data-testid="setup-hub-install-all-tools"
        >
          Install all tools
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
          Auto-update all managed tools (Git check, Node.js, Python, venv, Open-Sora, requirements, pip/torch, FFmpeg, models, WSL) after each scan
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
                  item.needsManualInstall && item.installUrl ? (
                    <button
                      type="button"
                      disabled={addonBusy}
                      onClick={() => onUpdateOneAddon(item.id, item)}
                      className="rounded-lg border border-amber-400/30 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-100 hover:bg-amber-500/20 disabled:opacity-40"
                      data-testid={`setup-hub-install-addon-${item.id}`}
                    >
                      Install
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={addonBusy}
                      onClick={() => onUpdateOneAddon(item.id, item)}
                      className="rounded-lg border border-violet-400/30 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-100 hover:bg-violet-500/20 disabled:opacity-40"
                      data-testid={`setup-hub-update-addon-${item.id}`}
                    >
                      Update
                    </button>
                  )
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
        <div className="text-xs font-bold uppercase tracking-wider text-white/45">
          {forceManaged ? "Managed Open-Sora path (AppData)" : "Open-Sora install path"}
        </div>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            value={linkPath}
            onChange={(e) => setLinkPath(e.target.value)}
            readOnly={forceManaged}
            placeholder={getDefaultOpenSoraInstallPath()}
            className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none focus:border-cyan-300 read-only:opacity-70"
            data-testid="setup-hub-link-path"
          />
          {!forceManaged ? (
            <button
              type="button"
              disabled={!linkPath.trim()}
              onClick={onLinkOpenSora}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white/80 hover:bg-white/10 disabled:opacity-40"
              data-testid="setup-hub-link-open-sora"
            >
              Link path
            </button>
          ) : null}
        </div>
        {forceManaged ? (
          <div className="mt-2 text-xs text-white/45">
            Managed mode — Open-Sora is installed under AppData via Install Addons. Custom paths are ignored.
          </div>
        ) : null}
      </div>
    </Panel>
  );
});
