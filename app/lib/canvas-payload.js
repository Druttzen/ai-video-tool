/**
 * Build Canvas dashboard payload from current project workspace state.
 */
import { loadDirectorSettingsFromStorage } from "./director-settings";
import { determineBuildFromAnalyzersAndRequest, slimBuildIntent } from "./analyzers-addon";
import { loadPersistedSetupScan, summarizeSetupScan } from "./setup-hub";
import { APP_VERSION } from "./video-config";

function slimAudioAnalysis(audioAnalysis) {
  if (!audioAnalysis || typeof audioAnalysis !== "object") return null;
  const beatSync = audioAnalysis.beatSync;
  return {
    fileName: audioAnalysis.fileName,
    bpm: audioAnalysis.bpm,
    durationSec: audioAnalysis.durationSec ?? audioAnalysis.duration,
    energy: audioAnalysis.energy,
    estimatedKey: audioAnalysis.estimatedKey,
    vocals: audioAnalysis.vocals,
    source: audioAnalysis.source,
    highlightStart: audioAnalysis.highlightStart,
    highlightEnd: audioAnalysis.highlightEnd,
    sidecarImported: audioAnalysis.sidecarImported,
    beatSync: beatSync
      ? {
          clipPlan: beatSync.clipPlan,
          beatCount: beatSync.beatCount,
          onsetCount: beatSync.onsetCount,
          bpm: beatSync.bpm,
          source: beatSync.source,
          vocalsLikely: beatSync.vocalsLikely,
        }
      : undefined,
  };
}

function slimImageAnalysis(imageAnalysis) {
  if (!imageAnalysis || typeof imageAnalysis !== "object") return null;
  return {
    suggestedGenres: imageAnalysis.suggestedGenres,
    suggestedSounds: imageAnalysis.suggestedSounds,
    suggestedRhythms: imageAnalysis.suggestedRhythms,
    visualMood: imageAnalysis.visualMood,
    avgColor: imageAnalysis.avgColor,
    dominantHue: imageAnalysis.dominantHue,
    hueLabel: imageAnalysis.hueLabel,
    colorTemperature: imageAnalysis.colorTemperature,
    aspectLabel: imageAnalysis.aspectLabel,
    aspectRatio: imageAnalysis.aspectRatio,
    source: imageAnalysis.source,
  };
}

function slimProductionState(production) {
  if (!production || typeof production !== "object") return null;
  return {
    phase: production.phase,
    multiClip: production.multiClip,
    clipTotal: production.clipTotal,
    clipCurrent: production.clipCurrent,
    clipsRendered: production.clipsRendered,
    clipStatus: production.clipStatus,
    clipLabel: production.clipLabel,
    multiClipNote: production.multiClipNote,
    renderMessage: production.renderMessage,
    lastOutputPath: production.lastOutputPath,
    lastError: production.lastError,
    clipPlannedTotal: production.clipPlannedTotal,
    clipIndex: production.clipIndex,
    clipStart: production.clipStart,
    clipEnd: production.clipEnd,
    clipDuration: production.clipDuration,
    assembledOutputPath: production.assembledOutputPath,
    logPath: production.logPath,
    updatedAt: production.updatedAt,
    renderPythonSource: production.renderPythonSource,
  };
}

function slimDirectorSettings(settings) {
  if (!settings || typeof settings !== "object") return null;
  return {
    renderBackend: settings.renderBackend,
    localRenderEngine: settings.localRenderEngine,
    qualityPreset: settings.qualityPreset,
    aspectRatio: settings.aspectRatio,
    numFrames: settings.numFrames,
    fps: settings.fps,
    durationSeconds: settings.durationSeconds,
    wanModelId: settings.wanModelId,
  };
}

function slimCoProducer(settings) {
  if (!settings || typeof settings !== "object") return null;
  let provider = settings.provider;
  if (!provider && settings.apiUrl) {
    try {
      const host = new URL(String(settings.apiUrl)).hostname;
      provider = host.replace(/^api\./, "").split(".")[0] || host;
    } catch {
      /* ignore invalid URL */
    }
  }
  return {
    provider: provider || undefined,
    model: settings.model || undefined,
  };
}

function buildAgentSummary(agentPhase, agentMessages) {
  const messageCount = Array.isArray(agentMessages) ? agentMessages.length : 0;
  if (!agentPhase && messageCount === 0) return null;
  return {
    phase: agentPhase || undefined,
    messageCount,
  };
}

function buildSetupSummary() {
  try {
    const scan = loadPersistedSetupScan();
    if (!scan?.modules) return null;
    const summary = summarizeSetupScan(scan);
    const modules = Object.entries(scan.modules).map(([id, row]) => ({
      id,
      status: row?.status,
      message: row?.message,
    }));
    return { summary, modules };
  } catch {
    return null;
  }
}

/**
 * @param {object} workspace
 */
export function buildCanvasPayloadFromWorkspace(workspace = {}) {
  const audioAnalysis = slimAudioAnalysis(workspace.audioAnalysis);
  const imageAnalysis = slimImageAnalysis(workspace.imageAnalysis);
  const idea = String(workspace.idea || "").trim();
  const directorSettings = slimDirectorSettings(
    workspace.directorSettings || loadDirectorSettingsFromStorage(),
  );
  const production = slimProductionState(workspace.production || workspace.agentProductionState);
  const coProducer = slimCoProducer(workspace.coProducerLlmSettings);
  const agentSummary = buildAgentSummary(workspace.agentPhase, workspace.agentMessages);
  const appVersion = workspace.appVersion || APP_VERSION;
  const buildIntent = slimBuildIntent(
    determineBuildFromAnalyzersAndRequest({
      audioAnalysis: workspace.audioAnalysis,
      imageAnalysis: workspace.imageAnalysis,
      idea,
      userRequest: workspace.userRequest,
      agentDraft: workspace.agentDraft,
      manuscriptDraft: workspace.manuscriptDraft,
      agentMessages: workspace.agentMessages,
      sunoPasteStyle: workspace.sunoPasteStyle,
      sunoPasteLyrics: workspace.sunoPasteLyrics,
    }),
  );

  let handoff;
  if (audioAnalysis || imageAnalysis) {
    const clipCount = audioAnalysis?.beatSync?.clipPlan?.length || 0;
    handoff = {
      source: audioAnalysis?.sidecarImported ? "ai-music-creator" : "ai-video-tool",
      intent: buildIntent?.canvasIntent || (clipCount >= 2 ? "music-video-path-e" : "project-only"),
      audioAnalysis: audioAnalysis || undefined,
      imageAnalysis: imageAnalysis || undefined,
    };
  }

  return {
    title: idea ? idea.slice(0, 72) : "AI Video Creator Canvas",
    exportedAt: new Date().toISOString(),
    appVersion,
    project: {
      idea,
      tempo: workspace.tempo,
      structure: workspace.structure,
      selectedGenres: workspace.selectedGenres,
      selectedRhythms: workspace.selectedRhythms,
      selectedSounds: workspace.selectedSounds,
    },
    handoff,
    directorSettings,
    production,
    agentSummary,
    coProducer,
    setup: buildSetupSummary(),
    buildIntent,
  };
}
