"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Panel } from "./ui-blocks";
import { PanelActions } from "./panel-actions";
import { isElectronApp } from "../lib/electron-bridge";
import { loadDirectorSettingsFromStorage, saveDirectorSettingsToStorage } from "../lib/director-settings";
import {
  applyGpuWorkflowPreset,
  DEFAULT_GPU_WORKFLOW_SETTINGS,
  formatGpuWorkflowSummary,
  getGpuFunctionAvailability,
  getGpuWorkflowFunctions,
  getGpuWorkflowPresets,
  loadGpuWorkflowSettings,
  runGpuWorkflowPipeline,
  saveGpuWorkflowSettings,
  toggleGpuWorkflowFunction,
} from "../lib/gpu-workflow-functions";
import { PROJECT_RESET_EVENT } from "../lib/project-reset";
import { scrollToPanel } from "../lib/music-video-workflows";
import { useProjectWorkspace } from "../context/project-workspace-context";

const CATEGORY_LABELS = {
  preflight: "Preflight",
  optimize: "Optimize",
  quality: "Quality",
  fx: "FX",
  render: "Render",
  batch: "Batch",
  ui: "UI",
};

export const CenterGpuWorkflowPanel = memo(function CenterGpuWorkflowPanel() {
  const ws = useProjectWorkspace();
  const [gpuSettings, setGpuSettings] = useState(loadGpuWorkflowSettings);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const functions = getGpuWorkflowFunctions();
  const presets = getGpuWorkflowPresets();
  const hasPipeline = Boolean(String(loadDirectorSettingsFromStorage().localPipelinePath || "").trim());

  const persistGpu = useCallback((next) => {
    setGpuSettings(next);
    saveGpuWorkflowSettings(next);
  }, []);

  useEffect(() => {
    setGpuSettings(loadGpuWorkflowSettings());
  }, []);

  useEffect(() => {
    const onProjectReset = () => {
      setGpuSettings({ ...DEFAULT_GPU_WORKFLOW_SETTINGS });
      setLastResult(null);
    };
    window.addEventListener(PROJECT_RESET_EVENT, onProjectReset);
    return () => window.removeEventListener(PROJECT_RESET_EVENT, onProjectReset);
  }, []);

  const ctx = useMemo(
    () => ({
      isElectron: isElectronApp(),
      hasPipeline,
      hasImageRef: Boolean(ws.imageAnalysis && ws.imagePreview),
    }),
    [hasPipeline, ws.imageAnalysis, ws.imagePreview],
  );

  const runPipeline = useCallback(
    async (hook = "workflow") => {
      setBusy(true);
      try {
        const settings = loadDirectorSettingsFromStorage();
        const result = await runGpuWorkflowPipeline({
          settings,
          gpuSettings,
          hook,
          hasImageRef: ctx.hasImageRef,
          promptLength: ws.idea?.length || 0,
        });
        setLastResult(result);
        if (result.ok && result.settings) {
          saveDirectorSettingsToStorage(result.settings);
        }
        ws.setStatusWithTime(formatGpuWorkflowSummary(result), result.ok ? "info" : "warning");
        return result;
      } finally {
        setBusy(false);
      }
    },
    [gpuSettings, ctx.hasImageRef, ws],
  );

  const onToggle = (id, enabled) => {
    persistGpu(toggleGpuWorkflowFunction(gpuSettings, id, enabled));
  };

  const onPreset = (key) => {
    persistGpu(applyGpuWorkflowPreset(gpuSettings, key));
    ws.setStatusWithTime(`GPU preset: ${presets[key]?.label || key}`);
  };

  const grouped = useMemo(() => {
    const map = {};
    for (const fn of functions) {
      const cat = fn.category || "other";
      if (!map[cat]) map[cat] = [];
      map[cat].push(fn);
    }
    return map;
  }, [functions]);

  return (
    <Panel
      title="GPU Workflow Enhancements"
      hint="Add GPU-powered steps to your music-video and Director workflows. Toggle functions, apply a preset, or run preflight now."
      data-testid="gpu-workflow-panel"
      actions={
        <PanelActions
          topic="gpuWorkflow"
          onClear={() => {
            persistGpu({ ...DEFAULT_GPU_WORKFLOW_SETTINGS });
            setLastResult(null);
          }}
        />
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {Object.entries(presets).map(([key, preset]) => (
          <button
            key={key}
            type="button"
            data-testid={`gpu-preset-${key}`}
            onClick={() => onPreset(key)}
            className={`rounded-full border px-3 py-1 text-[11px] font-bold ${
              gpuSettings.activePreset === key
                ? "border-violet-300 bg-violet-400/20 text-violet-100"
                : "border-white/15 text-white/60 hover:bg-white/10"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-3 text-xs text-white/65">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={gpuSettings.autoRunOnWorkflow !== false}
            onChange={(e) => persistGpu({ ...gpuSettings, autoRunOnWorkflow: e.target.checked })}
          />
          Auto-run on workflow paths 1–5
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={gpuSettings.autoRunBeforeRender !== false}
            onChange={(e) => persistGpu({ ...gpuSettings, autoRunBeforeRender: e.target.checked })}
          />
          Auto-run before render
        </label>
        <label className="flex items-center gap-2">
          <span className="text-white/45">VRAM guard</span>
          <select
            value={gpuSettings.vramGuardMode || "warn"}
            onChange={(e) => persistGpu({ ...gpuSettings, vramGuardMode: e.target.value })}
            className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-white"
          >
            <option value="warn">Warn</option>
            <option value="block">Block</option>
          </select>
        </label>
      </div>

      {Object.entries(grouped).map(([category, fns]) => (
        <div key={category} className="mb-4">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/40">
            {CATEGORY_LABELS[category] || category}
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {fns.map((fn) => {
              const enabled = gpuSettings.enabledIds?.includes(fn.id);
              const avail = getGpuFunctionAvailability(fn, {
                ...ctx,
                pipelinePath: loadDirectorSettingsFromStorage().localPipelinePath,
              });
              return (
                <label
                  key={fn.id}
                  data-testid={`gpu-fn-${fn.id}`}
                  className={`flex cursor-pointer gap-3 rounded-2xl border p-3 ${
                    enabled ? "border-violet-400/35 bg-violet-500/10" : "border-white/10 bg-black/25"
                  } ${!avail.available ? "opacity-55" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={enabled}
                    disabled={!avail.available}
                    onChange={(e) => onToggle(fn.id, e.target.checked)}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-white">{fn.label}</span>
                    <span className="mt-0.5 block text-[10px] leading-relaxed text-white/50">{fn.description}</span>
                    {!avail.available ? (
                      <span className="mt-1 block text-[10px] text-amber-300/90">{avail.reason}</span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ))}

      {gpuSettings.enabledIds?.includes("seed-variations") ? (
        <label className="mb-4 block text-xs text-white/70">
          <span className="text-white/45">Seed variations per build</span>
          <input
            type="number"
            min={2}
            max={4}
            value={gpuSettings.seedVariationCount || 3}
            onChange={(e) =>
              persistGpu({ ...gpuSettings, seedVariationCount: Number(e.target.value) || 3 })
            }
            className="mt-1 w-24 rounded-xl border border-white/10 bg-black/30 p-2 text-white"
          />
        </label>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          data-testid="gpu-run-preflight"
          onClick={() => runPipeline("workflow")}
          className="rounded-2xl bg-violet-300 px-4 py-2 text-xs font-bold text-black disabled:opacity-40"
        >
          {busy ? "Running…" : "Run GPU preflight"}
        </button>
        <button
          type="button"
          onClick={() => scrollToPanel("director-panel")}
          className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-white"
        >
          Open Director
        </button>
      </div>

      {lastResult ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 text-[11px] text-white/60">
          <div className="font-bold text-white/80">
            {lastResult.ok ? "GPU pipeline OK" : "GPU pipeline blocked"}
          </div>
          {lastResult.applied?.length ? (
            <div className="mt-1">Applied: {lastResult.applied.join(" · ")}</div>
          ) : null}
          {lastResult.buildPlan?.estimatedLabel ? (
            <div className="mt-1">Est. build: {lastResult.buildPlan.estimatedLabel}</div>
          ) : null}
          {lastResult.warnings?.map((w) => (
            <div key={w} className="mt-1 text-amber-200/90">
              ⚠ {w}
            </div>
          ))}
          {lastResult.blockers?.map((b) => (
            <div key={b} className="mt-1 text-rose-300">
              ✕ {b}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-[10px] text-white/35">
          {gpuSettings.enabledIds?.length || 0} functions enabled
          {!isElectronApp() ? " · Desktop app unlocks local GPU render & seed batch" : ""}
        </p>
      )}
    </Panel>
  );
});
