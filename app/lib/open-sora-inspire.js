import catalogJson from "../../data/open-sora-catalog.json";
import { getStyleProfileByName } from "./open-sora-catalog";
import { buildCameraRigPhrase, getColorPipelinePhrase, getLightingSetupPhrase, getShotTypePhrase } from "./open-sora-catalog";

function pick(arr) {
  if (!arr?.length) return "";
  return arr[Math.floor(Math.random() * arr.length)];
}

export function smartSuggestionsForStyle(styleName) {
  const rig = catalogJson.cameraRig || {};
  if (styleName === "documentary") {
    return {
      cameraRig: buildCameraRigPhrase("Sony FX3", "24-70mm zoom", "handheld"),
      lighting: "natural available light, minimal shaping.",
      color: getColorPipelinePhrase("Fuji Eterna"),
      shot: getShotTypePhrase("Wide shot"),
    };
  }
  if (styleName === "stylized") {
    return {
      cameraRig: buildCameraRigPhrase("RED Komodo 6K", "50mm prime", "gimbal orbit"),
      lighting: getLightingSetupPhrase("Neon reflections"),
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

/** Random inspiration bundle from Open-Sora random_inspiration.py pools. */
export function randomOpenSoraInspiration(styleName = "cinematic") {
  const pools = catalogJson.randomInspiration || {};
  const suggestions = smartSuggestionsForStyle(styleName);
  return {
    topic: pick(pools.topics),
    env: pick(pools.envs),
    camera: pick(pools.cameras),
    mood: pick(pools.moods),
    length: pick(pools.lengths),
    fps: pick(pools.fps),
    ratio: pick(pools.ratios),
    suggestions,
    styleProfile: getStyleProfileByName(styleName),
  };
}

export function applyInspirationToProjectFields(inspiration) {
  if (!inspiration) return {};
  const patch = {
    idea: inspiration.topic,
    selectedSounds: inspiration.env ? [inspiration.env] : [],
    selectedRhythms: inspiration.camera ? [inspiration.camera] : [],
    lyricTheme: inspiration.mood || "",
    tempo: inspiration.length ? `${inspiration.length}s` : "",
    structure: "establishing → action → hold",
  };
  return patch;
}

export function applyInspirationToSettings(inspiration, settings) {
  if (!inspiration) return settings;
  return {
    ...settings,
    aspectRatio: inspiration.ratio || settings.aspectRatio,
    fps: Number(inspiration.fps) || settings.fps,
    styleProfile: inspiration.styleProfile?.name || settings.styleProfile,
    durationSeconds: inspiration.length || settings.durationSeconds,
  };
}
