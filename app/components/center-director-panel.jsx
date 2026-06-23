"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { Panel, Pill } from "./ui-blocks";
import { PanelActions } from "./panel-actions";
import {
  DIRECTOR_BRAND,
  getDirectorAspectRatios,
  getDirectorExamplePrompts,
  getDirectorQualityPresets,
  getDirectorLocalRenderEngines,
  getDirectorRenderBackends,
  getDirectorStyleProfiles,
} from "../lib/director-catalog";
import {
  applyInspirationToDirectorSettings,
  applyInspirationToProject,
  randomDirectorInspiration,
} from "../lib/director-inspire";
import {
  advanceDirectorWizard,
  createDirectorWizard,
  DIRECTOR_WIZARD_STEPS,
} from "../lib/director-prompt-wizard";
import {
  applyDirectorTemplateToProject,
  DIRECTOR_SCENE_TEMPLATES,
  directorTemplateSettingsPatch,
  getDirectorSceneTemplate,
} from "../lib/director-scene-templates";
import {
  applyDirectorQualityPreset,
  DEFAULT_DIRECTOR_SETTINGS,
  loadDirectorSettingsFromStorage,
  saveDirectorSettingsToStorage,
} from "../lib/director-settings";
import { buildDirectorJobPayload } from "../lib/director-prompt-builder";
import { sendDirectorJob } from "../lib/director-launch";
import { isElectronApp } from "../lib/electron-bridge";
import { DirectorHardwarePanel } from "./director-hardware-panel";
import { DirectorBuildLoadPanel } from "./director-build-metrics";
import { DirectorVideoLengthPunishmentPanel } from "./director-video-length-punishment-panel";
import { DirectorBenchmarkSuggestionsPanel } from "./director-benchmark-suggestions-panel";
import { DirectorOutputSettingsPanel } from "./director-output-settings-panel";
import { DirectorGraphicsApiPanel } from "./director-graphics-api-panel";
import { computeBuildPlan } from "../lib/video-build-estimate";
import { loadCachedSystemStats } from "../lib/system-stats";
import { trackLaunchBuildProgress, useVideoBuild } from "../context/video-build-context";
import {
  loadGpuWorkflowSettings,
  runGpuWorkflowPipeline,
} from "../lib/gpu-workflow-functions";
import { PROJECT_RESET_EVENT } from "../lib/project-reset";
import { useProjectWorkspace } from "../context/project-workspace-context";

const TABS = ["Create", "Render", "Advanced"];

