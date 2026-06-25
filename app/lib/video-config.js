import {
  cameraMotionOptions,
  lightingOptions,
  stylePresets as videoStylePresets,
  visualStyleOptions,
} from "./video-visual-styles";

/** Aliased to existing workspace keys — visual style chips. */
export const genreOptions = visualStyleOptions;
/** Camera motion chips. */
export const rhythmOptions = cameraMotionOptions;
/** Lighting chips. */
export const soundOptions = lightingOptions;

export const lyricLanguageOptions = ["English", "No dialogue", "Multilingual signs", "Subtitle-safe"];
export const lyricStyleOptions = [
  "Observational",
  "Poetic voiceover",
  "Action-driven",
  "Dialogue scene",
  "Silent visual",
  "Tutorial demo",
];
export const lyricModeOptions = ["Single scene", "Multi-beat scene", "Shot list", "Character arc"];

export const vocalOptions = [
  "Silent visual",
  "Voiceover",
  "Dialogue scene",
  "Ambient sound only",
  "Music-driven",
];

export const aspectOptions = ["16:9", "9:16", "1:1", "4:3", "2.39:1", "21:9"];

export const STORAGE_KEY = "ai_video_creator_visual_tool_v1";
export const PRESET_KEY = "ai_video_creator_custom_presets_v1";
export const HISTORY_KEY = "ai_video_creator_prompt_history_v1";

export const APP_VERSION =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_APP_VERSION
    ? process.env.NEXT_PUBLIC_APP_VERSION
    : "1.0.36";
export const AUTHOR = "DJ M@D";

export const DEFAULT_STATE = {
  idea: "A lone courier crosses a rain-soaked neon alley at night, clutching a glowing package",
  tempo: "10s",
  structure: "establishing wide → tracking follow → close on face → hold on package glow",
  selectedGenres: ["Cinematic", "Noir"],
  selectedRhythms: ["Tracking shot", "Slow dolly in"],
  selectedSounds: ["Neon night", "Rain reflections"],
  vocal: "Silent visual",
  mode: "Hybrid",
  proMode: false,
  promptIntensity: 55,
  variationCount: 3,
  rules: "photorealistic, consistent wardrobe, no text overlays, no watermark, stable anatomy",
  notes: "",
  scores: { bass: 4, rhythm: 4, identity: 4, clarity: 4 },
  mood: { darkness: 70, energy: 55, aggression: 45, emotion: 40, complexity: 50, space: 60 },
  lyricTheme: "trust under pressure, urban isolation, one decision before dawn",
  lyricLanguage: "No dialogue",
  lyricStructure: "setup → complication → visual pause → implied choice",
  lyricStyle: "Silent visual",
  lyricDensity: 55,
  promptFormat: "Balanced",
  promptEngine: "Director",
  coProducerOutput: "",
  generatedLyrics: "",
  generatedLyricsStyle: "",
  generatedHooks: "",
  generatedHooksStyle: "",
  lyricVariantSeed: 0,
  lyricMode: "Multi-beat scene",
  voiceRefFirstName: "",
  voiceRefLastName: "",
  voiceStyleLine: "",
  instrumentalVocalFx: false,
  sunoPasteStyle: "",
  sunoPasteLyrics: "",
  sunoPasteActive: false,
  guidedStep: 0,
};

export const BLANK_STATE = {
  idea: "",
  tempo: "",
  structure: "",
  selectedGenres: [],
  selectedRhythms: [],
  selectedSounds: [],
  vocal: "",
  mode: "Hybrid",
  proMode: false,
  promptIntensity: 50,
  variationCount: 3,
  rules: "",
  notes: "",
  scores: { bass: 3, rhythm: 3, identity: 3, clarity: 3 },
  mood: { darkness: 50, energy: 50, aggression: 50, emotion: 50, complexity: 50, space: 50 },
  lyricTheme: "",
  lyricLanguage: "English",
  lyricStructure: "",
  lyricStyle: "Silent visual",
  lyricDensity: 50,
  promptFormat: "Balanced",
  promptEngine: "Director",
  coProducerOutput: "",
  generatedLyrics: "",
  generatedLyricsStyle: "",
  generatedHooks: "",
  generatedHooksStyle: "",
  lyricVariantSeed: 0,
  lyricMode: "Single scene",
  voiceRefFirstName: "",
  voiceRefLastName: "",
  voiceStyleLine: "",
  instrumentalVocalFx: false,
  sunoPasteStyle: "",
  sunoPasteLyrics: "",
  sunoPasteActive: false,
  guidedStep: 0,
};

export const stylePresets = Object.fromEntries(
  Object.entries(videoStylePresets).map(([name, p]) => [
    name,
    {
      genres: p.visualStyles,
      rhythms: p.cameraMotions,
      sounds: p.lighting,
      vocal: "Silent visual",
      tempo: p.duration,
      structure: p.structure,
    },
  ]),
);

export const FACTORY_PRESET_BLURBS = {
  "Cinematic Opening": "10s • cinematic • golden hour reveal",
  "Documentary Moment": "12s • handheld • authentic context",
  "Neon Night Chase": "15s • noir • rain + tracking",
  "Anime Action Beat": "8s • anime • orbit impact",
  "Product Hero": "6s • commercial • studio orbit",
  "Dream Sequence": "20s • fantasy • soft drift",
};

export const promptFormatOptions = ["Compressed", "Balanced", "Detailed"];

export const fixes = {
  "Weak subject": "Name the subject first: who/what, wardrobe, expression, and one clear action.",
  "Wrong look": "Reinforce primary visual style and remove conflicting aesthetic words.",
  "Shaky unreadable": "Specify stable camera, readable framing, and consistent motion blur policy.",
  "Too generic": "Add environment details, lighting source, and camera behavior.",
  "Too busy": "Simplify: one subject, one location, one camera move, fewer adjectives.",
  "Anatomy drift": "Add explicit stable anatomy, consistent wardrobe, and no morphing faces.",
};
