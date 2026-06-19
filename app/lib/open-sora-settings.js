/** Local Open-Sora install + pipeline defaults (mirrors E:\\Open-Sora\\config.json + app_pro presets). */

export const OPEN_SORA_SETTINGS_KEY = "ai_video_creator_open_sora_settings_v1";

export const OPEN_SORA_PRESETS = {
  FAST: { steps: 8, cfg: 6.5, resolution: "512x288", label: "Fast preview" },
  CINEMATIC: { steps: 16, cfg: 7.5, resolution: "768x432", label: "Cinematic" },
  ULTRA: { steps: 32, cfg: 9.0, resolution: "1024x576", label: "Ultra quality" },
};

export const DEFAULT_OPEN_SORA_SETTINGS = {
  installPath: "E:\\Open-Sora",
  pythonPath: "python",
  preset: "CINEMATIC",
  steps: 16,
  cfg: 7.5,
  resolution: "640x360",
  fps: 16,
  seed: 0,
  motionScore: 4,
  sampler: "ddim",
  device: "cuda",
  refinePrompt: false,
  useI2vWhenImage: true,
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
    resolution: p.resolution,
  };
}