export const CenterDirectorPanel = memo(function CenterDirectorPanel() {
  const ws = useProjectWorkspace();
  const [tab, setTab] = useState("Create");
  const [settings, setSettings] = useState(() => loadDirectorSettingsFromStorage());
  const [wizard, setWizard] = useState(createDirectorWizard());
  const [wizardInput, setWizardInput] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [lastLaunch, setLastLaunch] = useState(null);
  const {
    progressState,
    isBuilding,
    canCancelBuild,
    startBuildProgress,
    resetBuildProgress,
    handleCancelBuild,
    cancelBusy,
  } = useVideoBuild();

  const qualityPresets = getDirectorQualityPresets();
  const backends = getDirectorRenderBackends();
  const renderEngines = getDirectorLocalRenderEngines();
  const styles = getDirectorStyleProfiles();
  const examples = getDirectorExamplePrompts(8);
  const aspects = getDirectorAspectRatios();

  useEffect(() => {
    const onSettingsSync = (event) => {
      if (event?.detail) setSettings(event.detail);
    };
    const onProjectReset = () => {
      setSettings({ ...DEFAULT_DIRECTOR_SETTINGS });
      setWizard(createDirectorWizard());
      setLastLaunch(null);
      resetBuildProgress();
    };
    window.addEventListener("director-settings-updated", onSettingsSync);
    window.addEventListener(PROJECT_RESET_EVENT, onProjectReset);
    return () => {
      window.removeEventListener("director-settings-updated", onSettingsSync);
      window.removeEventListener(PROJECT_RESET_EVENT, onProjectReset);
    };
  }, [resetBuildProgress]);

  useEffect(() => {
    if (progressState?.status === "complete") {
      if (progressState?.outputVideoPath) {
        ws.setStatusWithTime(`MP4 ready — ${progressState.outputVideoPath.split(/[/\\]/).pop()}`);
        setLastLaunch((prev) =>
          prev ? { ...prev, outputVideoPath: progressState.outputVideoPath } : prev,
        );
      } else {
        ws.setStatusWithTime("Build complete — 100%");
      }
    } else if (progressState?.status === "cancelled") {
      ws.setStatusWithTime("Build cancelled");
    } else if (progressState?.status === "failed") {
      ws.setStatusWithTime(progressState.message || "Build failed");
    }
  }, [progressState?.status, progressState?.message, progressState?.outputVideoPath, ws]);

  const handleCancelBuildClick = () => {
    if (!canCancelBuild || cancelBusy) return;
    handleCancelBuild();
  };

  const persist = (next) => {
    setSettings(next);
    saveDirectorSettingsToStorage(next);
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
    [ws],
  );

  const job = useMemo(() => buildDirectorJobPayload(projectFields, settings), [projectFields, settings]);
  const hasImageRef = Boolean(ws.imageAnalysis && ws.imagePreview);
  const buildPlan = useMemo(
    () =>
      computeBuildPlan(settings, loadCachedSystemStats(), {
        useI2v: settings.useI2vWhenImage !== false && hasImageRef,
        promptLength: job.prompt?.length || 0,
      }),
    [settings, hasImageRef, job.prompt],
  );
  const wizardQuestion = wizard.topic
    ? wizard.step < DIRECTOR_WIZARD_STEPS.length
      ? DIRECTOR_WIZARD_STEPS[wizard.step]
      : null
    : "Describe your scene — subject and action";

  const handleInspire = () => {
    const bundle = randomDirectorInspiration(settings.styleProfile);
    const patch = applyInspirationToProject(bundle);
    if (patch.idea) ws.setIdea(patch.idea);
    if (patch.selectedSounds?.length) ws.setSelectedSounds(patch.selectedSounds);
    if (patch.selectedRhythms?.length) ws.setSelectedRhythms(patch.selectedRhythms);
    if (patch.lyricTheme) ws.setLyricTheme(patch.lyricTheme);
    if (patch.tempo) ws.setTempo(patch.tempo);
    if (patch.structure) ws.setStructure(patch.structure);
    persist(applyInspirationToDirectorSettings(bundle, settings));
    ws.setStatusWithTime("Fresh inspiration loaded");
  };

  const applyTemplate = (name) => {
    const t = getDirectorSceneTemplate(name);
    if (!t) return;
    const patch = applyDirectorTemplateToProject(t);
    if (patch.idea) ws.setIdea(patch.idea);
    if (patch.selectedRhythms?.length) ws.setSelectedRhythms(patch.selectedRhythms);
    if (patch.selectedSounds?.length) ws.setSelectedSounds(patch.selectedSounds);
    if (patch.lyricTheme) ws.setLyricTheme(patch.lyricTheme);
    if (patch.tempo) ws.setTempo(patch.tempo);
    if (patch.structure) ws.setStructure(patch.structure);
    persist({ ...settings, ...directorTemplateSettingsPatch(t) });
    ws.setStatusWithTime(`Template: ${name}`);
  };

  const runWizard = () => {
    if (!wizardInput.trim()) return;
    const result = advanceDirectorWizard({ ...wizard, styleName: settings.styleProfile }, wizardInput);
    setWizard(result.session);
    setWizardInput("");
    if (result.prompt) {
      ws.setIdea(result.prompt);
      ws.setStatusWithTime("Wizard complete — prompt applied");
    }
  };

  const handleSend = async () => {
    if (!job.prompt || sendBusy || isBuilding) return;
    setSendBusy(true);
    resetBuildProgress();
    try {
      let imagePayload = null;
      if (settings.useI2vWhenImage && hasImageRef && ws.readImageSourceForOpenSora) {
        imagePayload = await ws.readImageSourceForOpenSora();
      }

      let renderSettings = settings;
      let plan = computeBuildPlan(renderSettings, loadCachedSystemStats(), {
        useI2v: Boolean(imagePayload?.base64),
        promptLength: job.prompt?.length || 0,
      });

      const gpuSettings = loadGpuWorkflowSettings();
      if (gpuSettings.autoRunBeforeRender !== false) {
        const gpuResult = await runGpuWorkflowPipeline({
          settings: renderSettings,
          gpuSettings,
          hook: "before_render",
          hasImageRef,
          promptLength: job.prompt?.length || 0,
        });
        if (gpuResult.settings) {
          renderSettings = gpuResult.settings;
          persist(renderSettings);
        }
        plan = gpuResult.buildPlan || plan;
        if (gpuResult.applied?.length) {
          ws.setStatusWithTime(`GPU: ${gpuResult.applied.join(", ")}`);
        }
        if (!gpuResult.ok) {
          ws.setStatusWithTime(gpuResult.blockers?.[0] || "GPU preflight blocked render", "warning");
          return;
        }
        if (gpuResult.warnings?.length) {
          ws.setStatusWithTime(gpuResult.warnings[0], "warning");
        }
      }

      const result = await sendDirectorJob({
        project: projectFields,
        settings: renderSettings,
        imagePayload,
        buildPlan: plan,
      });
      setLastLaunch(result);

      trackLaunchBuildProgress(startBuildProgress, result, {
        title: "Director render",
        estimatedSeconds: plan.estimatedSeconds,
        estimatedLabel: plan.estimatedLabel,
      });

      ws.setStatusWithTime(result.message || (result.ok ? "Render started" : "Failed"));
    } finally {
      setSendBusy(false);
    }
  };

  return (
    <Panel
      title={DIRECTOR_BRAND}
      hint="Native AI Video Creator engine — build scenes, export prompts, optional local GPU render. No external install required."
      data-testid="director-panel"
      actions={
        <PanelActions
          topic="director"
          onClear={() => {
            persist(DEFAULT_DIRECTOR_SETTINGS);
            setWizard(createDirectorWizard());
            setLastLaunch(null);
            resetBuildProgress();
          }}
        />
      }
    >
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold ${
              tab === t ? "bg-cyan-300 text-black" : "border border-white/15 text-white/60 hover:bg-white/10"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Create" ? (
        <div className="mt-4 space-y-4">
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/45">Look & feel</div>
            <div className="flex flex-wrap gap-2">
              {styles.map((s) => (
                <Pill
                  key={s.name}
                  active={settings.styleProfile === s.name}
                  onClick={() => persist({ ...settings, styleProfile: s.name })}
                >
                  {s.label}
                </Pill>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleInspire}
              className="rounded-2xl border border-violet-400/40 bg-violet-500/15 px-4 py-2 text-xs font-bold text-violet-100"
            >
              Inspire me
            </button>
            <label className="flex items-center gap-2 text-xs text-white/60">
              <input
                type="checkbox"
                checked={wizard.directorMode}
                onChange={(e) => setWizard({ ...wizard, directorMode: e.target.checked })}
              />
              3-act structure
            </label>
            <label className="flex items-center gap-2 text-xs text-white/60">
              <input
                type="checkbox"
                checked={wizard.expertMode}
                onChange={(e) => setWizard({ ...wizard, expertMode: e.target.checked })}
              />
              Lens metadata
            </label>
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <div>
              {wizardQuestion ? <p className="mb-1 text-[11px] text-cyan-200/80">{wizardQuestion}</p> : null}
              <input
                value={wizardInput}
                onChange={(e) => setWizardInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runWizard()}
                placeholder="Wizard input…"
                className="w-full rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none focus:border-cyan-300"
              />
            </div>
            <button type="button" onClick={runWizard} className="rounded-2xl bg-cyan-300 px-4 py-2 text-sm font-bold text-black">
              Next
            </button>
          </div>

          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/45">Scene templates</div>
            <div className="flex flex-wrap gap-2">
              {Object.keys(DIRECTOR_SCENE_TEMPLATES).map((name) => (
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

          {examples.length ? (
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/45">Starter prompts</div>
              <div className="max-h-28 space-y-1 overflow-auto">
                {examples.map((ex, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      ws.setIdea(ex.text);
                      ws.setStatusWithTime("Starter prompt loaded");
                    }}
                    className="block w-full rounded-xl border border-white/5 bg-black/25 px-3 py-2 text-left text-[11px] text-white/70 hover:border-cyan-300/30"
                  >
                    {ex.text.slice(0, 100)}
                    {ex.text.length > 100 ? "…" : ""}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "Render" ? (
        <div className="mt-4 space-y-4">
          <DirectorHardwarePanel
            compact
            settings={settings}
            onApplySettings={persist}
            onStatus={(msg) => ws.setStatusWithTime(msg)}
          />

          <DirectorBuildLoadPanel plan={buildPlan} />

          <DirectorVideoLengthPunishmentPanel
            punishment={buildPlan.durationPunishment}
            onApplyDuration={(durationSeconds) => {
              persist({ ...settings, durationSeconds, outputPreset: null });
              ws.setStatusWithTime(`Duration set to ${durationSeconds}s (hardware suggestion)`);
            }}
          />

          <DirectorBenchmarkSuggestionsPanel
            settings={settings}
            project={projectFields}
            buildPlan={buildPlan}
            hasImageRef={hasImageRef}
            promptLength={job.prompt?.length || 0}
            onApplySettings={persist}
            onStatus={(msg) => ws.setStatusWithTime(msg)}
          />

          <DirectorOutputSettingsPanel settings={settings} onChange={persist} renderBackend={settings.renderBackend} />

          <DirectorGraphicsApiPanel settings={settings} onChange={persist} />

          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/45">Pipeline tier & quality</div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {Object.entries(qualityPresets).map(([key, p]) => (
              <button
                key={key}
                type="button"
                onClick={() => persist(applyDirectorQualityPreset(settings, key))}
                className={`rounded-2xl border px-3 py-2 text-xs font-bold ${
                  settings.qualityPreset === key
                    ? "border-cyan-300 bg-cyan-300/20 text-cyan-100"
                    : "border-white/10 bg-black/25 text-white/60"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/45">Output mode</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {backends.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => persist({ ...settings, renderBackend: b.id })}
                  className={`rounded-2xl border p-3 text-left text-xs ${
                    settings.renderBackend === b.id
                      ? "border-cyan-300 bg-cyan-300/10 text-cyan-100"
                      : "border-white/10 text-white/60 hover:bg-white/5"
                  }`}
                >
                  <div className="font-bold">{b.label}</div>
                  <div className="mt-1 text-[10px] opacity-70">{b.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <label className="block text-xs">
              <span className="text-white/45">Pipeline tier</span>
              <select
                value={settings.resolution || "512px"}
                onChange={(e) => persist({ ...settings, resolution: e.target.value, outputPreset: null })}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white"
              >
                {["256px", "384px", "512px", "768px", "1024px"].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              <span className="text-white/45">Denoise steps</span>
              <input type="number" value={settings.numSteps} onChange={(e) => persist({ ...settings, numSteps: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white" />
            </label>
            <label className="block text-xs">
              <span className="text-white/45">Frames</span>
              <input type="number" value={settings.numFrames} onChange={(e) => persist({ ...settings, numFrames: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white" />
            </label>
            <label className="block text-xs">
              <span className="text-white/45">Motion</span>
              <input type="number" min={1} max={15} value={settings.motionScore} onChange={(e) => persist({ ...settings, motionScore: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white" />
            </label>
          </div>

          <label
            className="flex items-center gap-2 text-xs text-white/70"
            data-testid={hasImageRef && settings.useI2vWhenImage !== false ? "director-i2v-ref-ready" : undefined}
          >
            <input type="checkbox" checked={settings.useI2vWhenImage !== false} onChange={(e) => persist({ ...settings, useI2vWhenImage: e.target.checked })} />
            Use reference image when loaded {hasImageRef ? "✓" : ""}
          </label>

          <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded-2xl border border-cyan-300/20 bg-black/50 p-3 text-[11px] text-cyan-50">
            {job.prompt || "(build your scene in Create tab or Idea panel)"}
          </pre>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={!job.prompt || sendBusy || isBuilding}
              onClick={handleSend}
              data-testid="send-director-job"
              className="rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-3 text-sm font-bold text-black disabled:opacity-40"
            >
              {sendBusy || isBuilding
                ? "Working…"
                : settings.renderBackend === "local-python" && isElectronApp()
                  ? "Render locally"
                  : "Export job"}
            </button>
            {canCancelBuild ? (
              <button
                type="button"
                disabled={cancelBusy || progressState?.status === "cancelling"}
                onClick={handleCancelBuildClick}
                data-testid="cancel-build-action"
                className="rounded-2xl border border-rose-400/40 bg-rose-500/15 px-4 py-3 text-sm font-bold text-rose-100 hover:bg-rose-500/25 disabled:opacity-50 sm:col-span-2"
              >
                {cancelBusy || progressState?.status === "cancelling" ? "Cancelling build…" : "Cancel build"}
              </button>
            ) : (
              <button
                type="button"
                disabled={!job.prompt}
                onClick={() => ws.copyToClipboard(job.prompt, "Director prompt copied")}
                className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-bold text-white"
              >
                Copy prompt
              </button>
            )}
          </div>

          {canCancelBuild ? (
            <button
              type="button"
              disabled={!job.prompt}
              onClick={() => ws.copyToClipboard(job.prompt, "Director prompt copied")}
              className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-white"
            >
              Copy prompt
            </button>
          ) : null}

          {lastLaunch?.jobPath ? (
            <div className="space-y-1 text-[10px] text-white/40">
              <p>Job: {lastLaunch.jobPath}</p>
              {lastLaunch.outputVideoPath ? (
                <p className="text-emerald-300/70">Video: {lastLaunch.outputVideoPath}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "Advanced" ? (
        <div className="mt-4 space-y-3 text-xs text-white/60">
          <DirectorHardwarePanel
            settings={settings}
            onApplySettings={persist}
            onStatus={(msg) => ws.setStatusWithTime(msg)}
          />
          <p>
            Local GPU render uses{" "}
            <strong className="text-white/80">
              {renderEngines.find((e) => e.id === settings.localRenderEngine)?.label || "Wan 2.1"}
            </strong>{" "}
            by default (native Windows CUDA). Open-Sora needs the pipeline folder below and usually WSL on
            Windows.
          </p>
          <label className="block">
            <span className="text-white/45">Local render engine</span>
            <select
              value={settings.localRenderEngine || "diffusers-wan"}
              onChange={(e) =>
                persist({
                  ...settings,
                  localRenderEngine: e.target.value,
                  renderBackend: "local-python",
                })
              }
              className="mt-1 w-full rounded-2xl border border-white/10 bg-black/30 p-3 text-white"
            >
              {renderEngines.map((engine) => (
                <option key={engine.id} value={engine.id}>
                  {engine.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-white/45">Open-Sora pipeline folder (open-sora engine only)</span>
            <input
              value={settings.localPipelinePath}
              onChange={(e) =>
                persist({
                  ...settings,
                  localPipelinePath: e.target.value,
                  renderBackend: e.target.value ? "local-python" : settings.renderBackend,
                })
              }
              placeholder="Required only for Open-Sora 2.0 engine"
              className="mt-1 w-full rounded-2xl border border-white/10 bg-black/30 p-3 text-white"
            />
          </label>
          <label className="block">
            <span className="text-white/45">Python executable</span>
            <input
              value={settings.localPythonPath}
              onChange={(e) => persist({ ...settings, localPythonPath: e.target.value })}
              className="mt-1 w-full rounded-2xl border border-white/10 bg-black/30 p-3 text-white"
            />
          </label>
        </div>
      ) : null}
    </Panel>
  );
});
