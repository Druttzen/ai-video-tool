/**
 * User-suggested benchmark settings from project demand + hardware limits.
 */
import benchmarkCatalog from "../../data/benchmark-presets.json";
import {
  classifyHardwareTier,
  getHardwareTierLimits,
} from "./director-hardware-optimize";
import { applyOutputResolution } from "./director-output-settings";
import { applyRecommendedGraphicsStack } from "./graphics-api";
import { loadCachedSystemStats } from "./system-stats";
import { computeBuildLoadReport } from "./video-build-load";
import { computeBuildPlan, estimateBuildDurationSeconds, formatBuildDuration } from "./video-build-estimate";

function countCraftFx(settings) {
  let n = 0;
  if (settings?.shotType) n += 1;
  if (settings?.cameraPreset) n += 1;
  if (settings?.lensKit) n += 1;
  if (settings?.filmFormat) n += 1;
  if (settings?.colorGrade) n += 1;
  if (settings?.lightingSetup) n += 1;
  if (settings?.refinePrompt) n += 1;
  if (settings?.useI2vWhenImage !== false) n += 1;
  return n;
}

const TIER_OUTPUT_PX = {
  ultralow: "640×360",
  low: "854×480",
  medium: "896×512",
  high: "1280×720",
  enthusiast: "1920×1080",
  unlimited: "1920×1080",
};

/**
 * Score how demanding the current project is (10–100).
 * @param {object} project
 * @param {object} settings
 */
export function scoreProjectDemand(project = {}, settings = {}) {
  let score = 38;
  const promptLen = String(project.idea || project.prompt || "").length;
  const genreCount = (project.selectedGenres || []).length;
  const fx = countCraftFx(settings);
  const duration = Number(settings.durationSeconds) || 10;

  if (promptLen > 200) score += 8;
  if (promptLen > 500) score += 10;
  if (promptLen > 1000) score += 12;
  if (genreCount >= 2) score += 6;
  if (genreCount >= 4) score += 8;
  if ((project.selectedSounds || []).length >= 2) score += 5;
  if ((project.selectedRhythms || []).length >= 2) score += 5;
  if (project.imageAnalysis || project.imagePreview) score += 6;
  if (project.generatedLyrics || project.lyricStructure) score += 8;
  if (fx >= 3) score += 8;
  if (fx >= 6) score += 10;
  if (duration >= 15) score += 10;
  if (duration >= 30) score += 15;
  if (settings.qualityPreset === "PREMIUM") score += 18;
  else if (settings.qualityPreset === "STANDARD") score += 8;
  else if (settings.qualityPreset === "DRAFT") score -= 12;
  if (settings.refinePrompt) score += 6;

  return Math.min(100, Math.max(10, score));
}

function pickQualityPreset(limits, factor, profileKey, demand) {
  const catalogProfile = benchmarkCatalog.profiles[profileKey];
  if (catalogProfile?.qualityPreset) return catalogProfile.qualityPreset;
  if (factor >= 0.9) return limits.qualityPreset;
  if (factor >= 0.6) return limits.qualityPreset === "PREMIUM" ? "STANDARD" : limits.qualityPreset;
  if (factor <= 0.4) return "DRAFT";
  if (demand >= 70) return limits.qualityPreset;
  if (demand <= 35) return "DRAFT";
  return limits.qualityPreset === "PREMIUM" ? "STANDARD" : limits.qualityPreset;
}

function scaleToFactor(limits, factor) {
  const f = Math.min(0.98, Math.max(0.2, factor));
  return {
    numSteps: Math.max(12, Math.round(limits.numSteps * f)),
    numFrames: Math.max(17, Math.round(limits.numFrames * f)),
    motionScore: Math.max(1, Math.min(limits.motionScore, Math.round(limits.motionScore * f))),
    cfg: Math.max(5, Math.min(limits.cfg, Math.round(limits.cfg * f * 10) / 10)),
    fps: Math.max(12, Math.min(limits.maxFps, Math.round(limits.maxFps * (0.7 + f * 0.3)))),
    resolution: limits.resolution,
  };
}

function recommendedLoadFactor(demand, currentLoadPercent) {
  let target = 0.55 + (demand / 100) * 0.35;
  if (currentLoadPercent > 100) target = Math.min(target, 0.75);
  else if (currentLoadPercent > 85) target = Math.min(target, 0.82);
  return Math.min(0.92, Math.max(0.45, target));
}

function buildSettingsPatch(baseSettings, limits, tier, factor, profileKey, demand, stats) {
  const scaled = scaleToFactor(limits, factor);
  const qualityPreset = pickQualityPreset(limits, factor, profileKey, demand);
  const px = TIER_OUTPUT_PX[tier] || TIER_OUTPUT_PX.medium;

  let next = {
    ...baseSettings,
    hardwareTier: tier,
    qualityPreset,
    ...scaled,
    benchmarkProfile: profileKey,
    suggestedAt: new Date().toISOString(),
  };

  next = applyOutputResolution(next, px);

  if (factor >= 0.85) {
    next = applyRecommendedGraphicsStack(next, stats);
  }

  if (profileKey === "quick-smoke") {
    next.durationSeconds = "5";
    next.bitrateMbps = Math.min(next.bitrateMbps || 8, 5);
  } else if (profileKey === "recommended" && demand >= 75) {
    next.durationSeconds = String(Math.min(Number(baseSettings.durationSeconds) || 10, 15));
  }

  return next;
}

