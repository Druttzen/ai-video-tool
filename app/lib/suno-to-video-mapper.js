/**
 * Map Suno music vocabulary → AI Video Creator visual fields.
 * Enables Suno track / Style+Lyrics → matching music video project.
 */
import { uniq } from "./music-helpers";
import { structureToSectionTags } from "./suno-guided-workflow";

const GENRE_TO_VISUAL = {
  techno: ["Cinematic", "Noir"],
  industrial: ["Cinematic", "Horror"],
  house: ["Commercial", "Music video"],
  trance: ["Cinematic", "Sci-fi"],
  edm: ["Music video", "Commercial"],
  "drum & bass": ["Music video", "Cinematic"],
  jungle: ["Handheld raw", "Documentary"],
  dubstep: ["Cinematic", "Noir"],
  trap: ["Commercial", "Music video"],
  drill: ["Noir", "Handheld raw"],
  "hip hop": ["Music video", "Handheld raw"],
  rap: ["Music video", "Handheld raw"],
  pop: ["Commercial", "Music video"],
  "synth pop": ["Commercial", "Music video"],
  rnb: ["Cinematic", "Music video"],
  ambient: ["Dream Sequence", "Cinematic"],
  cinematic: ["Cinematic", "Photorealistic"],
  orchestral: ["Cinematic", "Fantasy"],
  "neo-classical": ["Cinematic", "Fantasy"],
  metal: ["Horror", "Cinematic"],
  rock: ["Handheld raw", "Documentary"],
  jazz: ["Documentary", "Vintage film"],
  funk: ["Music video", "Commercial"],
  reggaeton: ["Music video", "Commercial"],
  synthwave: ["Noir", "Sci-fi"],
  "post-punk": ["Noir", "Vintage film"],
  experimental: ["Fantasy", "Horror"],
  hyperpop: ["Anime", "Music video"],
  psytrance: ["Sci-fi", "Fantasy"],
  "lo-fi": ["Vintage film", "Documentary"],
  downtempo: ["Dream Sequence", "Cinematic"],
  anime: ["Anime"],
  country: ["Documentary", "Handheld raw"],
};

const SOUND_TO_LIGHTING = {
  "heavy sub bass": ["Neon night", "Low-key noir"],
  "analog synths": ["Neon night", "Mixed tungsten + LED"],
  "bright leads": ["High-key studio", "Golden hour"],
  "dark pads": ["Volumetric haze", "Cold moonlight"],
  "808 bass": ["Neon night", "Practical lamps"],
  "big drums": ["Hard noon sun", "Silhouette backlight"],
  "soft drums": ["Overcast soft", "Blue hour"],
  piano: ["Practical lamps", "Candle warm"],
  "orchestral strings": ["Golden hour", "Volumetric haze"],
  "distorted bass": ["Neon night", "Low-key noir"],
  "glitch fx": ["Neon night", "Mixed tungsten + LED"],
  "vinyl texture": ["Vintage film", "Practical lamps"],
  "noise atmosphere": ["Volumetric haze", "Cold moonlight"],
  "metallic percussion": ["Hard noon sun", "Silhouette backlight"],
  "pad synth": ["Volumetric haze", "Blue hour"],
  "dub delays": ["Neon night", "Rain reflections"],
  "supersaw chords": ["High-key studio", "Neon night"],
  "hand percussion": ["Golden hour", "Practical lamps"],
  "live drums": ["Hard noon sun", "Handheld raw"],
  "vocal samples": ["High-key studio", "Neon night"],
  "background choir": ["Volumetric haze", "Silhouette backlight"],
  "side-chain pump": ["Neon night", "Commercial"],
  "wobble bass": ["Neon night", "Sci-fi"],
};

const RHYTHM_TO_CAMERA = {
  "4/4": ["Tracking shot", "Medium cut rhythm"],
  rolling: ["Steadicam glide", "Tracking shot"],
  breakbeat: ["Whip pan", "Handheld follow"],
  syncopated: ["Handheld follow", "Orbit arc"],
  "boom bap": ["Handheld follow", "Static tripod"],
  minimal: ["Slow dolly in", "Static tripod"],
  halftime: ["Slow dolly in", "Crane up"],
  "no drums": ["Slow dolly in", "Steadicam glide"],
  swing: ["Handheld follow", "Steadicam glide"],
  "off-grid": ["Whip pan", "Handheld follow"],
  "drill groove": ["Tracking shot", "Whip pan"],
  "latin clave": ["Orbit arc", "Handheld follow"],
  "waltz 3/4": ["Steadicam glide", "Orbit arc"],
};

