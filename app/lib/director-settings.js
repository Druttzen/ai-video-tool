import { getDirectorQualityPresets } from "./director-catalog";
import { DEFAULT_LOCAL_RENDER_ENGINE, normalizeLocalRenderEngine } from "./local-render-engine";

export const DIRECTOR_SETTINGS_KEY = "ai_video_creator_director_settings_v1";
export const LEGACY_OPEN_SORA_SETTINGS_KEY = "ai_video_creator_open_sora_settings_v1";

const QUALITY = getDirectorQualityPresets();

export const DEFAULT_DIRECTOR_SETTINGS = {
  renderBackend: "export",
  localPythonPath: "python",
  localPipelinePath: "",
  qualityPreset: "STANDARD",
  aspectRatio: "16:9",
  numSteps: QUALITY.STANDARD?.numSteps ?? 40,
  numFrames: QUALITY.STANDARD?.numFrames ?? 129,
  cfg: QUALITY.STANDARD?.cfg ?? 7.5,
  motionScore: QUALITY.STANDARD?.motion ?? 4,
  fps: 24,
  seed: 0,
  durationSeconds: "10",
  refinePrompt: false,
  useI2vWhenImage: true,
  styleProfile: "cinematic",
  shotType: "",
  cameraPreset: "",
  lensKit: "",
  filmFormat: "",
  colorGrade: "",
  lightingSetup: "",
  resolution: "512px",
  outputResolution: "896×512",
  outputWidth: 896,
  outputHeight: 512,
  outputResolutionId: "896x512",
  outputPreset: null,
  bitrateMbps: 8,
  videoCodec: "h264",
  container: "mp4",
  audioCodec: "aac",
  audioBitrateKbps: 192,
  graphicsApi: "auto",
  computeBackend: "auto",
  vulkanValidation: "off",
  gpuDeviceIndex: 0,
  autoOptimizeFromHardware: true,
  hardwareTier: null,
  lastOptimizedAt: null,
  localRenderEngine: "diffusers-wan",
  wanModelId: "",
};

export function loadDirectorSettingsFromStorage() {
  if (typeof window === "undefined") return { ...DEFAULT_DIRECTOR_SETTINGS };
  try {
    let raw = localStorage.getItem(DIRECTOR_SETTINGS_KEY);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_OPEN_SORA_SETTINGS_KEY);
    }
    if (!raw) return { ...DEFAULT_DIRECTOR_SETTINGS };
    const parsed = JSON.parse(raw);
    return migrateLegacySettings(migrateOutputSettings({ ...DEFAULT_DIRECTOR_SETTINGS, ...parsed }));
  } catch {
    return { ...DEFAULT_DIRECTOR_SETTINGS };
  }
}

function migrateLegacySettings(s) {
  const next = { ...s };
  if (s.installPath && !s.localPipelinePath) {
    next.localPipelinePath = s.installPath;
    next.renderBackend = s.installPath ? "local-python" : "export";
  }
  if (s.pythonPath) next.localPythonPath = s.pythonPath;
  if (s.preset === "FAST") next.qualityPreset = "DRAFT";
  if (s.preset === "CINEMATIC") next.qualityPreset = "STANDARD";
  if (s.preset === "ULTRA") next.qualityPreset = "PREMIUM";
  if (s.configPreset) delete next.configPreset;
  next.localRenderEngine = normalizeLocalRenderEngine(s.localRenderEngine || DEFAULT_LOCAL_RENDER_ENGINE);
  return migrateOutputSettings(next);
}

export function saveDirectorSettingsToStorage(settings) {
  if (typeof window === "undefined") return { ok: false, reason: "no-window" };
  try {
    localStorage.setItem(DIRECTOR_SETTINGS_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent("director-settings-updated", { detail: settings }));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e?.message || "storage-failed" };
  }
}

export function applyDirectorQualityPreset(settings, presetName) {
  const p = QUALITY[presetName];
  if (!p) return settings;
  return {
    ...settings,
    qualityPreset: presetName,
    numSteps: p.numSteps,
    numFrames: p.numFrames,
    cfg: p.cfg,
    motionScore: p.motion,
  };
}
