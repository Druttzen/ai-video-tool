/**
 * Beat-sync clip plan helpers for multi-segment local production.
 */

export const DEFAULT_PRODUCTION_MAX_CLIPS = 8;

/**
 * @param {object|null} audioAnalysis
 * @param {number} [maxClips]
 */
export function resolveProductionClipPlan(audioAnalysis, maxClips = DEFAULT_PRODUCTION_MAX_CLIPS) {
  const clipPlan = audioAnalysis?.beatSync?.clipPlan;
  if (!Array.isArray(clipPlan) || clipPlan.length < 2) return [];
  const cap = Math.max(2, Math.min(Number(maxClips) || DEFAULT_PRODUCTION_MAX_CLIPS, 24));
  return clipPlan.slice(0, cap);
}

/**
 * @param {number} durationSec
 * @param {number} [fps]
 */
export function clipFramesForDuration(durationSec, fps = 16) {
  const frames = Math.round(Math.max(1, Number(durationSec) || 4) * Math.max(8, fps));
  return Math.max(17, Math.min(frames, 81));
}

/**
 * @param {string} basePrompt
 * @param {object} clip
 * @param {number} index
 * @param {number} total
 */
export function buildClipSegmentPrompt(basePrompt, clip, index, total) {
  const start = Number(clip?.start) || 0;
  const end = Number(clip?.end) || start + (Number(clip?.duration) || 4);
  const label = clip?.label ? ` ${clip.label}` : "";
  const header = `[MV segment ${index + 1}/${total} · ${start.toFixed(1)}s–${end.toFixed(1)}s${label} · cut on beat]`;
  const body = String(basePrompt || "").trim();
  return body ? `${header}\n${body}` : header;
}