const VOCAL_TO_NARRATION = {
  "vocals likely": "Music-driven",
  "instrumental likely": "Silent visual",
  "mixed / uncertain": "Music-driven",
};

function tokenizeSunoStyle(style) {
  return String(style || "")
    .split(/[,;|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function mapTokenList(tokens, table, fallback) {
  const out = [];
  for (const token of tokens) {
    const key = token.toLowerCase();
    let hit = null;
    for (const [k, vals] of Object.entries(table)) {
      if (key.includes(k) || k.includes(key)) {
        hit = vals;
        break;
      }
    }
    if (hit) out.push(...hit);
    else if (fallback) out.push(fallback);
  }
  return uniq(out);
}

export function mapSunoGenresToVisual(genres = []) {
  return uniq(mapTokenList(genres, GENRE_TO_VISUAL, "Music video")).slice(0, 3);
}

export function mapSunoSoundsToLighting(sounds = []) {
  return uniq(mapTokenList(sounds, SOUND_TO_LIGHTING, "Neon night")).slice(0, 4);
}

export function mapSunoRhythmsToCamera(rhythms = []) {
  return uniq(mapTokenList(rhythms, RHYTHM_TO_CAMERA, "Tracking shot")).slice(0, 3);
}

export function mapBpmToDurationHint(bpm, highlightDurationSec) {
  if (highlightDurationSec && highlightDurationSec > 0) {
    return `${Math.min(30, Math.max(6, Math.round(highlightDurationSec)))}s`;
  }
  if (bpm >= 128) return "15s";
  if (bpm >= 100) return "12s";
  return "20s";
}

/** Parse Suno Style comma-field into music tokens. */
export function parseSunoStyleField(styleText) {
  const tokens = tokenizeSunoStyle(styleText);
  const genres = [];
  const sounds = [];
  const rhythms = [];
  let tempo = "";
  for (const t of tokens) {
    const lower = t.toLowerCase();
    if (/^\d+\s*bpm$/i.test(t) || /bpm/i.test(t)) {
      tempo = t;
      continue;
    }
    if (/^\d+\/\d+$/.test(t) || ["4/4", "3/4", "6/8"].some((x) => lower.includes(x))) {
      rhythms.push(t);
      continue;
    }
    if (Object.keys(GENRE_TO_VISUAL).some((k) => lower.includes(k))) genres.push(t);
    else if (Object.keys(SOUND_TO_LIGHTING).some((k) => lower.includes(k))) sounds.push(t);
    else if (Object.keys(RHYTHM_TO_CAMERA).some((k) => lower.includes(k))) rhythms.push(t);
    else genres.push(t);
  }
  return { tokens, genres, sounds, rhythms, tempo };
}

/** Map Suno lyric brackets → video shot structure. */
export function mapSunoLyricsToVideoStructure(lyricsText) {
  const text = String(lyricsText || "");
  const sections = structureToSectionTags(
    text.match(/\[Verse[^\]]*\]/gi)?.length
      ? "intro → verse → chorus → verse → chorus → bridge → chorus → outro"
      : "establishing → performance → chorus lift → hold",
  );
  const beats = [];
  const tagRe = /\[(Intro|Verse[^\] ]*|Pre-Chorus|Chorus|Bridge|Drop|Build|Outro|Hook)[^\]]*\]/gi;
  let m;
  while ((m = tagRe.exec(text)) !== null) {
    const label = m[1].replace(/\s*\d+$/, "").trim();
    const videoBeat = {
      Intro: "establishing wide",
      Verse: "performance medium",
      "Pre-Chorus": "tension build",
      Chorus: "chorus energy wide",
      Bridge: "visual break",
      Drop: "impact cut",
      Build: "rising motion",
      Outro: "fade hold",
      Hook: "hero close",
    }[label] || label.toLowerCase();
    if (videoBeat && !beats.includes(videoBeat)) beats.push(videoBeat);
  }
  const structure = beats.length ? beats.join(" → ") : "establishing wide → performance → chorus lift → emotional hold";
  return { structure, sectionTags: sections, lyricTheme: extractLyricTheme(text) };
}

