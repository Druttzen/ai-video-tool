"use client";

import { memo } from "react";
import { Panel, Pill, Slider } from "./ui-blocks";
import { PanelActions } from "./panel-actions";
import { stylePresets } from "../lib/video-config";
import { useProjectWorkspace } from "../context/project-workspace-context";
import { confirmProjectReset } from "../lib/project-reset";
import { scrollToSetupTarget } from "../lib/setup-hub";
import { isElectronApp, openCanvasDashboard } from "../lib/electron-bridge";
import { buildCanvasPayloadFromWorkspace } from "../lib/canvas-payload";

export const PageSidebarLeft = memo(function PageSidebarLeft() {
  const {
    audioAnalysis,
    imageAnalysis,
    idea,
    tempo,
    structure,
    selectedGenres,
    selectedRhythms,
    selectedSounds,
    agentProductionState,
    agentProductionPhase,
    agentMessages,
    coProducerLlmSettings,
    applyPreset,
    customPresets,
    deleteCustomPreset,
    exportProject,
    importProject,
    intensityText,
    loadPresetObject,
    mode,
    presetName,
    proMode,
    promptIntensity,
    resetAll,
    revertSnapshot,
    saveCustomPreset,
    saveProject,
    setMode,
    setPresetName,
    setProMode,
    setPromptIntensity,
    setStatusWithTime,
    setVariationCount,
    variationCount,
  } = useProjectWorkspace();

  return (
    <aside className="space-y-4">
      {isElectronApp() ? (
        <Panel
          title="Setup Hub"
          hint="Scan, install managed tools, and configure local MP4 render."
          actions={<PanelActions topic="setup-hub" clearDisabled />}
        >
          <button
            type="button"
            onClick={() => scrollToSetupTarget("setup-hub-panel")}
            className="w-full rounded-2xl border border-cyan-400/35 bg-cyan-500/15 px-4 py-3 text-left text-sm font-bold text-cyan-100 hover:bg-cyan-500/25"
            data-testid="sidebar-setup-hub-jump"
          >
            Open Setup Hub ↓
          </button>
          <p className="mt-2 text-xs text-white/50">
            Git · Node.js · Python · venv · Open-Sora · torch · FFmpeg · WSL
          </p>
          <button
            type="button"
            onClick={async () => {
              const payload = buildCanvasPayloadFromWorkspace({
                idea,
                tempo,
                structure,
                selectedGenres,
                selectedRhythms,
                selectedSounds,
                audioAnalysis,
                imageAnalysis,
                production: agentProductionState,
                agentProductionState,
                coProducerLlmSettings,
                agentPhase: agentProductionPhase,
                agentMessages,
              });
              const res = await openCanvasDashboard(payload);
              if (!res?.ok) {
                setStatusWithTime(res?.error || "Could not open canvas", "error");
                return;
              }
              setStatusWithTime(res.reused ? "Canvas updated" : "Canvas opened", "info");
            }}
            className="mt-3 w-full rounded-2xl border border-violet-400/35 bg-violet-500/15 px-4 py-3 text-left text-sm font-bold text-violet-100 hover:bg-violet-500/25"
            data-testid="sidebar-open-canvas"
          >
            Open Project Canvas
          </button>
        </Panel>
      ) : null}

      <Panel
        title="Style Presets"
        hint="Load factory or custom styles."
        actions={<PanelActions topic="presets" clearDisabled />}
      >
        <div className="space-y-2">
          {Object.keys(stylePresets).map((name) => (
            <button
              key={name}
              onClick={() => applyPreset(name)}
              className="w-full rounded-2xl border border-white/10 bg-black/25 p-3 text-left text-sm font-bold hover:border-cyan-300/50 hover:bg-cyan-300/10"
            >
              {name}
            </button>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-orange-400/20 bg-orange-400/10 p-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-orange-200">
            Save Current As Preset
          </div>
          <input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Preset name..."
            className="mb-2 w-full rounded-xl border border-white/10 bg-black/30 p-2 text-sm text-white outline-none"
          />
          <button
            onClick={saveCustomPreset}
            className="w-full rounded-xl bg-orange-300 px-3 py-2 text-sm font-bold text-black hover:bg-orange-200"
          >
            Save As Preset
          </button>
        </div>
        {Object.keys(customPresets).length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-white/45">Custom Presets</div>
            {Object.entries(customPresets).map(([name, p]) => (
              <div key={name} className="rounded-2xl border border-white/10 bg-black/25 p-2">
                <button
                  onClick={() => loadPresetObject(name, p)}
                  className="w-full text-left text-sm font-bold text-cyan-100"
                >
                  {name}
                </button>
                <button
                  onClick={() => deleteCustomPreset(name)}
                  className="mt-2 text-xs font-bold text-red-300 hover:text-red-200"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Save / Load"
        hint="Export bundle includes project state, custom style presets, and voice character profile. Legacy flat JSON still imports."
        actions={
          <PanelActions
            topic="save-load"
            onSave={saveProject}
            onLoad={() => document.getElementById("global-import-bundle")?.click()}
            onClear={async () => {
              if (!(await confirmProjectReset())) return;
              resetAll();
            }}
            clearLabel="Reset"
          />
        }
      >
        <div className="grid gap-2">
          <button onClick={saveProject} className="rounded-2xl bg-emerald-300 px-4 py-2 font-bold text-black hover:bg-emerald-200">
            Save Progress
          </button>
          <button
            type="button"
            onClick={() => document.getElementById("global-import-bundle")?.click()}
            className="rounded-2xl bg-white px-4 py-2 font-bold text-black hover:bg-cyan-100"
          >
            Import Bundle
          </button>
          <button onClick={exportProject} className="rounded-2xl bg-cyan-300 px-4 py-2 font-bold text-black hover:bg-cyan-200">
            Export Bundle
          </button>
          <button
            onClick={revertSnapshot}
            className="rounded-2xl border border-amber-400/40 bg-amber-500/15 px-4 py-2 font-bold text-amber-100 hover:bg-amber-500/25"
          >
            Revert to last snapshot
          </button>
          <button
            onClick={async () => {
              if (!(await confirmProjectReset())) return;
              resetAll();
            }}
            className="rounded-2xl bg-red-400 px-4 py-2 font-bold text-black hover:bg-red-300"
            title="Clears all preselected style, prompts, analyzers, and history"
          >
            Reset to Default
          </button>
        </div>
      </Panel>

      <Panel title="Mode" hint="Controls stability vs creativity." actions={<PanelActions topic="global" clearDisabled />}>
        <div className="grid grid-cols-3 gap-2">
          {["Control", "Hybrid", "Chaos"].map((m) => (
            <Pill
              key={m}
              active={mode === m}
              onClick={() => {
                setMode(m);
                setStatusWithTime(`Mode: ${m}`, "info");
              }}
            >
              {m}
            </Pill>
          ))}
        </div>
      </Panel>

      <Panel title="Pro Mode" hint="Advanced controls and stronger prompt shaping." actions={<PanelActions topic="pro-mode" clearDisabled />}>
        <button
          onClick={() => {
            const next = !proMode;
            setProMode(next);
            setStatusWithTime(next ? "Pro Mode enabled" : "Pro Mode disabled", "info");
          }}
          className={
            "w-full rounded-2xl px-4 py-2 font-bold transition active:scale-[0.98] " +
            (proMode ? "bg-purple-300 text-black" : "bg-black/40 text-white border border-white/10")
          }
        >
          {proMode ? "Pro Mode ON" : "Pro Mode OFF"}
        </button>
        {proMode && (
          <div className="mt-3 space-y-3">
            <Slider
              label="Prompt Intensity"
              value={promptIntensity}
              left="safe"
              right="experimental"
              setValue={setPromptIntensity}
            />
            <Slider
              label="Variations"
              value={variationCount}
              left="1"
              right="8"
              min={1}
              max={8}
              setValue={setVariationCount}
            />
            <div className="rounded-2xl border border-purple-300/20 bg-purple-300/10 p-3 text-xs text-purple-100">
              {intensityText}
            </div>
          </div>
        )}
      </Panel>
    </aside>
  );
});
