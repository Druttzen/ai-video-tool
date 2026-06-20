/** Max music track / video output length (seconds). */
export const MAX_MEDIA_DURATION_SEC = 480;

/** @deprecated use MAX_MEDIA_DURATION_SEC */
export const MAX_SONG_DURATION_SEC = MAX_MEDIA_DURATION_SEC;

/**
 * @param {number} sec
 * @returns {number}
 */
export function clampMediaDurationSec(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return 10;
  return Math.min(MAX_MEDIA_DURATION_SEC, Math.round(n * 10) / 10);
}

/**
 * @param {number} durationSec
 * @param {number} [fps]
 * @returns {number}
 */
export function mediaNumFramesForDuration(durationSec, fps = 24) {
  const dur = clampMediaDurationSec(durationSec);
  const fpsN = Number(fps) || 24;
  const frameCap = Math.round(MAX_MEDIA_DURATION_SEC * fpsN);
  return Math.max(17, Math.min(frameCap, Math.round(dur * fpsN)));
}
