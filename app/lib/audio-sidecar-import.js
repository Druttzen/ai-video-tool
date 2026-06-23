/**
 * Hydrate handoff audioAnalysis from a sibling WAV/MP3 sidecar file.
 */
import {
  makeAudioCacheKey,
  makeAudioLookupKey,
  putAudioCacheEntries,
} from "./audio-cache";

/**
 * @param {object} audioAnalysis
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {string} [fileName]
 */
export async function hydrateAudioSidecarAnalysis(audioAnalysis, buffer, fileName = "track.wav") {
  if (!audioAnalysis || !buffer?.byteLength) return audioAnalysis;

  const bytes = buffer instanceof ArrayBuffer ? buffer : buffer.buffer;
  const safeName = String(fileName || audioAnalysis.fileName || "track.wav").replace(/[^\w.\-()+ ]/g, "_");
  const durationSec =
    Number(audioAnalysis.durationSec ?? audioAnalysis.duration) ||
    Math.max(1, Number(audioAnalysis.beatSync?.rangeEnd) || 30);

  const blob = new Blob([bytes], { type: guessAudioMime(safeName) });
  const file = new File([blob], safeName, { lastModified: Date.now() });
  const primaryKey = makeAudioCacheKey(file);
  const cacheKeys = await putAudioCacheEntries(file, primaryKey, durationSec);

  return {
    ...audioAnalysis,
    fileName: safeName,
    duration: durationSec,
    durationSec,
    audioCacheKey: cacheKeys.audioCacheKey,
    audioLookupKey: cacheKeys.audioLookupKey || makeAudioLookupKey(safeName, durationSec),
    sidecarImported: true,
  };
}

function guessAudioMime(fileName) {
  const lower = String(fileName).toLowerCase();
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  return "audio/wav";
}
