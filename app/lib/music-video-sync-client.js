"use client";

import { analyzeMusicVideoBeatsFromHost, isElectronApp } from "./electron-bridge";
import { enrichAudioAnalysisWithBeatSync } from "./music-video-sync-engine";
import { MV_DURATION_MODES, resolveMusicVideoDurationContext } from "./audio-visual-music-video";

/**
 * Refine browser audio analysis with librosa beat tracking when available.
 * @param {object|null} audioAnalysis
 * @param {Blob|File|null} [audioBlob]
 * @param {{ durationMode?: string }} [opts]
 */
export async function refineAudioAnalysisWithBeatSync(audioAnalysis, audioBlob = null, opts = {}) {
  if (!audioAnalysis || !isElectronApp()) return audioAnalysis;

  const mode =
    opts.durationMode === MV_DURATION_MODES.HIGHLIGHT
      ? MV_DURATION_MODES.HIGHLIGHT
      : MV_DURATION_MODES.FULL;
  const ctx = resolveMusicVideoDurationContext(audioAnalysis, mode);

  let blob = audioBlob;
  if (!blob && typeof window !== "undefined") {
    const { resolveAudioCacheBlob } = await import("./audio-cache");
    const resolved = await resolveAudioCacheBlob(audioAnalysis);
    blob = resolved?.blob || null;
  }
  if (!blob) return audioAnalysis;

  const arrayBuffer = await blob.arrayBuffer();
  const result = await analyzeMusicVideoBeatsFromHost({
    audioBuffer: arrayBuffer,
    fileName: audioAnalysis.fileName || "track.wav",
    rangeStart: ctx.rangeStart,
    rangeEnd: ctx.rangeEnd,
  });

  if (!result?.ok) return audioAnalysis;
  return enrichAudioAnalysisWithBeatSync(audioAnalysis, result);
}
