/**

 * Scene templates — loaded from synced open-sora-catalog.json with English fallbacks.

 */

import { getOpenSoraSceneTemplatesFromCatalog } from "./open-sora-catalog";



const FALLBACK_TEMPLATES = {

  "Rain city drive": {

    topic: "a car driving through a rainy city at night",

    env: "wet asphalt, reflections, street lamps",

    camera: "low-angle tracking shot",

    mood: "dramatic and intense",

    length: "8",

    fps: "24",

    ratio: "21:9",

  },

  "Cyberpunk alley": {

    topic: "a person walking through a neon-lit cyberpunk city",

    env: "narrow alleys, neon signs, rain, steam",

    camera: "handheld camera close to subject",

    mood: "mysterious and intense",

    length: "10",

    fps: "30",

    ratio: "16:9",

  },

  "Fog forest road": {

    topic: "a car moving slowly through a foggy forest road",

    env: "dense fog, tall trees, soft diffused light",

    camera: "slow dolly forward",

    mood: "calm but slightly eerie",

    length: "12",

    fps: "24",

    ratio: "21:9",

  },

  "Industrial night": {

    topic: "a truck driving through an industrial zone at night",

    env: "harsh lamps, smoke, metal structures",

    camera: "side tracking shot",

    mood: "raw and powerful",

    length: "8",

    fps: "30",

    ratio: "16:9",

  },

  "Arena concert": {

    topic: "a performer on stage in an arena with a light show",

    env: "crowd, haze, lasers, spotlights",

    camera: "dynamic camera orbiting the stage",

    mood: "energetic and epic",

    length: "10",

    fps: "60",

    ratio: "16:9",

  },

};



function humanizeTemplateName(name) {

  const map = {

    "Bil i regn": "Rain city drive",

    "Cyberpunk-stad": "Cyberpunk alley",

    "Skogsdimma": "Fog forest road",

    "Industriområde natt": "Industrial night",

    "Arena-show": "Arena concert",

  };

  return map[name] || name;

}



function buildTemplateMap() {

  const synced = getOpenSoraSceneTemplatesFromCatalog();

  const out = { ...FALLBACK_TEMPLATES };

  for (const [rawName, template] of Object.entries(synced)) {

    out[humanizeTemplateName(rawName)] = template;

  }

  return out;

}



export const OPEN_SORA_SCENE_TEMPLATES = buildTemplateMap();



export function getOpenSoraSceneTemplate(name) {

  return OPEN_SORA_SCENE_TEMPLATES[name] ?? null;

}



export function applyOpenSoraSceneTemplateToProject(template) {

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



export function openSoraTemplateSettingsPatch(template) {

  if (!template) return {};

  return {

    aspectRatio: template.ratio || "16:9",

    fps: Number(template.fps) || 24,

    durationSeconds: template.length || "10",

  };

}


