/**
 * Master Video Creator index — workflows, bundles, manuscript, Director vocabulary.
 * Sourced from data/video-creator-index.json (community + official model guides).
 */
import index from "../../data/video-creator-index.json";

export const VIDEO_CREATOR_INDEX = index;
export const INDEX_SOURCES = index.sources || [];
export const INDEX_SYNCED_AT = index.syncedAt || "";

export function getIndexPrinciples() {
  return index.principles || [];
}

export function getIndexWorkflows() {
  return index.workflows || [];
}

export function getIndexWorkflowByKey(key) {
  return getIndexWorkflows().find((w) => w.key === key || w.id === key) || null;
}

export function getIndexBundles() {
  return index.bundles || { exportFields: [], presetBundles: [] };
}

export function getIndexPresetBundles() {
  return getIndexBundles().presetBundles || [];
}

export function getIndexManuscriptTemplates() {
  return index.manuscript?.templates || [];
}

export function getIndexManuscriptStructureTags() {
  return index.manuscript?.structureTags || [];
}

export function getIndexDirectorSettings() {
  return index.directorSettings || {};
}

export function getIndexVisualStyles() {
  return index.styles?.visual || [];
}

export function getIndexStylePhrases() {
  return index.styles?.stylePhrases || [];
}

export function getIndexColorGrades() {
  return index.styles?.colorGrades || [];
}

export function getIndexCameraMovement() {
  return index.camera?.movement || [];
}

export function getIndexCameraModifiers() {
  return index.camera?.modifiers || [];
}

export function getIndexRunwayCameraTokens() {
  return index.camera?.runwayTokens || [];
}

export function getIndexCameraFraming() {
  return index.camera?.framing || [];
}

export function getIndexLightingQuality() {
  return index.lighting?.quality || [];
}

export function getIndexLightingSources() {
  return index.lighting?.sources || [];
}

export function getIndexLightingDirection() {
  return index.lighting?.direction || [];
}

export function getIndexLightingTerms() {
  return index.lighting?.terms || [];
}

export function getIndexLightingSetups() {
  return index.lighting?.setups || [];
}

export function getIndexLightingPalettes() {
  return index.lighting?.palettes || [];
}

export function getIndexMoodWords() {
  return index.mood?.words || [];
}

export function getIndexMoodSliders() {
  return index.mood?.sliders || [];
}

export function getIndexRulesUniversal() {
  return index.rules?.universal || [];
}

export function getIndexRulesMusicVideo() {
  return index.rules?.musicVideo || [];
}

export function getIndexRulesModelFixes() {
  return index.rules?.modelFixes || {};
}

export function getIndexNegativePrompts() {
  return index.rules?.negativePrompts || [];
}

export function getIndexModels() {
  return index.models || {};
}

export function getIndexPromptTemplates() {
  return index.promptTemplates || {};
}

export function getIndexSceneTemplates() {
  return index.sceneTemplates || {};
}

/** Flat searchable rows for index panel UI. */
export function buildIndexBrowseSections() {
  return [
    { id: "principles", label: "Principles", items: getIndexPrinciples() },
    { id: "workflows", label: "Workflows", items: getIndexWorkflows().map((w) => `${w.title}: ${(w.steps || []).join(" → ")}`) },
    { id: "styles", label: "Visual styles", items: getIndexVisualStyles() },
    { id: "stylePhrases", label: "Style phrases", items: getIndexStylePhrases() },
    { id: "camera", label: "Camera movement", items: getIndexCameraMovement() },
    { id: "lighting", label: "Lighting", items: [...getIndexLightingSources(), ...getIndexLightingTerms()] },
    { id: "mood", label: "Mood words", items: getIndexMoodWords() },
    { id: "rules", label: "Rules", items: [...getIndexRulesUniversal(), ...getIndexRulesMusicVideo()] },
    { id: "manuscript", label: "Manuscript templates", items: getIndexManuscriptTemplates().map((t) => t.text) },
    { id: "models", label: "Model tips", items: Object.entries(getIndexModels()).map(([k, v]) => `${k}: ${v.bestFor}`) },
  ];
}

/**
 * Help body for a panel topic enriched from index.
 * @param {string} topic
 */
export function getIndexHelpBody(topic) {
  const lines = [];
  const add = (title, items) => {
    if (!items?.length) return;
    lines.push(`${title}:\n${items.slice(0, 6).map((x) => `• ${x}`).join("\n")}`);
  };

  switch (topic) {
    case "workflows":
      add("All workflows", getIndexWorkflows().map((w) => w.title));
      break;
    case "manuscript":
      add("Templates", getIndexManuscriptTemplates().map((t) => t.label));
      add("Structure tags", getIndexManuscriptStructureTags());
      break;
    case "director":
      add("Shot types", getIndexDirectorSettings().shotTypes);
      add("Quality", getIndexDirectorSettings().qualityPresets);
      add("Models", Object.keys(getIndexModels()));
      break;
    case "music-controls":
      add("Styles", getIndexVisualStyles().slice(0, 12));
      add("Camera", getIndexCameraMovement().slice(0, 10));
      add("Lighting", getIndexLightingSources().slice(0, 10));
      break;
    case "mood":
      add("Mood vocabulary", getIndexMoodWords());
      break;
    case "pro-mode":
      add("Universal rules", getIndexRulesUniversal());
      add("MV rules", getIndexRulesMusicVideo());
      break;
    case "presets":
      add("Preset bundles", getIndexPresetBundles().map((p) => p.name));
      break;
    case "suno-language":
    case "global":
      add("Principles", getIndexPrinciples().slice(0, 5));
      break;
    default:
      break;
  }
  return lines.join("\n\n");
}
