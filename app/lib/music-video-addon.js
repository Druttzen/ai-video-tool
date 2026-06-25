/**
 * Ultimate music video addon — beat sync, clip planning, and assembly helpers.
 */
import {
  MV_DURATION_MODES,
  buildBeatSyncMarkers,
  hasVocalsLikely,
  resolveMusicVideoDurationContext,
} from "./audio-visual-music-video";
import {
  analyzeMusicVideoBeatsFromHost,
  assembleMusicVideoFromHost,
  isElectronApp,
  probeMusicVideoAddonFromHost,
} from "./electron-bridge";
import { enrichAudioAnalysisWithBeatSync } from "./music-video-sync-engine";
import { refineAudioAnalysisWithBeatSync } from "./music-video-sync-client";

export const MUSIC_VIDEO_ADDON_CAPABILITIES = [
  "beat-analysis",
  "onset-detection",
  "clip-plan",
  "vocal-hint",
  "highlight-range",
  "ffmpeg-assemble",
  "multi-clip-mux",
];

/**
 * @param {object|null} audioAnalysis
 * @param {string} [mode]
 */
export function summarizeBeatSync(audioAnalysis, mode = MV_DURATION_MODES.FULL) {
  if (!audioAnalysis) {
    return {
      ready: false,
      source: null,
      bpm: null,
      beatCount: 0,
      onsetCount: 0,
      clipCount: 0,
      clipDurationSec: 0,
      rangeLabel: "—",
      vocalsLikely: false,
      hint: "Drop audio in Analyzers to enable beat sync",
    };
  }

  const ctx = resolveMusicVideoDurationContext(audioAnalysis, mode);
  const markers = buildBeatSyncMarkers(audioAnalysis, mode);
  const clipPlan = markers.clipPlan || [];
  const clipDurationSec = clipPlan.reduce((sum, clip) => sum + (clip.duration || clip.end - clip.start || 0), 0);

  return {
    ready: clipPlan.length >= 1 || markers.beatCount > 1,
    source: markers.source || audioAnalysis?.beatSync?.source || "grid",
    bpm: markers.bpm,
    beatCount: markers.beatCount,
    onsetCount:
      audioAnalysis?.beatSync?.onsetCount ??
      audioAnalysis?.beatSync?.onsetTimes?.length ??
      0,
    clipCount: clipPlan.length,
    clipDurationSec: Math.round(clipDurationSec * 10) / 10,
    rangeLabel: `${ctx.rangeStart.toFixed(1)}s–${ctx.rangeEnd.toFixed(1)}s`,
    vocalsLikely: audioAnalysis?.beatSync?.vocalsLikely ?? hasVocalsLikely(audioAnalysis),
    analyzedAt: audioAnalysis?.beatSync?.analyzedAt || null,
    hint:
      clipPlan.length >= 2
        ? `${clipPlan.length} segments planned for multi-clip production`
        : markers.beatCount > 1
          ? "Beat grid ready — run Path E for full clip plan"
          : "Run Re-analyze beats after installing music-video-sync addon",
  };
}

/** @param {object|null} clipPlan */
export function labelClipPlan(clipPlan = []) {
  return (clipPlan || []).map((clip, index) => ({
    ...clip,
    label: clip.label || `Segment ${index + 1}`,
  }));
}

/**
 * @param {object|null} audioAnalysis
 * @param {string} [mode]
 */
export function buildBeatSyncExport(audioAnalysis, mode = MV_DURATION_MODES.FULL) {
  const summary = summarizeBeatSync(audioAnalysis, mode);
  const markers = buildBeatSyncMarkers(audioAnalysis, mode);
  return {
    exportedAt: new Date().toISOString(),
    capabilities: MUSIC_VIDEO_ADDON_CAPABILITIES,
    summary,
    clipPlan: labelClipPlan(markers.clipPlan),
    beatTimes: audioAnalysis?.beatSync?.beatTimes || markers.markers || [],
    onsetTimes: audioAnalysis?.beatSync?.onsetTimes || [],
    range: markers.ctx || resolveMusicVideoDurationContext(audioAnalysis, mode),
  };
}

/** @returns {Promise<{ ok: boolean, beatSync?: object, ffmpeg?: object, capabilities?: string[], error?: string }>} */
export async function probeMusicVideoAddon() {
  if (!isElectronApp()) {
    return {
      ok: false,
      error: "Music video addon requires the desktop app",
      capabilities: MUSIC_VIDEO_ADDON_CAPABILITIES,
    };
  }
  const result = await probeMusicVideoAddonFromHost();
  return {
    ...result,
    capabilities: result?.capabilities || MUSIC_VIDEO_ADDON_CAPABILITIES,
  };
}

/**
 * @param {object|null} audioAnalysis
 * @param {Blob|File|null} [audioBlob]
 * @param {{ durationMode?: string }} [opts]
 */
export async function reanalyzeBeatSync(audioAnalysis, audioBlob = null, opts = {}) {
  if (!audioAnalysis) return { ok: false, error: "No audio analysis" };
  const refined = await refineAudioAnalysisWithBeatSync(audioAnalysis, audioBlob, opts);
  const summary = summarizeBeatSync(refined, opts.durationMode);
  return { ok: true, audioAnalysis: refined, summary };
}

/**
 * @param {object} payload
 */
export async function analyzeBeatsFromHost(payload) {
  return analyzeMusicVideoBeatsFromHost(payload);
}

/**
 * @param {object} payload
 */
export async function assembleMusicVideoClips(payload) {
  return assembleMusicVideoFromHost(payload);
}

/**
 * @param {object|null} audioAnalysis
 * @param {string[]} [clipPaths]
 */
export function summarizeAssemblyReadiness(audioAnalysis, clipPaths = []) {
  const summary = summarizeBeatSync(audioAnalysis);
  const planned = summary.clipCount;
  const rendered = clipPaths.filter(Boolean).length;
  return {
    planned,
    rendered,
    ready: planned > 0 && rendered >= planned,
    missingClips: Math.max(0, planned - rendered),
    hint:
      planned === 0
        ? "No clip plan — analyze beats first"
        : rendered >= planned
          ? "All planned clips present — ready to mux with FFmpeg"
          : `${rendered}/${planned} clips rendered`,
  };
}
