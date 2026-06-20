/**
 * Video length punishment — how output duration stresses hardware vs tier comfort limits.
 */
import { classifyHardwareTier, getHardwareTierLimits } from "./director-hardware-optimize";
import { clampMediaDurationSec } from "./media-duration-limits";
import { loadCachedSystemStats } from "./system-stats";

/** Per-tier comfortable vs max output duration (seconds). */
export const TIER_DURATION_LIMITS = {
  ultralow: { comfortSec: 5, idealSec: 5, maxSec: 10, pointWeight: 4 },
  low: { comfortSec: 8, idealSec: 8, maxSec: 15, pointWeight: 3 },
  medium: { comfortSec: 10, idealSec: 10, maxSec: 20, pointWeight: 3 },
  high: { comfortSec: 15, idealSec: 12, maxSec: 30, pointWeight: 2.5 },
  enthusiast: { comfortSec: 20, idealSec: 15, maxSec: 45, pointWeight: 2 },
  unlimited: { comfortSec: 30, idealSec: 20, maxSec: 480, pointWeight: 1.5 },
};

export function parseDurationSeconds(settings) {
  const raw = settings?.durationSeconds ?? settings?.duration ?? "10";
  const n = Number(String(raw).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return 10;
  return clampMediaDurationSec(n);
}

function loadStatus(percent, overLimit) {
  if (overLimit || percent > 100) return "over";
  if (percent >= 50) return "warn";
  return "ok";
}

/**
 * Multiplier applied to core build estimate from chosen output duration.
 * @param {number} durationSec
 * @param {keyof typeof TIER_DURATION_LIMITS} tier
 */
export function durationPunishmentTimeMultiplier(durationSec, tier) {
  const limits = TIER_DURATION_LIMITS[tier] || TIER_DURATION_LIMITS.medium;
  const ratio = durationSec / limits.comfortSec;

  if (ratio <= 1) return 0.92 + 0.08 * ratio;
  if (durationSec <= limits.maxSec) return Math.pow(ratio, 1.35);
  return Math.pow(ratio, 1.55) * (1 + ((durationSec - limits.maxSec) / limits.maxSec) * 0.35);
}

/**
 * @param {object} settings
 * @param {import('./system-stats-types').SystemStats|null} [stats]
 */
export function computeVideoLengthPunishment(settings, stats = null) {
  const resolvedStats = stats ?? (typeof window !== "undefined" ? loadCachedSystemStats() : null);
  const tier = settings?.hardwareTier || classifyHardwareTier(resolvedStats);
  const tierMeta = getHardwareTierLimits(tier);
  const limits = TIER_DURATION_LIMITS[tier] || TIER_DURATION_LIMITS.medium;
  const durationSec = parseDurationSeconds(settings);
  const ratio = durationSec / limits.comfortSec;
  const timeMultiplier = durationPunishmentTimeMultiplier(durationSec, tier);

  let punishmentPercent;
  let punishmentPoints;

  if (durationSec <= limits.comfortSec) {
    punishmentPercent = Math.round((durationSec / limits.comfortSec) * 28);
    punishmentPoints = 0;
  } else if (durationSec <= limits.maxSec) {
    const span = Math.max(1, limits.maxSec - limits.comfortSec);
    const over = durationSec - limits.comfortSec;
    punishmentPercent = Math.round(28 + (over / span) * 72);
    punishmentPoints = Math.round(over * limits.pointWeight);
  } else {
    const overMax = durationSec - limits.maxSec;
    punishmentPercent = Math.min(
      150,
      Math.round(100 + (overMax / limits.maxSec) * 50),
    );
    punishmentPoints = Math.round((durationSec - limits.comfortSec) * limits.pointWeight * 1.25);
  }

  const overLimit = durationSec > limits.maxSec || punishmentPercent > 100;
  const status = loadStatus(punishmentPercent, overLimit);

  let suggestedDurationSec = durationSec;
  if (punishmentPercent >= 85 || overLimit) {
    suggestedDurationSec = limits.idealSec;
  } else if (punishmentPercent >= 50) {
    suggestedDurationSec = limits.comfortSec;
  }

  const secondsOverComfort = Math.max(0, durationSec - limits.comfortSec);

  return {
    tier,
    tierLabel: tierMeta.label,
    durationSec,
    comfortSec: limits.comfortSec,
    idealSec: limits.idealSec,
    maxSec: limits.maxSec,
    ratio: Math.round(ratio * 100) / 100,
    punishmentPercent,
    punishmentPoints,
    timeMultiplier,
    status,
    overLimit,
    secondsOverComfort,
    suggestedDurationSec,
    suggestedDurationLabel: `${suggestedDurationSec}s`,
    summary: buildPunishmentSummary({
      durationSec,
      limits,
      punishmentPercent,
      punishmentPoints,
      tierLabel: tierMeta.label,
      status,
    }),
  };
}

function buildPunishmentSummary({
  durationSec,
  limits,
  punishmentPercent,
  punishmentPoints,
  tierLabel,
  status,
}) {
  if (status === "ok" && punishmentPoints === 0) {
    return `${durationSec}s fits ${tierLabel} tier comfort (${limits.comfortSec}s target).`;
  }
  if (status === "over") {
    return `${durationSec}s exceeds ${tierLabel} max (${limits.maxSec}s) — +${punishmentPoints} punishment pts.`;
  }
  if (punishmentPoints > 0) {
    return `${durationSec}s vs ${limits.comfortSec}s comfort — +${punishmentPoints} punishment pts (${punishmentPercent}%).`;
  }
  return `${durationSec}s on ${tierLabel} tier — ${punishmentPercent}% length load.`;
}

/**
 * @param {object} settings
 * @param {import('./system-stats-types').SystemStats|null} [stats]
 * @param {{ estimateCoreSeconds?: (s: object) => number }} [opts]
 */
export function enrichVideoLengthPunishmentWithEstimates(settings, stats, opts = {}) {
  const report = computeVideoLengthPunishment(settings, stats);
  const estimateCore = opts.estimateCoreSeconds;
  if (!estimateCore) {
    return report;
  }

  const coreSeconds = estimateCore(settings);
  const suggestedSettings = {
    ...settings,
    durationSeconds: String(report.suggestedDurationSec),
  };
  const coreSuggested = estimateCore(suggestedSettings);
  const suggestedMult = durationPunishmentTimeMultiplier(report.suggestedDurationSec, report.tier);

  const baselineBuildSeconds = Math.max(30, Math.round(coreSeconds));
  const estimatedBuildSeconds = Math.max(30, Math.round(coreSeconds * report.timeMultiplier));
  const suggestedBuildSeconds = Math.max(30, Math.round(coreSuggested * suggestedMult));
  const extraDurationSeconds = Math.max(0, estimatedBuildSeconds - baselineBuildSeconds);
  const timeSavedSeconds = Math.max(0, estimatedBuildSeconds - suggestedBuildSeconds);

  return {
    ...report,
    baselineBuildSeconds,
    estimatedBuildSeconds,
    suggestedBuildSeconds,
    extraDurationSeconds,
    timeSavedSeconds,
    buildSuggestion:
      timeSavedSeconds >= 15 && report.suggestedDurationSec !== report.durationSec
        ? {
            durationSec: report.suggestedDurationSec,
            durationLabel: report.suggestedDurationLabel,
            buildSeconds: suggestedBuildSeconds,
            savedSeconds: timeSavedSeconds,
          }
        : null,
  };
}

export function getDurationPunishmentMultiplier(settings, stats = null) {
  const report = computeVideoLengthPunishment(settings, stats);
  return report.timeMultiplier;
}

export function formatDurationPunishmentSummary(report) {
  if (!report) return "";
  const head = `Length punishment ${report.punishmentPercent}% · +${report.punishmentPoints} pts`;
  if (report.buildSuggestion && report.suggestedBuildLabel) {
    return `${head} · Try ${report.buildSuggestion.durationLabel} for ${report.suggestedBuildLabel}`;
  }
  return head;
}
