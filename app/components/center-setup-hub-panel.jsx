"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Panel } from "./ui-blocks";
import { PanelActions } from "./panel-actions";
import { useProjectWorkspace } from "../context/project-workspace-context";
import { loadDirectorSettingsFromStorage } from "../lib/director-settings";
import { loadOpenSoraSettingsFromStorage } from "../lib/open-sora-settings";
import {
  applyMaxedStandaloneProfile,
  getSetupHubModules,
  linkOpenSoraToDirector,
  runSetupEnvironmentScan,
  scrollToSetupTarget,
  SETUP_HUB_EVENT,
  summarizeSetupScan,
} from "../lib/setup-hub";
import { PROJECT_RESET_EVENT } from "../lib/project-reset";
import { isElectronApp } from "../lib/electron-bridge";

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

  const modules = getSetupHubModules();
  const summary = useMemo(() => summarizeSetupScan(scan), [scan]);

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
      if (result?.scan) setScan(result.scan);
      ws.setStatusWithTime(
        result?.ok ? `Setup scan — ${summarizeSetupScan(result.scan).label}` : result?.error || "Scan failed",
        result?.ok ? "info" : "warning",
      );
    } finally {
      setBusy(false);
    }
  }, [ws]);

  useEffect(() => {
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
    const onProjectReset = () => setScan(null);
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
          onClear={() => setScan(null)}
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
          disabled={busy || !isElectronApp()}
          onClick={onApplyMaxed}
          className="rounded-xl border border-emerald-400/35 bg-emerald-500/15 px-4 py-2 text-xs font-bold uppercase tracking-wide text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-40"
          data-testid="setup-hub-apply-maxed"
        >
          Apply maxed profile
        </button>
      </div>

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
