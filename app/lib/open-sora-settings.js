/** Local Open-Sora install + pipeline defaults (mirrors E:\\Open-Sora\\config.json + app_pro presets). */

import { getOpenSoraInstallDefaults } from "./open-sora-catalog";
import { getDefaultOpenSoraInstallPath } from "./open-sora-paths";

export const OPEN_SORA_SETTINGS_KEY = "ai_video_creator_open_sora_settings_v1";

export const OPEN_SORA_PRESETS = {
  FAST: {
    steps: 8,
    cfg: 6.5,
    numSteps: 30,
    numFrames: 65,
    resolutionTier: "256px",
    label: "Fast preview",
  },
  CINEMATIC: {
    steps: 16,
    cfg: 7.5,
    numSteps: 50,
    numFrames: 129,
    resolutionTier: "256px",
    label: "Cinematic",
  },
  ULTRA: {
    steps: 32,
    cfg: 9.0,
    numSteps: 50,
    numFrames: 129,
    resolutionTier: "768px",
    label: "Ultra quality",
  },
};

const installDefaults = getOpenSoraInstallDefaults();

export const DEFAULT_OPEN_SORA_SETTINGS = {
  installPath: getDefaultOpenSoraInstallPath(),
  pythonPath: "python",
  preset: "CINEMATIC",
  configPreset: "t2i2v_256px",
  aspectRatio: "16:9",
  resolutionTier: "256px",
  steps: installDefaults.steps,
  numSteps: 50,
  numFrames: 129,
  cfg: installDefaults.cfg,
  resolution: installDefaults.resolution,
  fps: 24,
  seed: 0,
  motionScore: 4,
  durationSeconds: "10",
  sampler: "ddim",
  device: "cuda",
  refinePrompt: false,
  useI2vWhenImage: true,
  styleProfile: "cinematic",
  shotType: "",
  cameraPreset: "",
  lensKit: "",
  filmFormat: "",
  colorGrade: "",
  lightingSetup: "",
};

export function loadOpenSoraSettingsFromStorage() {
  if (typeof window === "undefined") return { ...DEFAULT_OPEN_SORA_SETTINGS };
  try {
    const raw = localStorage.getItem(OPEN_SORA_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_OPEN_SORA_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_OPEN_SORA_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_OPEN_SORA_SETTINGS };
  }
}

export function saveOpenSoraSettingsToStorage(settings) {
  if (typeof window === "undefined") return { ok: false, reason: "no-window" };
  try {
    localStorage.setItem(OPEN_SORA_SETTINGS_KEY, JSON.stringify(settings));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e?.message || "storage-failed" };
  }
}

export function applyOpenSoraPreset(settings, presetName) {
  const p = OPEN_SORA_PRESETS[presetName];
  if (!p) return settings;
  return {
    ...settings,
    preset: presetName,
    steps: p.steps,
    cfg: p.cfg,
    numSteps: p.numSteps,
    numFrames: p.numFrames,
    resolutionTier: p.resolutionTier,
  };
}

export function applyInstallConfigToSettings(settings, installConfig) {
  if (!installConfig?.pipeline) return settings;
  const p = installConfig.pipeline;
  return {
    ...settings,
    steps: p.default_steps ?? settings.steps,
    cfg: p.default_cfg ?? settings.cfg,
    resolution: p.default_resolution ?? settings.resolution,
  };
}

export function resolveConfigPresetPath(settings, catalogPresets) {
  const list = catalogPresets || [];
  const match = list.find((x) => x.id === settings.configPreset);
  return match?.path || "configs/diffusion/inference/t2i2v_256px.py";
}

export function resolveResolutionTier(settings, catalogPresets) {
  const list = catalogPresets || [];
  const match = list.find((x) => x.id === settings.configPreset);
  return match?.resolutionTier || settings.resolutionTier || "256px";
}