function extractLyricTheme(text) {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\[.*?\]/g, "").trim())
    .filter((l) => l.length > 8 && !/^[\(\[]/.test(l));
  return lines.slice(0, 2).join(" · ") || "";
}

/**
 * Map audio analyzer suggestions (music-oriented) → video project fields.
 */
export function mapAudioAnalysisToMusicVideo(audioAnalysis) {
  if (!audioAnalysis) return {};
  const genres = [
    ...(audioAnalysis.suggestedGenres || []),
    ...(audioAnalysis.suggestedSubgenres || []),
  ];
  const sounds = [
    ...(audioAnalysis.suggestedSounds || []),
    ...(audioAnalysis.suggestedInstruments || []),
  ];
  const rhythms = audioAnalysis.suggestedRhythms || [];
  const bpm = audioAnalysis.estimatedBpm;
  const hiDur =
    audioAnalysis.highlightEnd && audioAnalysis.highlightStart
      ? audioAnalysis.highlightEnd - audioAnalysis.highlightStart
      : null;

  const visualGenres = mapSunoGenresToVisual(genres);
  if (!visualGenres.includes("Music video")) visualGenres.unshift("Music video");

  return {
    selectedGenres: visualGenres.slice(0, 3),
    selectedSounds: mapSunoSoundsToLighting(sounds),
    selectedRhythms: mapSunoRhythmsToCamera(rhythms),
    vocal: VOCAL_TO_NARRATION[audioAnalysis.vocals?.toLowerCase?.()] || "Music-driven",
    tempo: mapBpmToDurationHint(bpm, hiDur),
    structure: bpm >= 128 ? "establishing → performance → chorus lift → drop cut → hold" : "establishing → verse performance → chorus wide → emotional hold",
    lyricTheme: (audioAnalysis.suggestedMoods || []).slice(0, 2).join(", ") || "sync to track energy",
    rules: "cut on beat where possible, lip-sync when vocals present, consistent wardrobe, no watermark, stable anatomy, music-video pacing",
    notes: audioAnalysis.summary ? `Suno track reference:\n${audioAnalysis.summary}` : "",
  };
}

/** Map pasted Suno Style + Lyrics → video project patch. */
export function mapSunoPasteToMusicVideo(styleText, lyricsText) {
  const parsed = parseSunoStyleField(styleText);
  const lyricMap = mapSunoLyricsToVideoStructure(lyricsText);
  const visualGenres = mapSunoGenresToVisual(parsed.genres.length ? parsed.genres : parsed.tokens);
  if (!visualGenres.includes("Music video")) visualGenres.unshift("Music video");

  return {
    selectedGenres: visualGenres.slice(0, 3),
    selectedSounds: mapSunoSoundsToLighting(parsed.sounds.length ? parsed.sounds : parsed.tokens),
    selectedRhythms: mapSunoRhythmsToCamera(parsed.rhythms.length ? parsed.rhythms : ["4/4"]),
    vocal: /instrumental/i.test(styleText) ? "Silent visual" : "Music-driven",
    tempo: parsed.tempo || "12s",
    structure: lyricMap.structure,
    lyricStructure: lyricMap.sectionTags,
    lyricTheme: lyricMap.lyricTheme || parsed.tokens.slice(0, 3).join(", "),
    generatedLyrics: String(lyricsText || "").trim(),
    rules: "music video: performance + B-roll, Suno track sync, bracket beats as scene cuts, no watermark",
    sunoPasteStyle: styleText,
    sunoPasteLyrics: lyricsText,
  };
}

/** Build Director-ready idea line from Suno + audio context. */
export function buildMusicVideoIdea({ audioAnalysis, styleText, lyricTheme, structure }) {
  const parts = [];
  if (audioAnalysis?.summary) parts.push(`Music video for: ${audioAnalysis.summary.split(".")[0]}`);
  else if (styleText) parts.push(`Music video matching Suno style: ${tokenizeSunoStyle(styleText).slice(0, 4).join(", ")}`);
  else parts.push("Music video synced to reference track");
  if (lyricTheme) parts.push(`Theme: ${lyricTheme}`);
  if (structure) parts.push(`Structure: ${structure}`);
  return parts.join(". ");
}
