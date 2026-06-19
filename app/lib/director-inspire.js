import catalog from "../../data/director-catalog.json";
import { getStyleProfileByName } from "./director-catalog";
import { buildCameraRigPhrase, getColorPipelinePhrase, getLightingSetupPhrase, getShotTypePhrase } from "./director-catalog";

function pick(arr) {
  if (!arr?.length) return "";
  return arr[Math.floor(Math.random() * arr.length)];
}

function smartPack(styleName) {
  if (styleName === "documentary") {
    return {
      cameraRig: buildCameraRigPhrase("Sony FX3", "24-70mm zoom", "handheld"),
      lighting: getLightingSetupPhrase("Soft cinematic") || "natural available light.",
      color: getColorPipelinePhrase("Fuji Eterna"),
      shot: getShotTypePhrase("Wide shot"),
    };
  }
  if (styleName === "stylized" || styleName === "noir") {
    return {
      cameraRig: buildCameraRigPhrase("RED Komodo 6K", "50mm prime", "gimbal orbit"),
      lighting: getLightingSetupPhrase("Neon reflections") || getLightingSetupPhrase("High-contrast noir"),
      color: getColorPipelinePhrase("Teal-Orange"),
      shot: getShotTypePhrase("Close-up"),
    };
  }
  return {
    cameraRig: buildCameraRigPhrase("ARRI Alexa Mini", "35mm prime", "dolly in"),
    lighting: getLightingSetupPhrase("Soft cinematic"),
    color: getColorPipelinePhrase("Kodak 2383"),
    shot: getShotTypePhrase("Medium shot"),
  };
}

export function randomDirectorInspiration(styleName = "cinematic") {
  const pools = catalog.randomInspiration || {};
  return {
    topic: pick(pools.topics),
    env: pick(pools.envs),
    camera: pick(pools.cameras),
    mood: pick(pools.moods),
    length: pick(pools.lengths),
    fps: pick(pools.fps),
    ratio: pick(pools.ratios),
    suggestions: smartPack(styleName),
    styleProfile: getStyleProfileByName(styleName),
  };
}

export function applyInspirationToProject(inspiration) {
  if (!inspiration) return {};
  return {
    idea: inspiration.topic,
    selectedSounds: inspiration.env ? [inspiration.env] : [],
    selectedRhythms: inspiration.camera ? [inspiration.camera] : [],
    lyricTheme: inspiration.mood || "",
    tempo: inspiration.length ? `${inspiration.length}s` : "",
    structure: "establishing → action → hold",
  };
}

export function applyInspirationToDirectorSettings(inspiration, settings) {
  if (!inspiration) return settings;
  return {
    ...settings,
    aspectRatio: inspiration.ratio || settings.aspectRatio,
    fps: Number(inspiration.fps) || settings.fps,
    styleProfile: inspiration.styleProfile?.name || settings.styleProfile,
    durationSeconds: inspiration.length || settings.durationSeconds,
  };
}
