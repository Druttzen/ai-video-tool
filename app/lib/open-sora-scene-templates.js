/**
 * Scene templates aligned with E:\\Open-Sora\\templates\\scene_templates.py
 */
export const OPEN_SORA_SCENE_TEMPLATES = {
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
