import catalog from "../../data/director-catalog.json";
import { getIndexSceneTemplates } from "./video-creator-index";

export const DIRECTOR_CATALOG = catalog;
export const DIRECTOR_BRAND = catalog.brand || "Director Engine";

export function getDirectorSceneTemplates() {
  return { ...(catalog.sceneTemplates || {}), ...getIndexSceneTemplates() };
}

export function getDirectorStyleProfiles() {
  return catalog.styleProfiles || [];
}

export function getDirectorShotTypes() {
  return Object.keys(catalog.shotTypes || {});
}

export function getDirectorLightingSetups() {
  return Object.keys(catalog.lightingSetups || {});
}

export function getDirectorColorGrades() {
  return Object.keys(catalog.colorPipelines || {});
}

export function getDirectorQualityPresets() {
  return catalog.qualityPresets || {};
}

export function getDirectorAspectRatios() {
  return catalog.aspectRatios || ["16:9", "9:16", "1:1", "21:9"];
}

export function getDirectorExamplePrompts(limit = 12) {
  return (catalog.examplePrompts || []).slice(0, limit);
}

export function getDirectorRenderBackends() {
  return catalog.renderBackends || [];
}

export function getDirectorLocalRenderEngines() {
  return catalog.localRenderEngines || [];
}

export function getDirectorCameraPresets() {
  return catalog.cameraPresets || [];
}

export function getDirectorLensKits() {
  return catalog.lensKits || [];
}

export function getDirectorFilmFormats() {
  return catalog.filmFormats || [];
}

export function getDirectorCameraMoves() {
  return catalog.cameraMoves || [];
}

export function getDirectorLightingTerms() {
  return catalog.lightingTerms || [];
}

export function getDirectorColorProfiles() {
  return catalog.colorProfiles || [];
}

export function getStyleProfileByName(name) {
  return getDirectorStyleProfiles().find((s) => s.name === name) || getDirectorStyleProfiles()[0] || null;
}

export function buildCameraRigPhrase(camera, lens, move) {
  if (!camera && !lens && !move) return "";
  return `Camera: ${camera || "cinema body"}, Lens: ${lens || "35mm prime"}, Movement: ${move || "smooth tracking"}, stabilized cinematic motion.`;
}

export function getShotTypePhrase(name) {
  const s = catalog.shotTypes?.[name];
  return s ? `Shot type: ${s}` : "";
}

export function getLightingSetupPhrase(name) {
  const s = catalog.lightingSetups?.[name];
  return s ? `Lighting setup: ${s}` : "";
}

export function getColorPipelinePhrase(name) {
  const s = catalog.colorPipelines?.[name];
  return s ? `Color pipeline: ${s}` : "";
}

/** Merge base chip list with director vocabulary (deduped). */
export function mergeDirectorOptions(base, extra) {
  const seen = new Set(base.map((s) => s.toLowerCase()));
  const out = [...base];
  for (const item of extra || []) {
    const label = String(item).trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}
