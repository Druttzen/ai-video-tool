import { getDirectorSceneTemplates } from "./director-catalog";

export const DIRECTOR_SCENE_TEMPLATES = getDirectorSceneTemplates();

export function getDirectorSceneTemplate(name) {
  return DIRECTOR_SCENE_TEMPLATES[name] ?? null;
}

export function applyDirectorTemplateToProject(template) {
  if (!template) return {};
  return {
    idea: template.topic,
    selectedSounds: template.env ? [template.env] : [],
    selectedRhythms: template.camera ? [template.camera] : [],
    lyricTheme: template.mood || "",
    tempo: template.length ? `${template.length}s` : "",
    structure: "establishing → action → hold",
  };
}

export function directorTemplateSettingsPatch(template) {
  if (!template) return {};
  return {
    aspectRatio: template.ratio || "16:9",
    fps: Number(template.fps) || 24,
    durationSeconds: template.length || "10",
  };
}
