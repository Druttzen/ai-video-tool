"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { Panel } from "./ui-blocks";
import { getOpenSoraAspectRatios, getOpenSoraConfigPresets } from "../lib/open-sora-catalog";
import {
  applyOpenSoraPreset,
  DEFAULT_OPEN_SORA_SETTINGS,
  loadOpenSoraSettingsFromStorage,
  OPEN_SORA_PRESETS,
  saveOpenSoraSettingsToStorage,
} from "../lib/open-sora-settings";
import { buildOpenSoraJobPayload } from "../lib/open-sora-prompt-builder";
import { launchOpenSoraAppUi, sendToOpenSora } from "../lib/open-sora-launch";
import { isElectronApp } from "../lib/electron-bridge";
import { trackLaunchBuildProgress, useVideoBuild } from "../context/video-build-context";
import { useProjectWorkspace } from "../context/project-workspace-context";

export const CenterOpenSoraExportPanel = memo(function CenterOpenSoraExportPanel() {
  const ws = useProjectWorkspace();
  const { startBuildProgress, isBuilding } = useVideoBuild();
  const [settings, setSettings] = useState(DEFAULT_OPEN_SORA_SETTINGS);
  const [sendBusy, setSendBusy] = useState(false);
  const [lastLaunch, setLastLaunch] = useState(null);
  const configPresets = getOpenSoraConfigPresets();
  const aspectRatios = getOpenSoraAspectRatios();

  useEffect(() => {
    setSettings(loadOpenSoraSettingsFromStorage());
  }, []);

  const persist = (next) => {
    setSettings(next);
    saveOpenSoraSettingsToStorage(next);
  };

  const projectFields = useMemo(
    () => ({
      idea: ws.idea,
      selectedGenres: ws.selectedGenres,
      selectedRhythms: ws.selectedRhythms,
      selectedSounds: ws.selectedSounds,
      mood: ws.mood,
      rules: ws.rules,
      structure: ws.structure,
      vocal: ws.vocal,
      lyricTheme: ws.lyricTheme,
      lyricStructure: ws.lyricStructure,
      generatedLyrics: ws.generatedLyrics,
      imageAnalysis: ws.imageAnalysis,
      tempo: ws.tempo,
    }),
    [
      ws.idea,
      ws.selectedGenres,
      ws.selectedRhythms,
      ws.selectedSounds,
      ws.mood,
      ws.rules,
      ws.structure,
      ws.vocal,
      ws.lyricTheme,
      ws.lyricStructure,
      ws.generatedLyrics,
      ws.imageAnalysis,
      ws.tempo,
    ],
  );

  const job = useMemo(() => buildOpenSoraJobPayload(projectFields, settings), [projectFields, settings]);
  const hasImageRef = Boolean(ws.imageAnalysis && ws.imagePreview);

  const handleSend = async () => {
    if (!job.prompt || sendBusy || isBuilding) return;
    setSendBusy(true);
    try {
      let imagePayload = null;
      if (settings.useI2vWhenImage && hasImageRef && ws.readImageSourceForOpenSora) {
        imagePayload = await ws.readImageSourceForOpenSora();
      }
      const result = await sendToOpenSora({ project: projectFields, settings, imagePayload, mode: "pipeline" });
      setLastLaunch(result);
      trackLaunchBuildProgress(startBuildProgress, result, {
        title: "Open-Sora render",
        estimatedSeconds: settings.estimatedBuildSeconds || 240,
        estimatedLabel: settings.estimatedBuildLabel || "≈4 min",
      });
      if (result.ok) {
        const i2vNote = imagePayload ? " (i2v ref attached)" : "";
        ws.setStatusWithTime(
          result.fallback ? result.message : `${result.message || "Open-Sora job started"}${i2vNote}`,
        );
      } else {
        ws.setStatusWithTime(result.error || "Open-Sora launch failed");
      }
    } catch (e) {
      ws.setStatusWithTime(e?.message || "Open-Sora launch failed");
    } finally {
      setSendBusy(false);
    }
  };

  return (
    <Panel
      title="Open-Sora Render"
      hint="Pipeline settings aligned with Open-Sora 2.0 inference.py — Send writes job JSON and runs locally"
      data-testid="open-sora-export-panel"
    >
      <label className="block">
        <div className="mb-1 text-xs font-bold uppercase tracking-wider text-white/45">Install path</div>
        <input
          value={settings.installPath}
          onChange={(e) => persist({ ...settings, installPath: e.target.value })}
          className="w-full rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none focus:border-cyan-300"
        />
      </label>

      <label className="mt-2 block">
        <div className="mb-1 text-xs font-bold uppercase tracking-wider text-white/45">Inference config</div>
        <select
          value={settings.configPreset}
          onChange={(e) => persist({ ...settings, configPreset: e.target.value })}
          className="w-full rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none focus:border-cyan-300"
        >
          {configPresets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {Object.entries(OPEN_SORA_PRESETS).map(([key, p]) => (
          <button
            key={key}
            type="button"
            onClick={() => persist(applyOpenSoraPreset(settings, key))}
            className={`rounded-2xl border px-3 py-2 text-xs font-bold ${
              settings.preset === key
                ? "border-cyan-300 bg-cyan-300/20 text-cyan-100"
                : "border-white/10 bg-black/25 text-white/60 hover:bg-white/10"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <label className="block text-xs">
          <span className="text-white/45">Denoise steps</span>
          <input
            type="number"
            value={settings.numSteps}
            onChange={(e) => persist({ ...settings, numSteps: Number(e.target.value) })}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white"
          />
        </label>
        <label className="block text-xs">
          <span className="text-white/45">Frames (4k+1)</span>
          <input
            type="number"
            value={settings.numFrames}
            onChange={(e) => persist({ ...settings, numFrames: Number(e.target.value) })}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white"
          />
        </label>
        <label className="block text-xs">
          <span className="text-white/45">CFG / guidance</span>
          <input
            type="number"
            step="0.1"
            value={settings.cfg}
            onChange={(e) => persist({ ...settings, cfg: Number(e.target.value) })}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white"
          />
        </label>
        <label className="block text-xs">
          <span className="text-white/45">Motion (1–15)</span>
          <input
            type="number"
            min={1}
            max={15}
            value={settings.motionScore}
            onChange={(e) => persist({ ...settings, motionScore: Number(e.target.value) })}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white"
          />
        </label>
        <label className="block text-xs">
          <span className="text-white/45">Aspect ratio</span>
          <select
            value={settings.aspectRatio}
            onChange={(e) => persist({ ...settings, aspectRatio: e.target.value })}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white"
          >
            {aspectRatios.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-white/45">FPS (export)</span>
          <input
            type="number"
            value={settings.fps}
            onChange={(e) => persist({ ...settings, fps: Number(e.target.value) })}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white"
          />
        </label>
        <label className="block text-xs">
          <span className="text-white/45">Seed (0 = random)</span>
          <input
            type="number"
            value={settings.seed}
            onChange={(e) => persist({ ...settings, seed: Number(e.target.value) })}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white"
          />
        </label>
        <label className="block text-xs">
          <span className="text-white/45">Python</span>
          <input
            value={settings.pythonPath}
            onChange={(e) => persist({ ...settings, pythonPath: e.target.value })}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white"
          />
        </label>
      </div>

      <div className="mt-2 flex flex-wrap gap-4 text-xs text-white/70">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={settings.useI2vWhenImage !== false}
            onChange={(e) => persist({ ...settings, useI2vWhenImage: e.target.checked })}
          />
          i2v when image loaded {hasImageRef ? "(ref ready)" : ""}
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={Boolean(settings.refinePrompt)}
            onChange={(e) => persist({ ...settings, refinePrompt: e.target.checked })}
          />
          GPT refine prompt
        </label>
      </div>

      <div className="mt-4 space-y-2">
        <div className="text-xs font-bold uppercase tracking-wider text-cyan-200/80">Job prompt preview</div>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-2xl border border-cyan-300/20 bg-black/50 p-3 text-[11px] text-cyan-50">
          {job.prompt || "(empty — use Prompt Studio or Idea panel)"}
        </pre>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={!job.prompt || sendBusy || isBuilding}
          onClick={handleSend}
          data-testid="send-to-open-sora"
          className="rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-3 text-sm font-bold text-black hover:opacity-90 disabled:opacity-40"
        >
          {sendBusy || isBuilding ? "Working…" : "Send to Open-Sora"}
        </button>
        <button
          type="button"
          onClick={() => launchOpenSoraAppUi(settings.installPath, settings.pythonPath).then((r) =>
            ws.setStatusWithTime(r.ok ? r.message : r.error),
          )}
          disabled={!isElectronApp()}
          className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-40"
        >
          Open Open-Sora UI
        </button>
      </div>

      {lastLaunch?.jobPath ? (
        <p className="mt-2 text-[10px] text-white/40">
          Job: {lastLaunch.jobPath}
          {lastLaunch.logPath ? ` · Log: ${lastLaunch.logPath}` : ""}
        </p>
      ) : null}

      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          disabled={!job.prompt}
          onClick={() => ws.copyToClipboard(job.prompt, "Prompt copied")}
          className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-40"
        >
          Copy prompt
        </button>
        <button
          type="button"
          disabled={!job.prompt}
          onClick={() => ws.copyToClipboard(JSON.stringify(job, null, 2), "Job JSON copied")}
          className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-40"
        >
          Copy JSON
        </button>
        <button
          type="button"
          disabled={!job.prompt}
          onClick={() => ws.copyToClipboard(job.cli_hint, "CLI hint copied")}
          className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-40"
        >
          Copy CLI
        </button>
      </div>
    </Panel>
  );
});
