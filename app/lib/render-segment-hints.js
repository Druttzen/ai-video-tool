/**
 * Clarify song-length prompt timelines vs single diffusion segment renders.
 */
import { getHardwareTierLimits } from "./director-hardware-optimize";

const LOCAL_RENDER_FRAME_CAP = 257;
/**
 * @param {number} numFrames
 * @param {number} [fps]
 */
export function segmentDurationFromFrames(numFrames, fps = 24) {
  const frames = Math.max(1, Number(numFrames) || 1);
  const rate = Math.max(1, Number(fps) || 24);
  return Math.round((frames / rate) * 10) / 10;
}

/**
 * @param {object} [params]
 * @param {number} [params.songDurationSec]
 * @param {number} [params.numFrames]
 * @param {number} [params.fps]
 */
export function buildRenderHonestyNote({ songDurationSec, numFrames, fps = 24 } = {}) {
  const song = Math.max(0, Number(songDurationSec) || 0);
  const segment = segmentDurationFromFrames(numFrames, fps);
  if (!song || song <= segment + 0.5) {
    return `Local render segment: ~${segment}s (${numFrames || "?"} frames @ ${fps} fps).`;
  }
  return `Prompt timeline: ${song}s · local render produces one ~${segment}s segment (${numFrames || "?"} frames @ ${fps} fps). Use clip plan + FFmpeg assemble for full-track MV.`;
}

/**
 * @param {object} [directorSettings]
 */
export function resolveHonestRenderNumFrames(directorSettings = {}) {
  const requested = Math.max(17, Number(directorSettings.numFrames) || 129);
  const tier = directorSettings.hardwareTier;
  if (tier) {
    const limits = getHardwareTierLimits(tier);
    return Math.min(requested, limits.numFrames);
  }
  return Math.min(requested, LOCAL_RENDER_FRAME_CAP);
}

/**
 * @param {object} [directorSettings]
 * @param {number} [songDurationSec]
 */
export function buildRenderHonestyNoteFromDirectorSettings(directorSettings, songDurationSec) {
  const fps = Number(directorSettings?.fps) || 24;
  const renderFrames = resolveHonestRenderNumFrames(directorSettings);
  return buildRenderHonestyNote({ songDurationSec, numFrames: renderFrames, fps });
}
