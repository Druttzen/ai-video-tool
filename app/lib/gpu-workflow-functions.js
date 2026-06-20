/**
 * GPU-enhanced workflow functions — catalog, settings, and apply logic.
 */
import catalog from "../../data/gpu-workflow-functions.json";
import {
  classifyHardwareTier,
  getHardwareTierLimits,
  optimizeDirectorSettingsForHardware,
} from "./director-hardware-optimize";
import { applyOutputResolution } from "./director-output-settings";
import { applyRecommendedGraphicsStack } from "./graphics-api";
import { applyDirectorQualityPreset } from "./director-settings";
import { gatherSystemStats, loadCachedSystemStats } from "./system-stats";
import { computeBuildPlan } from "./video-build-estimate";
import { isElectronApp } from "./electron-bridge";

export const GPU_WORKFLOW_STORAGE_KEY = "ai_video_creator_gpu_workflow_v1";

export const DEFAULT_GPU_WORKFLOW_SETTINGS = {
  enabledIds: catalog.functions.filter((f) => f.defaultEnabled).map((f) => f.id),
  autoRunOnWorkflow: true,
  autoRunBeforeRender: true,
  vramGuardMode: "warn",
  activePreset: null,
  seedVariationCount: catalog.functions.find((f) => f.id === "seed-variations")?.config?.defaultSeeds ?? 3,
};

export function getGpuWorkflowCatalog() {
  return catalog;
}

export function getGpuWorkflowFunctions() {
  return catalog.functions || [];
}

export function getGpuWorkflowPresets() {
  return catalog.presets || {};
}

export function loadGpuWorkflowSettings() {
  if (typeof window === "undefined") return { ...DEFAULT_GPU_WORKFLOW_SETTINGS };
  try {
    const raw = localStorage.getItem(GPU_WORKFLOW_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GPU_WORKFLOW_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_GPU_WORKFLOW_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_GPU_WORKFLOW_SETTINGS };
  }
}

export function saveGpuWorkflowSettings(settings) {
  if (typeof window === "undefined") return { ok: false, reason: "no-window" };
  try {
    localStorage.setItem(GPU_WORKFLOW_STORAGE_KEY, JSON.stringify(settings));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e?.message || "storage-failed" };
  }
}

export function isGpuFunctionAvailable(fn, ctx = {}) {
  if (fn.requiresElectron && !ctx.isElectron && !isElectronApp()) return false;
  if (fn.requiresPipeline && !ctx.hasPipeline && !String(ctx.pipelinePath || "").trim()) {
    return false;
  }
  return true;
}

export function getGpuFunctionAvailability(fn, ctx = {}) {
  if (fn.requiresElectron && !ctx.isElectron && !isElectronApp()) {
    return { available: false, reason: "Requires desktop app" };
  }
  if (fn.requiresPipeline && !ctx.hasPipeline && !String(ctx.pipelinePath || "").trim()) {
    return { available: false, reason: "Set local pipeline in Director → Advanced" };
  }
  return { available: true, reason: "" };
}

export function toggleGpuWorkflowFunction(settings, functionId, enabled) {
  const set = new Set(settings.enabledIds || []);
  if (enabled) set.add(functionId);
  else set.delete(functionId);
  return {
    ...settings,
    enabledIds: [...set],
    activePreset: null,
  };
}

export function applyGpuWorkflowPreset(settings, presetKey) {
  const preset = catalog.presets[presetKey];
  if (!preset) return settings;
  return {
    ...settings,
    enabledIds: [...preset.functionIds],
    activePreset: presetKey,
  };
}

function isEnabled(settings, id) {
  return (settings.enabledIds || []).includes(id);
}

/**
 * Apply enabled GPU functions to Director settings (sync transforms).
 */
