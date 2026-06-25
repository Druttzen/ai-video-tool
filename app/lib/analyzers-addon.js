/**
 * Ultimate music + picture analyzers — summaries, export, and Path E readiness.
 */
import { formatTime } from "./audio-analyzer";
import { hasVocalsLikely, MV_DURATION_MODES } from "./audio-visual-music-video";
import { isElectronApp, probeMusicVideoAddonFromHost } from "./electron-bridge";
import { determineBuildFromAnalyzersAndRequest, resolveAnalyzerUserRequest } from "./analyzer-build-intent";
import { summarizeBeatSync } from "./music-video-addon";

export {
  determineBuildFromAnalyzersAndRequest,
  resolveAnalyzerUserRequest,
  slimBuildIntent,
} from "./analyzer-build-intent";

export { executeAnalyzerBuildPlan } from "./analyzer-build-executor";

export const ANALYZERS_ADDON_CAPABILITIES = [
  "browser-audio-dsp",
  "browser-image-palette",
  "waveform-peaks",
  "highlight-window",
  "lufs-meter",
  "studio-wav-export",
  "path-e-audio-visual",
  "desktop-librosa-refine",
  "build-intent-synthesis",
];

/**
 * @param {object|null} audioAnalysis
 */
export function summarizeAudioAnalysis(audioAnalysis) {
  if (!audioAnalysis) {
    return {
      ready: false,
      fileName: null,
      durationSec: 0,
      bpm: null,
      key: null,
      energy: null,
      vocals: null,
      highlightLabel: null,
      beatSyncReady: false,
      hint: "Drop an audio file to analyze BPM, mood, highlight, and waveform",
    };
  }

  const beat = summarizeBeatSync(audioAnalysis, MV_DURATION_MODES.FULL);
  const clipPlanLen = audioAnalysis?.beatSync?.clipPlan?.length || 0;

  return {
    ready: true,
    fileName: audioAnalysis.fileName,
    durationSec: Number(audioAnalysis.duration) || 0,
    bpm: audioAnalysis.bpm ?? audioAnalysis.estimatedBpm,
    key: audioAnalysis.estimatedKey,
    energy: audioAnalysis.energy,
    aggression: audioAnalysis.aggression,
    brightness: audioAnalysis.brightness,
    vocals: audioAnalysis.vocals,
    vocalsLikely: audioAnalysis?.beatSync?.vocalsLikely ?? hasVocalsLikely(audioAnalysis),
    highlightLabel: audioAnalysis.highlightLabel,
    highlightRange: `${formatTime(audioAnalysis.highlightStart)}–${formatTime(audioAnalysis.highlightEnd)}`,
    genreCount: (audioAnalysis.suggestedGenres || []).length,
    beatSyncReady: beat.ready || clipPlanLen >= 1,
    beatSyncSource: beat.source || audioAnalysis?.beatSync?.source,
    clipCount: clipPlanLen || beat.clipCount,
    source: audioAnalysis.source || "browser-dsp",
    analyzedAt: audioAnalysis.analyzedAt || null,
    hint: (clipPlanLen || beat.clipCount) >= 2
      ? `${clipPlanLen || beat.clipCount} beat-sync segments ready for multi-clip MV`
      : "Merge into Suno fields or map to music video",
  };
}

/**
 * @param {object|null} imageAnalysis
 */
export function summarizeImageAnalysis(imageAnalysis) {
  if (!imageAnalysis) {
    return {
      ready: false,
      fileName: null,
      visualMood: null,
      hint: "Drop a reference image for palette, mood, and i2v style cues",
    };
  }

  return {
    ready: true,
    fileName: imageAnalysis.fileName,
    visualMood: imageAnalysis.visualMood,
    avgColor: imageAnalysis.avgColor,
    dominantHue: imageAnalysis.dominantHue,
    hueLabel: imageAnalysis.hueLabel,
    colorTemperature: imageAnalysis.colorTemperature,
    aspectLabel: imageAnalysis.aspectLabel,
    brightness: Math.round(imageAnalysis.brightness ?? 0),
    saturation: Math.round(imageAnalysis.saturation ?? 0),
    contrast: Math.round(imageAnalysis.contrast ?? 0),
    genreCount: (imageAnalysis.suggestedGenres || []).length,
    soundCount: (imageAnalysis.suggestedSounds || []).length,
    rhythmCount: (imageAnalysis.suggestedRhythms || []).length,
    source: imageAnalysis.source || "browser-canvas",
    analyzedAt: imageAnalysis.analyzedAt || null,
    hint: "Merge image style into Suno fields or use with audio for Path E",
  };
}

/**
 * @param {object|null} audioAnalysis
 * @param {object|null} imageAnalysis
 */
export function summarizeAnalyzersPair(audioAnalysis, imageAnalysis) {
  const audio = summarizeAudioAnalysis(audioAnalysis);
  const image = summarizeImageAnalysis(imageAnalysis);
  const pathEReady = Boolean(audioAnalysis && imageAnalysis);

  return {
    audioReady: audio.ready,
    imageReady: image.ready,
    pathEReady,
    bothReady: pathEReady,
    hint: pathEReady
      ? "Audio + picture ready — build beat-sync music video (Path E)"
      : !audio.ready && !image.ready
        ? "Drop audio and image in the analyzers above"
        : !audio.ready
          ? "Add analyzed audio for Path E"
          : "Add reference image for Path E",
  };
}

/**
 * @param {object|null} audioAnalysis
 * @param {object|null} imageAnalysis
 * @param {object} [ctx] — userRequest, idea, agentDraft, agentMessages, suno paste
 */
export function buildAnalyzersExport(audioAnalysis, imageAnalysis, ctx = {}) {
  const buildIntent = determineBuildFromAnalyzersAndRequest({
    audioAnalysis,
    imageAnalysis,
    ...ctx,
  });

  return {
    exportedAt: new Date().toISOString(),
    capabilities: ANALYZERS_ADDON_CAPABILITIES,
    buildIntent,
    audio: audioAnalysis
      ? {
          summary: summarizeAudioAnalysis(audioAnalysis),
          analysis: audioAnalysis,
          beatSync: summarizeBeatSync(audioAnalysis, MV_DURATION_MODES.FULL),
        }
      : null,
    image: imageAnalysis
      ? {
          summary: summarizeImageAnalysis(imageAnalysis),
          analysis: imageAnalysis,
        }
      : null,
    pair: summarizeAnalyzersPair(audioAnalysis, imageAnalysis),
  };
}

/** @returns {Promise<{ ok: boolean, browser?: boolean, librosa?: object, capabilities?: string[] }>} */
export async function probeAnalyzersAddon() {
  const base = {
    ok: true,
    browser: typeof window !== "undefined" && typeof AudioContext !== "undefined",
    capabilities: ANALYZERS_ADDON_CAPABILITIES,
  };

  if (!isElectronApp()) {
    return { ...base, librosa: { ok: false, message: "Desktop app unlocks librosa beat refine" } };
  }

  const librosa = await probeMusicVideoAddonFromHost();
  return {
    ...base,
    ok: base.browser,
    librosa: librosa?.beatSync || { ok: librosa?.ok, message: librosa?.beatSync?.message },
    ffmpeg: librosa?.ffmpeg,
  };
}
