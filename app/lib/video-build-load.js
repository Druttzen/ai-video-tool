/**
 * Build load meters — how close settings are to hardware tier limits.
 */
import { classifyHardwareTier, getHardwareTierLimits } from "./director-hardware-optimize";
import { loadCachedSystemStats } from "./system-stats";

const RESOLUTION_PX = {
  "256px": 256,
  "384px": 384,
  "512px": 512,
  "768px": 768,
  "1024px": 1024,
};

const QUALITY_LOAD = {
  DRAFT: 33,
  STANDARD: 66,
  PREMIUM: 100,
};

function pctOf(value, max) {
  if (!max || max <= 0) return 0;
  return Math.round((value / max) * 100);
}

function loadStatus(percent) {
  if (percent > 100) return "over";
  if (percent >= 85) return "warn";
  return "ok";
}

function parseResolutionPx(res) {
  if (!res) return 512;
  const key = String(res).toLowerCase();
  if (RESOLUTION_PX[key]) return RESOLUTION_PX[key];
  const m = key.match(/(\d+)/);
  return m ? Number(m[1]) : 512;
}

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

/**
 * @param {object} settings
 * @param {import('./system-stats-types').SystemStats|null} [stats]
 */
export function computeBuildLoadReport(settings, stats = null) {
  const resolvedStats = stats ?? (typeof window !== "undefined" ? loadCachedSystemStats() : null);
  const tier = settings?.hardwareTier || classifyHardwareTier(resolvedStats);
  const limits = getHardwareTierLimits(tier);

  const steps = Number(settings?.numSteps) || limits.numSteps;
  const frames = Number(settings?.numFrames) || limits.numFrames;
  const motion = Number(settings?.motionScore) || limits.motionScore;
  const cfg = Number(settings?.cfg) || limits.cfg;
  const fps = Number(settings?.fps) || 24;
  const resPx = settings?.outputWidth || parseResolutionPx(settings?.resolution || limits.resolution);
  const maxResPx = settings?.outputHeight
    ? Math.max(parseResolutionPx(limits.resolution), resPx)
    : parseResolutionPx(limits.resolution);
  const qualityKey = settings?.qualityPreset || limits.qualityPreset;
  const fxCount = countCraftFx(settings);
  const maxFx = 8;

  const metrics = [
    {
      key: "resolution",
      label: "Size",
      group: "scale",
      current: settings?.outputWidth && settings?.outputHeight
        ? `${settings.outputWidth}×${settings.outputHeight}`
        : `${resPx}px`,
      max: settings?.outputWidth && settings?.outputHeight
        ? `${parseResolutionPx(limits.resolution)}px tier`
        : `${maxResPx}px`,
      percent: pctOf(resPx, maxResPx),
    },
    {
      key: "length",
      label: "Length",
      group: "scale",
      current: `${frames} fr`,
      max: `${limits.numFrames} fr`,
      percent: pctOf(frames, limits.numFrames),
    },
    {
      key: "steps",
      label: "Quality steps",
      group: "advanced",
      current: String(steps),
      max: String(limits.numSteps),
      percent: pctOf(steps, limits.numSteps),
    },
    {
      key: "preset",
      label: "Preset",
      group: "advanced",
      current: qualityKey,
      max: limits.qualityPreset,
      percent: QUALITY_LOAD[qualityKey] ?? 66,
    },
    {
      key: "motion",
      label: "Motion FX",
      group: "fx",
      current: String(motion),
      max: String(limits.motionScore),
      percent: pctOf(motion, limits.motionScore),
    },
    {
      key: "cfg",
      label: "Guidance",
      group: "fx",
      current: String(cfg),
      max: String(limits.cfg),
      percent: pctOf(cfg, limits.cfg),
    },
    {
      key: "craft",
      label: "Craft FX",
      group: "fx",
      current: String(fxCount),
      max: String(maxFx),
      percent: pctOf(fxCount, maxFx),
    },
    {
      key: "fps",
      label: "FPS",
      group: "scale",
      current: String(fps),
      max: String(limits.maxFps),
      percent: pctOf(fps, limits.maxFps),
    },
  ].map((m) => ({ ...m, status: loadStatus(m.percent) }));

  const overallPercent = Math.round(
    metrics.reduce((sum, m) => sum + m.percent, 0) / metrics.length,
  );
  const overLimit = metrics.some((m) => m.percent > 100);
  const warnings = metrics
    .filter((m) => m.status !== "ok")
    .map((m) =>
      m.status === "over"
        ? `${m.label} exceeds tier limit (${m.current} vs ${m.max})`
        : `${m.label} near limit (${m.percent}%)`,
    );

  return {
    tier,
    limits,
    metrics,
    overallPercent,
    overLimit,
    warnings,
  };
}

export function formatLoadSummary(report) {
  if (!report) return "";
  const head = `Load ${report.overallPercent}% · ${report.limits.label} tier`;
  if (!report.warnings.length) return head;
  return `${head} · ${report.warnings[0]}`;
}