function buildReason(profileKey, demand, tier, limits, loadPercent, estimatedLabel) {
  const demandLabel =
    demand >= 75 ? "high-detail project" : demand >= 50 ? "moderate project" : "light project";
  switch (profileKey) {
    case "quick-smoke":
      return `${limits.label} tier · ${demandLabel} — quick pipeline check in ${estimatedLabel}.`;
    case "balanced":
      return `${limits.label} tier · ${demandLabel} — stable timing baseline at ${loadPercent}% load.`;
    case "recommended":
      return `Suggested for your ${demandLabel} on ${limits.label} hardware — ${loadPercent}% load, ${estimatedLabel}.`;
    case "max-safe":
      return `Maximum safe benchmark for ${limits.label} tier without exceeding limits.`;
    default:
      return `${limits.label} tier benchmark suggestion.`;
  }
}

/**
 * @param {object} params
 * @param {object} params.settings
 * @param {import('./system-stats-types').SystemStats|null} [params.stats]
 * @param {object} [params.project]
 * @param {object} [params.buildPlan]
 * @param {{ useI2v?: boolean, promptLength?: number }} [params.opts]
 */
export function suggestBenchmarkSettings(params) {
  const {
    settings = {},
    stats = null,
    project = {},
    buildPlan = null,
    opts = {},
  } = params;

  const resolvedStats = stats ?? (typeof window !== "undefined" ? loadCachedSystemStats() : null);
  const tier = settings.hardwareTier || classifyHardwareTier(resolvedStats);
  const limits = getHardwareTierLimits(tier);
  const demand = scoreProjectDemand(project, settings);
  const currentLoad =
    buildPlan?.overallPercent ?? computeBuildLoadReport(settings, resolvedStats).overallPercent;
  const recommendedFactor = recommendedLoadFactor(demand, currentLoad);

  const profileFactors = {
    "quick-smoke": benchmarkCatalog.profiles["quick-smoke"].loadFactor,
    balanced: benchmarkCatalog.profiles.balanced.loadFactor,
    recommended: recommendedFactor,
    "max-safe": benchmarkCatalog.profiles["max-safe"].loadFactor,
  };

  const promptLength = opts.promptLength ?? String(project.idea || "").length;
  const useI2v =
    opts.useI2v ?? Boolean(settings.useI2vWhenImage && (project.imageAnalysis || project.imagePreview));

  const suggestions = [];

  for (const [profileKey, factor] of Object.entries(profileFactors)) {
    const catalogProfile = benchmarkCatalog.profiles[profileKey];
    const patch = buildSettingsPatch(
      settings,
      limits,
      tier,
      factor,
      profileKey,
      demand,
      resolvedStats,
    );
    const plan = computeBuildPlan(patch, resolvedStats, { useI2v, promptLength });

    suggestions.push({
      id: profileKey,
      label: catalogProfile?.label || profileKey,
      description: catalogProfile?.description || "",
      settings: patch,
      loadPercent: plan.overallPercent,
      overLimit: plan.overLimit,
      estimatedSeconds: plan.estimatedSeconds,
      estimatedLabel: plan.estimatedLabel,
      loadFactor: Math.round(factor * 100),
      reason: buildReason(
        profileKey,
        demand,
        tier,
        limits,
        plan.overallPercent,
        plan.estimatedLabel,
      ),
      warnings: plan.warnings || [],
    });
  }

  const primary = suggestions.find((s) => s.id === "recommended") || suggestions[1] || suggestions[0];

  return {
    tier,
    tierLabel: limits.label,
    demand,
    demandLabel: demand >= 75 ? "High" : demand >= 50 ? "Medium" : "Light",
    currentLoadPercent: currentLoad,
    primaryId: primary?.id || "recommended",
    primary,
    suggestions,
  };
}

export function formatBenchmarkSummary(report) {
  if (!report?.primary) return "Run hardware scan for benchmark suggestions";
  const p = report.primary;
  return `${p.label}: ${p.loadPercent}% load · ${p.estimatedLabel}`;
}

export function applyBenchmarkSuggestion(currentSettings, suggestion) {
  if (!suggestion?.settings) return currentSettings;
  return { ...suggestion.settings };
}

/**
 * Stable key for when project + hardware context warrants a fresh recommended apply.
 */
export function buildBenchmarkAutoContextKey({ tier, demand, useI2v, promptLength }) {
  const demandBucket = demand >= 75 ? "high" : demand >= 50 ? "med" : "low";
  const promptBucket =
    promptLength >= 500 ? "long" : promptLength >= 200 ? "mid" : "short";
  return `${tier}|${demandBucket}|${useI2v ? 1 : 0}|${promptBucket}`;
}

/** @param {object} settings */
export function shouldAutoApplyRecommendedBenchmark(settings) {
  const profile = settings?.benchmarkProfile;
  return profile == null || profile === "recommended";
}

/**
 * Apply the recommended benchmark when on the auto track and context changed.
 * Returns null when no settings update is needed.
 * @param {object} params
 * @param {object} params.settings
 * @param {ReturnType<typeof suggestBenchmarkSettings>} params.report
 * @param {{ useI2v?: boolean, promptLength?: number }} [params.opts]
 */
export function autoApplyRecommendedBenchmark({ settings, report, opts = {} }) {
  if (!report?.primary?.settings) return null;
  if (!shouldAutoApplyRecommendedBenchmark(settings)) return null;

  const useI2v = opts.useI2v ?? false;
  const promptLength = opts.promptLength ?? 0;
  const contextKey = buildBenchmarkAutoContextKey({
    tier: report.tier,
    demand: report.demand,
    useI2v,
    promptLength,
  });

  if (
    settings.benchmarkProfile === "recommended" &&
    settings.benchmarkAutoContextKey === contextKey
  ) {
    return null;
  }

  return {
    ...applyBenchmarkSuggestion(settings, report.primary),
    benchmarkAutoContextKey: contextKey,
    benchmarkAutoApplied: true,
  };
}
