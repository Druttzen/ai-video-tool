/**
 * Hardware tier limits — maximize quality within safe VRAM/RAM bounds.
 * Tiers derived from community GPU video-gen guidance (256px–1024px pipelines).
 */

export const HARDWARE_TIER_LIMITS = {
  ultralow: {
    label: "Ultra-low",
    qualityPreset: "DRAFT",
    numSteps: 20,
    numFrames: 65,
    cfg: 6.5,
    motionScore: 3,
    resolution: "256px",
    maxFps: 24,
    recommendLocalRender: false,
    notes: "Integrated GPU or ≤8 GB RAM — shortest clips, draft quality.",
  },
  low: {
    label: "Low",
    qualityPreset: "DRAFT",
    numSteps: 28,
    numFrames: 97,
    cfg: 7,
    motionScore: 4,
    resolution: "384px",
    maxFps: 24,
    recommendLocalRender: true,
    notes: "4–6 GB VRAM — moderate steps; prefer 384px local renders.",
  },
  medium: {
    label: "Medium",
    qualityPreset: "STANDARD",
    numSteps: 40,
    numFrames: 129,
    cfg: 7.5,
    motionScore: 5,
    resolution: "512px",
    maxFps: 30,
    recommendLocalRender: true,
    notes: "8 GB VRAM class — standard preset, 512px, full STANDARD frames.",
  },
  high: {
    label: "High",
    qualityPreset: "STANDARD",
    numSteps: 50,
    numFrames: 161,
    cfg: 8,
    motionScore: 6,
    resolution: "768px",
    maxFps: 30,
    recommendLocalRender: true,
    notes: "12 GB+ VRAM — extended frames, 768px, higher step count.",
  },
  enthusiast: {
    label: "Enthusiast",
    qualityPreset: "PREMIUM",
    numSteps: 60,
    numFrames: 193,
    cfg: 8.5,
    motionScore: 7,
    resolution: "1024px",
    maxFps: 60,
    recommendLocalRender: true,
    notes: "16 GB+ VRAM — premium preset, max frames/steps, 1024px.",
  },
  unlimited: {
    label: "Unlimited",
    qualityPreset: "PREMIUM",
    numSteps: 80,
    numFrames: 257,
    cfg: 9,
    motionScore: 8,
    resolution: "1024px",
    maxFps: 60,
    recommendLocalRender: true,
    notes: "24 GB+ VRAM & 32 GB+ RAM — pushes catalog maximums.",
  },
};

/** @param {string} tier */
export function getHardwareTierLimits(tier) {
  return HARDWARE_TIER_LIMITS[tier] || HARDWARE_TIER_LIMITS.medium;
}

/**
 * Classify machine into a render tier from gathered stats.
 * @param {import('./system-stats-types').SystemStats|null} stats
 */
export function classifyHardwareTier(stats) {
  if (!stats) return "medium";

  const vramGb = stats.primaryGpu?.vramGb ?? 0;
  const ramGb = stats.totalMemGb ?? 8;
  const cores = stats.cpuCores ?? 4;
  const hasDiscrete =
    stats.primaryGpu?.discrete === true ||
    /nvidia|radeon|geforce|rtx|gtx|quadro|arc a/i.test(stats.primaryGpu?.name || "");

  if (vramGb >= 24 && ramGb >= 32 && hasDiscrete) return "unlimited";
  if (vramGb >= 16 || (vramGb >= 12 && ramGb >= 32 && hasDiscrete)) return "enthusiast";
  if (vramGb >= 10 || (vramGb >= 8 && ramGb >= 16 && hasDiscrete)) return "high";
  if (vramGb >= 6 || (vramGb >= 4 && hasDiscrete) || (ramGb >= 16 && cores >= 8)) return "medium";
  if (vramGb >= 3 || ramGb >= 8) return "low";
  return "ultralow";
}

/**
 * Apply tier maximums to Director settings — cuts artificial caps, uses full hardware headroom.
 * @param {object} settings
 * @param {import('./system-stats-types').SystemStats|null} stats
 * @param {{ force?: boolean }} [opts]
 */
export function optimizeDirectorSettingsForHardware(settings, stats, opts = {}) {
  const tier = classifyHardwareTier(stats);
  const limits = getHardwareTierLimits(tier);
  const auto = opts.force || settings?.autoOptimizeFromHardware !== false;

  if (!auto) {
    return { settings: { ...settings, hardwareTier: tier }, tier, limits, changed: false };
  }

  const next = {
    ...settings,
    hardwareTier: tier,
    qualityPreset: limits.qualityPreset,
    numSteps: limits.numSteps,
    numFrames: limits.numFrames,
    cfg: limits.cfg,
    motionScore: limits.motionScore,
    resolution: limits.resolution,
    fps: Math.min(Number(settings.fps) || 24, limits.maxFps),
    autoOptimizeFromHardware: true,
    lastOptimizedAt: stats?.scannedAt || new Date().toISOString(),
  };

  if (limits.recommendLocalRender && settings.localPipelinePath?.trim()) {
    next.renderBackend = "local-python";
  }

  return { settings: next, tier, limits, changed: true };
}

/**
 * Clamp manual slider values to tier ceiling (never below user intent, cap only if over tier).
 * @param {object} settings
 * @param {string} tier
 */
export function clampSettingsToTierCeiling(settings, tier) {
  const limits = getHardwareTierLimits(tier);
  return {
    ...settings,
    numSteps: Math.min(Math.max(settings.numSteps || 20, 10), limits.numSteps),
    numFrames: Math.min(Math.max(settings.numFrames || 65, 17), limits.numFrames),
    motionScore: Math.min(Math.max(settings.motionScore || 3, 1), limits.motionScore),
    cfg: Math.min(Math.max(settings.cfg || 6, 4), limits.cfg),
    fps: Math.min(Math.max(settings.fps || 24, 12), limits.maxFps),
  };
}

/**
 * @param {import('./system-stats-types').SystemStats|null} stats
 */
export function formatSystemStatsSummary(stats) {
  if (!stats) return "No system scan yet";
  const gpu = stats.primaryGpu?.name || "Unknown GPU";
  const vram = stats.primaryGpu?.vramGb ? `${stats.primaryGpu.vramGb} GB VRAM` : "VRAM unknown";
  const ram = `${stats.totalMemGb?.toFixed?.(1) ?? "?"} GB RAM`;
  const cpu = `${stats.cpuCores} cores · ${stats.cpuModel?.split("@")[0]?.trim() || "CPU"}`;
  return `${gpu} (${vram}) · ${ram} · ${cpu}`;
}
