"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { Panel } from "./ui-blocks";
import {
  applyOpenSoraPreset,
  DEFAULT_OPEN_SORA_SETTINGS,
  loadOpenSoraSettingsFromStorage,
  OPEN_SORA_PRESETS,
  saveOpenSoraSettingsToStorage,
} from "../lib/open-sora-settings";
import {
  OPEN_SORA_SCENE_TEMPLATES,
  applyOpenSoraSceneTemplateToProject,
} from "../lib/open-sora-scene-templates";
import { buildOpenSoraJobPayload } from "../lib/open-sora-prompt-builder";
import { launchOpenSoraAppUi, sendToOpenSora } from "../lib/open-sora-launch";
import { isElectronApp } from "../lib/electron-bridge";
import { useProjectWorkspace } from "../context/project-workspace-context";

export const CenterOpenSoraExportPanel = memo(function CenterOpenSoraExportPanel() {
  const ws = useProjectWorkspace();
  const [settings, setSettings] = useState(DEFAULT_OPEN_SORA_SETTINGS);
  const [sendBusy, setSendBusy] = useState(false);
  const [lastLaunch, setLastLaunch] = useState(null);

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
    ],
  );

  const job = useMemo(
    () => buildOpenSoraJobPayload(projectFields, settings),
    [projectFields, settings],
  );

  const hasImageRef = Boolean(ws.imageAnalysis && ws.imagePreview);

  const applyTemplate = (name) => {
    const t = OPEN_SORA_SCENE_TEMPLATES[name];
    if (!t) return;
    const patch = applyOpenSoraSceneTemplateToProject(t);
    if (patch.idea) ws.setIdea(patch.idea);
    if (patch.selectedRhythms?.length) ws.setSelectedRhythms(patch.selectedRhythms);
    if (patch.selectedSounds?.length) ws.setSelectedSounds(patch.selectedSounds);
    if (patch.lyricTheme) ws.setLyricTheme(patch.lyricTheme);
    if (patch.tempo) ws.setTempo(patch.tempo);
    if (patch.structure) ws.setStructure(patch.structure);
    ws.setStatusWithTime(`Loaded Open-Sora template: ${name}`);
  };

  const handleSend = async () => {
    if (!job.prompt || sendBusy) return;
    setSendBusy(true);
    try {
      let imagePayload = null;
      if (settings.useI2vWhenImage && hasImageRef && ws.readImageSourceForOpenSora) {
        imagePayload = await ws.readImageSourceForOpenSora();
      }
      const result = await sendToOpenSora({
        project: projectFields,
        settings,
        imagePayload,
        mode: "pipeline",
      });
      setLastLaunch(result);
      if (result.ok) {
        const i2vNote = imagePayload ? " (i2v ref attached)" : "";
        ws.setStatusWithTime(
          result.fallback
            ? result.message
            : `${result.message || "Open-Sora job started"}${i2vNote}`,
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

  const handleOpenUi = async () => {
    const result = await launchOpenSoraAppUi(settings.installPath, settings.pythonPath);
    if (result.ok) {
      ws.setStatusWithTime(result.message || "Open-Sora UI launched");
    } else {
      ws.setStatusWithTime(result.error || "Could not launch Open-Sora UI");
    }
  };

  return (
    <Panel
      title="Open-Sora Engine"
      hint="Local install at E:\\Open-Sora — Send writes a job JSON and runs the pipeline (Electron) or downloads JSON (browser)"
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
        <div className="mb-1 text-xs font-bold uppercase tracking-wider text-white/45">Python</div>
        <input
          value={settings.pythonPath}
          onChange={(e) => persist({ ...settings, pythonPath: e.target.value })}
          placeholder="python"
          className="w-full rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none focus:border-cyan-300"
        />
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
          <span className="text-white/45">Steps</span>
          <input
            type="number"
            value={settings.steps}
            onChange={(e) => persist({ ...settings, steps: Number(e.target.value) })}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white"
          />
        </label>
        <label className="block text-xs">
          <span className="text-white/45">CFG</span>
          <input
            type="number"
            step="0.1"
            value={settings.cfg}
            onChange={(e) => persist({ ...settings, cfg: Number(e.target.value) })}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white"
          />
        </label>
        <label className="block text-xs">
          <span className="text-white/45">Resolution</span>
          <input
            value={settings.resolution}
            onChange={(e) => persist({ ...settings, resolution: e.target.value })}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white"
          />
        </label>
        <label className="block text-xs">
          <span className="text-white/45">Motion score</span>
          <input
            type="number"
            value={settings.motionScore}
            onChange={(e) => persist({ ...settings, motionScore: Number(e.target.value) })}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white"
          />
        </label>
      </div>

      <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-white/70">
        <input
          type="checkbox"
          checked={settings.useI2vWhenImage !== false}
          onChange={(e) => persist({ ...settings, useI2vWhenImage: e.target.checked })}
          className="rounded border-white/20"
        />
        Image-to-video when reference image is loaded
        {hasImageRef ? (
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
            ref ready
          </span>
        ) : (
          <span className="text-white/35">(drop image in Analyzers)</span>
        )}
      </label>

      <div className="mt-4">
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/45">Scene templates (from Open-Sora)</div>
        <div className="flex flex-wrap gap-2">
          {Object.keys(OPEN_SORA_SCENE_TEMPLATES).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => applyTemplate(name)}
              className="rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-[11px] font-bold text-violet-100 hover:bg-violet-500/20"
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="text-xs font-bold uppercase tracking-wider text-cyan-200/80">Main prompt</div>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-2xl border border-cyan-300/20 bg-black/50 p-3 text-[11px] text-cyan-50">
          {job.prompt || "(empty — set Idea or load a template)"}
        </pre>
        <button
          type="button"
          disabled={!job.prompt}
          onClick={() => ws.copyToClipboard(job.prompt, "Open-Sora prompt copied")}
          className="w-full rounded-2xl bg-cyan-300 px-4 py-2 text-sm font-bold text-black hover:bg-cyan-200 disabled:opacity-40"
        >
          Copy Open-Sora prompt
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={!job.prompt || sendBusy}
          onClick={handleSend}
          data-testid="send-to-open-sora"
          className="rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-3 text-sm font-bold text-black hover:opacity-90 disabled:opacity-40"
        >
          {sendBusy ? "Sending…" : "Send to Open-Sora"}
        </button>
        <button
          type="button"
          onClick={handleOpenUi}
          disabled={!isElectronApp()}
          title={isElectronApp() ? "Launch app_pro.py Gradio UI" : "Requires Electron desktop app"}
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

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!job.prompt}
          onClick={() =>
            ws.copyToClipboard(JSON.stringify(job, null, 2), "Open-Sora job JSON copied")
          }
          className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-40"
        >
          Copy job JSON
        </button>
        <button
          type="button"
          disabled={!job.prompt}
          onClick={() => ws.copyToClipboard(job.cli_hint, "Open-Sora CLI hint copied")}
          className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-40"
        >
          Copy CLI hint
        </button>
      </div>
    </Panel>
  );
});
