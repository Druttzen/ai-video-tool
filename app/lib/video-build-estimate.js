/**
 * Estimate local GPU render duration from build settings + hardware tier.
 */
import { classifyHardwareTier, getHardwareTierLimits } from "./director-hardware-optimize";
import { loadCachedSystemStats } from "./system-stats";
import { computeBuildLoadReport } from "./video-build-load";
import { getDurationPunishmentMultiplier } from "./video-length-punishment";

const RESOLUTION_COST = {
  "256px": 1,
  "384px": 1.6,
  "512px": 2.4,
  "768px": 4.5,
  "1024px": 7,
};

const TIER_GPU_SPEED = {
  ultralow: 0.35,
  low: 0.55,
  medium: 1,
  high: 1.45,
  enthusiast: 2.1,
  unlimited: 2.8,
};

/** Base seconds for STANDARD @ 512px on medium tier GPU */
const BASE_SECONDS = 180;

function resolutionCost(res) {
  const key = String(res || "512px").toLowerCase();
  return RESOLUTION_COST[key] || 2.4;
}

/**
 * @param {object} settings
 * @param {import('./system-stats-types').SystemStats|null} [stats]
 * @param {{ useI2v?: boolean, promptLength?: number }} [opts]
 */
export function estimateBuildDurationSeconds(settings, stats = null, opts = {}) {
  const resolvedStats = stats ?? (typeof window !== "undefined" ? loadCachedSystemStats() : null);
  const seconds = estimateCoreBuildDurationSeconds(settings, resolvedStats, opts);

  if (!opts.skipDurationPunishment) {
    return Math.max(30, Math.round(seconds * getDurationPunishmentMultiplier(settings, resolvedStats)));
  }
  return Math.max(30, Math.round(seconds));
}

/**
 * Core render estimate before video-length punishment multiplier.
 * @param {object} settings
 * @param {import('./system-stats-types').SystemStats|null} [stats]
 * @param {{ useI2v?: boolean, promptLength?: number }} [opts]
 */
export function estimateCoreBuildDurationSeconds(settings, stats = null, opts = {}) {
  const resolvedStats = stats ?? (typeof window !== "undefined" ? loadCachedSystemStats() : null);
  const tier = settings?.hardwareTier || classifyHardwareTier(resolvedStats);
  const limits = getHardwareTierLimits(tier);
  const gpuSpeed = TIER_GPU_SPEED[tier] || 1;

  const steps = Number(settings?.numSteps) || limits.numSteps;
  const frames = Number(settings?.numFrames) || limits.numFrames;
  const motion = Number(settings?.motionScore) || limits.motionScore;
  const resFactor = resolutionCost(settings?.resolution || limits.resolution);
  const i2v = opts.useI2v ?? Boolean(settings?.useI2vWhenImage);
  const promptLen = opts.promptLength ?? 0;

  let seconds =
    BASE_SECONDS *
    (steps / 40) *
    (frames / 129) *
    (resFactor / 2.4) *
    (1 + (motion - 4) * 0.06) *
    (1 / gpuSpeed);

  if (i2v) seconds *= 1.25;
  if (settings?.refinePrompt) seconds *= 1.15;
  if (promptLen > 800) seconds *= 1 + Math.min(0.2, (promptLen - 800) / 4000);

  const load = computeBuildLoadReport(settings, resolvedStats);
  if (load.overallPercent > 100) seconds *= 1 + (load.overallPercent - 100) / 200;

  return Math.max(30, Math.round(seconds));
}

export function formatBuildDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `~${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm ? `~${h}h ${rm}m` : `~${h}h`;
  }
  return r ? `~${m}m ${r}s` : `~${m}m`;
}

export function formatCountdown(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m > 0) return `${m}:${String(r).padStart(2, "0")}`;
  return `${s}s`;
}

import { enrichVideoLengthPunishmentWithEstimates } from "./video-length-punishment";

/**
 * Full build plan for UI + job payload.
 */
export function computeBuildPlan(settings, stats = null, opts = {}) {
  const load = computeBuildLoadReport(settings, stats);
  const estimateOpts = { ...opts, skipDurationPunishment: true };
  const durationPunishment = enrichVideoLengthPunishmentWithEstimates(settings, stats, {
    estimateCoreSeconds: (s) => estimateCoreBuildDurationSeconds(s, stats, estimateOpts),
  });
  const estimatedSeconds = estimateBuildDurationSeconds(settings, stats, opts);
  const overallWithDuration = Math.round((load.overallPercent + durationPunishment.punishmentPercent) / 2);

  const durationPunishmentUi = {
    ...durationPunishment,
    baselineBuildLabel: formatBuildDuration(durationPunishment.baselineBuildSeconds ?? estimatedSeconds),
    estimatedBuildLabel: formatBuildDuration(durationPunishment.estimatedBuildSeconds ?? estimatedSeconds),
    suggestedBuildLabel: durationPunishment.suggestedBuildSeconds
      ? formatBuildDuration(durationPunishment.suggestedBuildSeconds)
      : null,
    extraDurationLabel: durationPunishment.extraDurationSeconds
      ? formatBuildDuration(durationPunishment.extraDurationSeconds)
      : null,
    timeSavedLabel: durationPunishment.timeSavedSeconds
      ? formatBuildDuration(durationPunishment.timeSavedSeconds)
      : null,
  };

  return {
    ...load,
    durationPunishment: durationPunishmentUi,
    estimatedSeconds,
    estimatedLabel: formatBuildDuration(estimatedSeconds),
    overallWithDurationPunishment: overallWithDuration,
  };
}
