/**
 * Director output settings — fixed px×px, fps, bitrate, codec dropdowns.
 */
import outputCatalog from "../../data/director-output-settings.json";

export function getOutputSettingsCatalog() {
  return outputCatalog;
}

export function getOutputResolutions() {
  return outputCatalog.resolutions || [];
}

export function getOutputFpsOptions() {
  return outputCatalog.fpsOptions || [];
}

export function getOutputBitrateOptions() {
  return outputCatalog.bitrateOptions || [];
}

export function getOutputVideoCodecs() {
  return outputCatalog.videoCodecs || [];
}

export function getOutputContainers() {
  return outputCatalog.containers || [];
}

export function getOutputAudioCodecs() {
  return outputCatalog.audioCodecs || [];
}

export function getOutputAudioBitrateOptions() {
  return outputCatalog.audioBitrateOptions || [];
}

export function getOutputDurationPresets() {
  return outputCatalog.durationPresets || [];
}

export function getOutputPresets() {
  return outputCatalog.outputPresets || {};
}

/** @param {string} pxLabel e.g. "1280×720" or "1280x720" */
export function normalizePxLabel(pxLabel) {
  return String(pxLabel || "").replace(/x/gi, "×").trim();
}

export function findResolutionByLabel(label) {
  const norm = normalizePxLabel(label);
  return getOutputResolutions().find(
    (r) => normalizePxLabel(`${r.width}×${r.height}`) === norm || r.label.includes(norm),
  );
}

export function findResolutionById(id) {
  return getOutputResolutions().find((r) => r.id === id);
}

/**
 * Apply a fixed px×px resolution to Director settings.
 * @param {object} settings
 * @param {string} resolutionIdOrLabel
 */
export function applyOutputResolution(settings, resolutionIdOrLabel) {
  const res =
    findResolutionById(resolutionIdOrLabel) ||
    findResolutionByLabel(resolutionIdOrLabel) ||
    getOutputResolutions().find((r) => r.label.startsWith(resolutionIdOrLabel));

  if (!res) return settings;

  const pxLabel = `${res.width}×${res.height}`;
  return {
    ...settings,
    outputResolution: pxLabel,
    outputWidth: res.width,
    outputHeight: res.height,
    outputResolutionId: res.id,
    resolution: res.tier,
    aspectRatio: res.aspectRatio || settings.aspectRatio,
    outputPreset: null,
  };
}

/**
 * Apply a named output preset (720p social, 4K, etc.).
 * @param {object} settings
 * @param {string} presetKey
 */
export function applyOutputPreset(settings, presetKey) {
  const preset = getOutputPresets()[presetKey];
  if (!preset) return settings;

  let next = { ...settings, outputPreset: presetKey };

  if (preset.outputResolution) {
    next = applyOutputResolution(next, preset.outputResolution);
  }
  if (preset.aspectRatio) next.aspectRatio = preset.aspectRatio;
  if (preset.fps != null) next.fps = preset.fps;
  if (preset.bitrateMbps != null) next.bitrateMbps = preset.bitrateMbps;
  if (preset.videoCodec) next.videoCodec = preset.videoCodec;
  if (preset.container) next.container = preset.container;
  if (preset.audioCodec) next.audioCodec = preset.audioCodec;
  if (preset.audioBitrateKbps) next.audioBitrateKbps = preset.audioBitrateKbps;

  next.outputPreset = presetKey;
  return next;
}

/**
 * Migrate legacy tier-only resolution to px×px fields.
 * @param {object} settings
 */
export function migrateOutputSettings(settings) {
  if (settings.outputWidth && settings.outputHeight) return settings;

  const tierMap = {
    "256px": "640×360",
    "384px": "854×480",
    "512px": "896×512",
    "768px": "1280×720",
    "1024px": "1920×1080",
  };
  const label = tierMap[settings.resolution] || "896×512";
  return applyOutputResolution(settings, label);
}

export function filterResolutionsByAspect(aspectRatio) {
  if (!aspectRatio) return getOutputResolutions();
  return getOutputResolutions().filter((r) => r.aspectRatio === aspectRatio);
}

export function formatOutputSettingsSummary(settings) {
  const w = settings.outputWidth || "?";
  const h = settings.outputHeight || "?";
  const fps = settings.fps ?? 24;
  const mb = settings.bitrateMbps ?? "?";
  const codec = (settings.videoCodec || "h264").toUpperCase();
  const container = (settings.container || "mp4").toUpperCase();
  return `${w}×${h} · ${fps} fps · ${mb} Mbit/s · ${codec} · ${container}`;
}

export function buildOutputEncodingHints(settings) {
  return {
    width: settings.outputWidth,
    height: settings.outputHeight,
    fps: settings.fps,
    videoBitrateMbps: settings.bitrateMbps,
    videoCodec: settings.videoCodec,
    container: settings.container,
    audioCodec: settings.audioCodec,
    audioBitrateKbps: settings.audioBitrateKbps,
    outputResolution: settings.outputResolution,
  };
}
