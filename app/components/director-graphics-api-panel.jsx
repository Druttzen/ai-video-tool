"use client";

import { memo, useMemo } from "react";
import {
  applyRecommendedGraphicsStack,
  detectAvailableComputeBackends,
  detectAvailableGraphicsApis,
  formatGraphicsStackSummary,
  getComputeBackendOptions,
  getGraphicsApiOptions,
  getValidationModeOptions,
  isComputeBackendAvailable,
  isGraphicsApiAvailable,
  recommendGraphicsStack,
} from "../lib/graphics-api";
import { loadCachedSystemStats } from "../lib/system-stats";

const selectClass =
  "mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-2 text-sm text-white outline-none focus:border-violet-300/50";

export const DirectorGraphicsApiPanel = memo(function DirectorGraphicsApiPanel({
  settings,
  onChange,
  stats: statsProp,
}) {
  const stats = useMemo(() => statsProp ?? loadCachedSystemStats(), [statsProp]);
  const availableGfx = useMemo(() => detectAvailableGraphicsApis(stats), [stats]);
  const availableCompute = useMemo(() => detectAvailableComputeBackends(stats), [stats]);
  const recommendation = useMemo(() => recommendGraphicsStack(stats), [stats]);

  return (
    <div
      className="space-y-3 rounded-2xl border border-violet-300/15 bg-violet-500/5 p-4"
      data-testid="director-graphics-api-panel"
    >
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-violet-200/70">
          Graphics & compute API
        </div>
        <p className="mt-1 text-[11px] text-white/50">{formatGraphicsStackSummary(settings, stats)}</p>
        <p className="mt-0.5 text-[10px] text-white/35">Recommended: {recommendation.reason}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-xs">
          <span className="text-white/45">Graphics API</span>
          <select
            value={settings.graphicsApi || "auto"}
            onChange={(e) => onChange({ ...settings, graphicsApi: e.target.value })}
            data-testid="graphics-api-select"
            className={selectClass}
          >
            {getGraphicsApiOptions().map((api) => {
              const ok = isGraphicsApiAvailable(api.id, stats);
              return (
                <option key={api.id} value={api.id} disabled={!ok}>
                  {api.label}
                  {!ok ? " (unavailable)" : ""}
                </option>
              );
            })}
          </select>
        </label>

        <label className="block text-xs">
          <span className="text-white/45">Compute backend</span>
          <select
            value={settings.computeBackend || "auto"}
            onChange={(e) => onChange({ ...settings, computeBackend: e.target.value })}
            data-testid="compute-backend-select"
            className={selectClass}
          >
            {getComputeBackendOptions().map((be) => {
              const ok = isComputeBackendAvailable(be.id, stats);
              return (
                <option key={be.id} value={be.id} disabled={!ok}>
                  {be.label}
                  {!ok ? " (unavailable)" : ""}
                </option>
              );
            })}
          </select>
        </label>

        <label className="block text-xs">
          <span className="text-white/45">Debug / validation</span>
          <select
            value={settings.vulkanValidation || "off"}
            onChange={(e) => onChange({ ...settings, vulkanValidation: e.target.value })}
            className={selectClass}
          >
            {getValidationModeOptions().map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs">
          <span className="text-white/45">GPU device index</span>
          <select
            value={String(settings.gpuDeviceIndex ?? 0)}
            onChange={(e) => onChange({ ...settings, gpuDeviceIndex: Number(e.target.value) })}
            className={selectClass}
          >
            {[0, 1, 2, 3].map((i) => (
              <option key={i} value={i}>
                GPU {i}
                {i === 0 ? " (primary)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <details className="rounded-xl border border-white/10 bg-black/25 p-2 text-[10px] text-white/45">
        <summary className="cursor-pointer font-bold text-white/60">Detected on this PC</summary>
        <div className="mt-2 space-y-1">
          <div>Graphics: {availableGfx.filter((a) => a !== "auto").join(", ") || "scan in desktop app"}</div>
          <div>Compute: {availableCompute.filter((a) => a !== "auto" && a !== "cpu").join(", ") || "—"}</div>
        </div>
      </details>

      <button
        type="button"
        data-testid="apply-recommended-graphics"
        onClick={() => onChange(applyRecommendedGraphicsStack(settings, stats))}
        className="rounded-xl border border-violet-300/30 bg-violet-400/15 px-3 py-1.5 text-[11px] font-bold text-violet-100"
      >
        Apply recommended API stack
      </button>
    </div>
  );
});
