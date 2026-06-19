import catalogJson from "../../data/open-sora-catalog.json";

export const openSoraCatalog = catalogJson || {};
export const openSoraCatalogSyncedAt = catalogJson.syncedAt || null;
export const openSoraCatalogSource = catalogJson.sourceRoot || "E:\\Open-Sora";

export function getOpenSoraSceneTemplatesFromCatalog() {
  return catalogJson.sceneTemplates || {};
}

export function getOpenSoraStyleProfiles() {
  return catalogJson.styleProfiles || [];
}

export function getOpenSoraShotTypeOptions() {
  return Object.keys(catalogJson.shotTypes || {});
}

export function getOpenSoraLightingSetupOptions() {
  return Object.keys(catalogJson.lightingSetups || {});
}

export function getOpenSoraColorPipelineOptions() {
  return Object.keys(catalogJson.colorPipelines || {});
}

export function getOpenSoraConfigPresets() {
  return catalogJson.configPresets || [];
}

export function getOpenSoraAspectRatios() {
  return catalogJson.aspectRatios || ["16:9", "9:16", "1:1", "21:9"];
}

export function getOpenSoraExamplePrompts(limit = 12) {
  return (catalogJson.examplePrompts || []).slice(0, limit);
}

export function getOpenSoraInstallDefaults() {
  const p = catalogJson.config?.pipeline || {};
  return {
    steps: p.default_steps ?? 24,
    cfg: p.default_cfg ?? 7.5,
    resolution: p.default_resolution ?? "640x360",
  };
}

export function buildCameraRigPhrase(camera, lens, move) {
  if (!camera && !lens && !move) return "";
  return `Camera: ${camera || "cinema camera"}, Lens: ${lens || "35mm prime"}, Movement: ${move || "dolly in"}, smooth motion, stabilized tracking, cinematic camera behavior.`;
}

export function getShotTypePhrase(name) {
  const s = catalogJson.shotTypes?.[name];
  return s ? `Shot type: ${s}` : "";
}

export function getLightingSetupPhrase(name) {
  const s = catalogJson.lightingSetups?.[name];
  return s ? `Lighting setup: ${s}` : "";
}

export function getColorPipelinePhrase(name) {
  const s = catalogJson.colorPipelines?.[name];
  return s ? `Color pipeline: ${s}` : "";
}

export function getStyleProfileByName(name) {
  return (catalogJson.styleProfiles || []).find((s) => s.name === name) || catalogJson.styleProfiles?.[0] || null;
}