export function applyGpuFunctionsToSettings(settings, stats, gpuSettings, ctx = {}) {
  const tier = settings.hardwareTier || classifyHardwareTier(stats);
  const limits = getHardwareTierLimits(tier);
  let next = { ...settings, hardwareTier: tier };
  const applied = [];

  if (isEnabled(gpuSettings, "auto-optimize")) {
    const { settings: optimized } = optimizeDirectorSettingsForHardware(next, stats, { force: true });
    next = optimized;
    applied.push("auto-optimize");
  }

  if (isEnabled(gpuSettings, "max-resolution")) {
    const tierRes = getHardwareTierLimits(tier).resolution;
    const tierMap = {
      "256px": "640×360",
      "384px": "854×480",
      "512px": "896×512",
      "768px": "1280×720",
      "1024px": "1920×1080",
    };
    next = applyOutputResolution(next, tierMap[tierRes] || tierMap["512px"]);
    applied.push("max-resolution");
  }

  if (isEnabled(gpuSettings, "premium-quality")) {
    next = applyDirectorQualityPreset(next, limits.qualityPreset);
    applied.push("premium-quality");
  }

  if (isEnabled(gpuSettings, "motion-fx-boost")) {
    next.motionScore = limits.motionScore;
    applied.push("motion-fx-boost");
  }

  if (isEnabled(gpuSettings, "i2v-accelerated")) {
    next.useI2vWhenImage = true;
    applied.push("i2v-accelerated");
  }

  if (isEnabled(gpuSettings, "local-render") && isGpuFunctionAvailable({ requiresPipeline: true }, ctx)) {
    if (ctx.hasPipeline || String(next.localPipelinePath || "").trim()) {
      next.renderBackend = "local-python";
      applied.push("local-render");
    }
  }

  if (isEnabled(gpuSettings, "auto-graphics-api")) {
    next = applyRecommendedGraphicsStack(next, stats);
    applied.push("auto-graphics-api");
  }

  if (isEnabled(gpuSettings, "seed-variations")) {
    const count = Math.min(
      gpuSettings.seedVariationCount || 3,
      catalog.functions.find((f) => f.id === "seed-variations")?.config?.maxSeeds ?? 4,
    );
    next.gpuSeedVariationCount = count;
    applied.push("seed-variations");
  } else {
    delete next.gpuSeedVariationCount;
  }

  next.gpuWorkflowAppliedAt = new Date().toISOString();
  return { settings: next, applied, tier, limits };
}

/**
 * Full async GPU workflow pipeline.
 * @param {{ settings: object, gpuSettings?: object, stats?: object|null, hasImageRef?: boolean, promptLength?: number, hook?: string }} params
 */
export async function runGpuWorkflowPipeline(params) {
  const gpuSettings = params.gpuSettings || loadGpuWorkflowSettings();
  const hook = params.hook || "before_render";
  const fns = getGpuWorkflowFunctions().filter((f) => !f.hooks?.length || f.hooks.includes(hook));
  const enabledOnHook = fns.filter((f) => isEnabled(gpuSettings, f.id));

  const ctx = {
    isElectron: isElectronApp(),
    hasPipeline: Boolean(String(params.settings?.localPipelinePath || "").trim()),
    pipelinePath: params.settings?.localPipelinePath,
    hasImageRef: params.hasImageRef,
  };

  let stats = params.stats ?? loadCachedSystemStats();
  let settings = { ...params.settings };
  const applied = [];
  const warnings = [];
  const blockers = [];
  const skipped = [];

  for (const fn of enabledOnHook) {
    const avail = getGpuFunctionAvailability(fn, ctx);
    if (!avail.available) {
      skipped.push({ id: fn.id, reason: avail.reason });
      continue;
    }
  }

  const skippedIds = new Set(skipped.map((s) => s.id));
  const filteredGpuSettings = {
    ...gpuSettings,
    enabledIds: (gpuSettings.enabledIds || []).filter((id) => !skippedIds.has(id)),
  };

  if (isEnabled(gpuSettings, "scan-hardware")) {
    stats = await gatherSystemStats();
    applied.push("scan-hardware");
  }

  const transform = applyGpuFunctionsToSettings(settings, stats, filteredGpuSettings, ctx);
  settings = transform.settings;
  applied.push(...transform.applied.filter((id) => !applied.includes(id)));

  const buildPlan = computeBuildPlan(settings, stats, {
    useI2v: settings.useI2vWhenImage !== false && ctx.hasImageRef,
    promptLength: params.promptLength || 0,
  });

  if (isEnabled(gpuSettings, "vram-guard") && buildPlan.overLimit) {
    const msg = `Build load ${buildPlan.overallPercent}% exceeds tier limits`;
    if (gpuSettings.vramGuardMode === "block") blockers.push(msg);
    else warnings.push(msg);
  }

  if (isEnabled(gpuSettings, "i2v-accelerated") && !ctx.hasImageRef) {
    warnings.push("I2V enabled — load a reference image in Analyzers for GPU conditioning");
  }

  return {
    ok: blockers.length === 0,
    settings,
    stats,
    buildPlan,
    applied: [...new Set(applied)],
    warnings,
    blockers,
    skipped,
    enabledCount: gpuSettings.enabledIds?.length || 0,
  };
}

export function formatGpuWorkflowSummary(result) {
  if (!result) return "";
  const parts = [];
  if (result.applied?.length) parts.push(`Applied: ${result.applied.join(", ")}`);
  if (result.warnings?.length) parts.push(`⚠ ${result.warnings[0]}`);
  if (result.blockers?.length) parts.push(`Blocked: ${result.blockers[0]}`);
  return parts.join(" · ") || "GPU workflow ready";
}
