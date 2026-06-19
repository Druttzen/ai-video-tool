"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  classifyHardwareTier,
  formatSystemStatsSummary,
  getHardwareTierLimits,
  HARDWARE_TIER_LIMITS,
  optimizeDirectorSettingsForHardware,
} from "../lib/director-hardware-optimize";
import { gatherSystemStats, loadCachedSystemStats } from "../lib/system-stats";
import { isElectronApp } from "../lib/electron-bridge";

const RESOLUTION_OPTIONS = ["256px", "384px", "512px", "768px", "1024px"];

export const DirectorHardwarePanel = memo(function DirectorHardwarePanel({
  settings,
  onApplySettings,
  onStatus,
  compact = false,
}) {
  const [stats, setStats] = useState(null);
  const [scanBusy, setScanBusy] = useState(false);

  useEffect(() => {
    setStats(loadCachedSystemStats());
  }, []);

  const tier = useMemo(() => classifyHardwareTier(stats), [stats]);
  const limits = useMemo(() => getHardwareTierLimits(tier), [tier]);

  const runScan = useCallback(async () => {
    setScanBusy(true);
    try {
      const next = await gatherSystemStats();
      setStats(next);
      onStatus?.(
        next.source === "electron"
          ? "Hardware scan complete (native)"
          : "Hardware estimate from browser",
      );
      if (settings.autoOptimizeFromHardware !== false) {
        const { settings: optimized } = optimizeDirectorSettingsForHardware(settings, next, {
          force: true,
        });
        onApplySettings(optimized);
        onStatus?.(`Build optimized for ${getHardwareTierLimits(classifyHardwareTier(next)).label} tier`);
      }
    } catch (e) {
      onStatus?.(e?.message || "Scan failed");
    } finally {
      setScanBusy(false);
    }
  }, [onApplySettings, onStatus, settings]);

  useEffect(() => {
    if (settings.autoOptimizeFromHardware === false || stats) return;
    runScan();
  }, [settings.autoOptimizeFromHardware, stats, runScan]);

  const applyOptimized = () => {
    const { settings: optimized, tier: t } = optimizeDirectorSettingsForHardware(settings, stats, {
      force: true,
    });
    onApplySettings(optimized);
    onStatus?.(`Applied ${getHardwareTierLimits(t).label} build limits`);
  };

  if (compact) {
    return (
      <div className="rounded-2xl border border-violet-300/20 bg-violet-500/5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-violet-200/70">
              System · {limits.label} tier
            </div>
            <p className="mt-1 text-[11px] text-white/55">{formatSystemStatsSummary(stats)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={scanBusy}
              onClick={runScan}
              className="rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-[11px] font-bold text-white/80"
            >
              {scanBusy ? "Scanning…" : "Scan hardware"}
            </button>
            <button
              type="button"
              onClick={applyOptimized}
              className="rounded-xl border border-violet-300/30 bg-violet-400/15 px-3 py-1.5 text-[11px] font-bold text-violet-100"
            >
              Maximize build
            </button>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-white/40">
          Up to {limits.resolution} · {limits.numSteps} steps · {limits.numFrames} frames · motion {limits.motionScore}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-violet-300/20 bg-black/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-violet-200/80">
            System & build optimizer
          </div>
          <p className="mt-1 text-[11px] text-white/50">
            Scans CPU, RAM, and GPU to push video build settings to your machine&apos;s safe maximum — fewer artificial caps.
          </p>
        </div>
        <span className="rounded-full border border-violet-300/30 bg-violet-400/10 px-2 py-0.5 text-[10px] font-bold text-violet-100">
          {limits.label}
        </span>
      </div>

      <pre className="whitespace-pre-wrap rounded-xl border border-white/5 bg-black/40 p-3 text-[11px] text-white/65">
        {stats
          ? [
              formatSystemStatsSummary(stats),
              stats.freeMemGb != null ? `Free RAM: ${stats.freeMemGb} GB` : null,
              stats.source === "electron" ? "Source: native desktop scan" : "Source: browser estimate",
              isElectronApp() ? null : "Tip: use desktop app for exact VRAM",
            ]
              .filter(Boolean)
              .join("\n")
          : "No scan yet — click Scan hardware"}
      </pre>

      <label className="flex items-center gap-2 text-xs text-white/70">
        <input
          type="checkbox"
          checked={settings.autoOptimizeFromHardware !== false}
          onChange={(e) =>
            onApplySettings({ ...settings, autoOptimizeFromHardware: e.target.checked })
          }
        />
        Auto-optimize build when hardware is scanned
      </label>

      <label className="block text-xs">
        <span className="text-white/45">Resolution tier</span>
        <select
          value={settings.resolution || limits.resolution}
          onChange={(e) => onApplySettings({ ...settings, resolution: e.target.value })}
          className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white"
        >
          {RESOLUTION_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
              {r === limits.resolution ? " (tier max)" : ""}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-2 sm:grid-cols-2">
        {Object.entries(HARDWARE_TIER_LIMITS).map(([key, row]) => (
          <div
            key={key}
            className={`rounded-xl border p-2 text-[10px] ${
              key === tier
                ? "border-violet-300/40 bg-violet-400/10 text-violet-50"
                : "border-white/5 text-white/45"
            }`}
          >
            <div className="font-bold">{row.label}</div>
            <div className="mt-1 opacity-80">
              {row.resolution} · {row.numSteps} steps · {row.numFrames} fr · {row.qualityPreset}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={scanBusy}
          onClick={runScan}
          data-testid="scan-hardware"
          className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-white"
        >
          {scanBusy ? "Scanning…" : "Scan hardware"}
        </button>
        <button
          type="button"
          onClick={applyOptimized}
          data-testid="maximize-build"
          className="rounded-xl border border-violet-300/30 bg-violet-400/20 px-4 py-2 text-xs font-bold text-violet-100"
        >
          Maximize build for this PC
        </button>
      </div>

      <p className="text-[10px] text-white/35">{limits.notes}</p>
    </div>
  );
});
