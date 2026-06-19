/**
 * Video build optimizer — scan hardware and maximize Director render settings.
 *
 * @example
 * import { scanAndOptimizeDirectorSettings } from "./video-build-optimizer";
 * const { stats, settings } = await scanAndOptimizeDirectorSettings(currentSettings);
 */
export {
  gatherSystemStats,
  gatherBrowserSystemStats,
  loadCachedSystemStats,
  saveCachedSystemStats,
  SYSTEM_STATS_STORAGE_KEY,
} from "./system-stats";

export {
  classifyHardwareTier,
  optimizeDirectorSettingsForHardware,
  clampSettingsToTierCeiling,
  getHardwareTierLimits,
  formatSystemStatsSummary,
  HARDWARE_TIER_LIMITS,
} from "./director-hardware-optimize";

export {
  computeBuildLoadReport,
  formatLoadSummary,
} from "./video-build-load";

export {
  estimateBuildDurationSeconds,
  estimateCoreBuildDurationSeconds,
  formatBuildDuration,
  formatCountdown,
  computeBuildPlan,
} from "./video-build-estimate";

export {
  computeVideoLengthPunishment,
  enrichVideoLengthPunishmentWithEstimates,
  getDurationPunishmentMultiplier,
  durationPunishmentTimeMultiplier,
  parseDurationSeconds,
  formatDurationPunishmentSummary,
  TIER_DURATION_LIMITS,
} from "./video-length-punishment";

export {
  getGpuWorkflowCatalog,
  getGpuWorkflowFunctions,
  getGpuWorkflowPresets,
  loadGpuWorkflowSettings,
  saveGpuWorkflowSettings,
  runGpuWorkflowPipeline,
  applyGpuWorkflowPreset,
  toggleGpuWorkflowFunction,
} from "./gpu-workflow-functions";

export {
  getGraphicsApiOptions,
  getComputeBackendOptions,
  buildGraphicsApiEnv,
  buildGraphicsStackPayload,
  recommendGraphicsStack,
  applyRecommendedGraphicsStack,
  formatGraphicsStackSummary,
} from "./graphics-api";

export {
  suggestBenchmarkSettings,
  scoreProjectDemand,
  applyBenchmarkSuggestion,
  autoApplyRecommendedBenchmark,
  shouldAutoApplyRecommendedBenchmark,
  buildBenchmarkAutoContextKey,
  formatBenchmarkSummary,
} from "./benchmark-settings";

export {
  resolveDirectorResolutionTier,
  resolveDirectorConfigPath,
} from "./director-prompt-builder";

import { gatherSystemStats } from "./system-stats";
import { optimizeDirectorSettingsForHardware } from "./director-hardware-optimize";

/**
 * Scan system + apply tier-max Director settings in one call.
 * @param {object} settings — current Director settings
 * @param {{ force?: boolean }} [opts]
 */
export async function scanAndOptimizeDirectorSettings(settings, opts = {}) {
  const stats = await gatherSystemStats();
  const result = optimizeDirectorSettingsForHardware(settings, stats, opts);
  return { stats, ...result };
}
