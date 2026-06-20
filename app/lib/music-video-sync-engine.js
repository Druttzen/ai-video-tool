/**
 * Merge librosa beat analysis into audio analysis + clip planning helpers.
 */

/**
 * @param {object|null} audioAnalysis
 * @param {object|null} beatSyncResult
 */
export function enrichAudioAnalysisWithBeatSync(audioAnalysis, beatSyncResult) {
  if (!audioAnalysis || !beatSyncResult?.ok) return audioAnalysis;

  const bpm = Number(beatSyncResult.bpm) || audioAnalysis.bpm;
  return {
    ...audioAnalysis,
    bpm,
    estimatedBpm: `${Math.round(bpm)} BPM`,
    beatSync: {
      source: beatSyncResult.source || "librosa",
      bpm,
      beatTimes: beatSyncResult.beatTimes || [],
      onsetTimes: beatSyncResult.onsetTimes || [],
      beatCount: beatSyncResult.beatCount || (beatSyncResult.beatTimes || []).length,
      clipPlan: beatSyncResult.clipPlan || [],
      rangeStart: beatSyncResult.rangeStart,
      rangeEnd: beatSyncResult.rangeEnd,
      analyzedAt: new Date().toISOString(),
    },
  };
}

/**
 * @param {number[]} beatTimes
 * @param {number} rangeStart
 * @param {number} rangeEnd
 * @param {{ minSec?: number, maxSec?: number }} [opts]
 */
export function buildClipPlanFromBeatTimes(
  beatTimes,
  rangeStart,
  rangeEnd,
  { minSec = 4, maxSec = 8 } = {},
) {
  const beats = (beatTimes || [])
    .filter((t) => t >= rangeStart - 0.01 && t <= rangeEnd + 0.01)
    .sort((a, b) => a - b);
  if (beats.length < 2) return [];

  const clips = [];
  let i = 0;
  while (i < beats.length - 1) {
    const start = beats[i];
    let j = i + 1;
    while (j < beats.length && beats[j] - start < minSec) j += 1;
    if (j >= beats.length) break;

    let endIdx = j;
    while (endIdx + 1 < beats.length && beats[endIdx + 1] - start <= maxSec) {
      endIdx += 1;
    }

    const end = beats[endIdx];
    if (end - start >= minSec * 0.75) {
      clips.push({
        start: Math.round(start * 1000) / 1000,
        end: Math.round(end * 1000) / 1000,
        duration: Math.round((end - start) * 1000) / 1000,
      });
    }
    i = endIdx;
  }
  return clips;
}

/**
 * @param {object|null} audioAnalysis
 * @param {number} rangeStart
 * @param {number} rangeEnd
 */
export function resolveBeatTimesForRange(audioAnalysis, rangeStart, rangeEnd) {
  const librosaBeats = audioAnalysis?.beatSync?.beatTimes;
  if (Array.isArray(librosaBeats) && librosaBeats.length > 1) {
    return librosaBeats.filter((t) => t >= rangeStart - 0.01 && t <= rangeEnd + 0.01);
  }
  return null;
}
