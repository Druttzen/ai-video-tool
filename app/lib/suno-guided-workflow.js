import { FACTORY_PRESET_BLURBS, stylePresets } from "./video-config";
import { SUNO_LYRICS_CHAR_TYPICAL_MAX, SUNO_STYLE_CHAR_CAP } from "./suno-limits";

export { FACTORY_PRESET_BLURBS };

/**
 * One-line workflow: preset → mood → visual → rules → story → narrative → polish → copy.
 */
export const SUNO_GUIDED_STEPS = [
  {
    id: 0,
    name: "Visual preset",
    preset: true,
    line: "Load a factory video preset or build by hand — presets set visual style, camera, lighting, duration, and shot structure.",
    where: "This panel (below) and left column: Style Presets.",
    next: "Set mood sliders and Mode to match the emotional tone before refining visual chips.",
    optimal: `Factory presets: ${Object.keys(stylePresets).length} one-click baselines for common Sora scene types.`,
  },
  {
    id: 1,
    name: "Mood & mode",
    line: "Lock feel: mood sliders for tension, energy, realism, and scale.",
    where: "Mood Sliders and Mode in the left column. Duration in Pro Mode or from preset.",
    next: "Refine Visual Controls — style, camera motion, lighting.",
    optimal: "Sora weights the opening of your prompt most — lead with subject + action after preset load.",
  },
  {
    id: 2,
    name: "Camera & light",
    line: "Add camera motion + lighting that support the visual style (e.g. tracking + neon for noir chase).",
    where: "Step 3 — Visual Controls.",
    next: "Audio/narration mode + safety rules — silent vs voiceover, no watermark, stable anatomy.",
    optimal: "Remove one chip at a time if the scene feels overcrowded — smaller edits keep identity stable.",
  },
  {
    id: 3,
    name: "Audio & rules",
    line: "Confirm narration mode; tighten Rules (constraints, avoids, consistency lines).",
    where: "Visual Controls (Audio/narration) + Pro Mode Rules.",
    next: "Scene concept: Idea box + shot structure map.",
    optimal: "Put hard constraints in Rules; keep the main prompt flowing as natural language.",
  },
  {
    id: 4,
    name: "Scene concept",
    line: "Idea + structure: one-line scene goal; beat map (wide → close → hold).",
    where: "Step 1 — Idea; Pro Mode for Structure.",
    next: "Narrative direction: theme, beat style, mode.",
    optimal: "Longer story beats belong in the Scene list field, not the opening sentence.",
  },
  {
    id: 5,
    name: "Narrative beats",
    line: "Set narrative theme, style, and mode for multi-beat or shot-list prompts.",
    where: "Narrative Direction panel — optional Co-Producer draft.",
    next: "Polish: analyzers, variations, Co-Producer refine.",
    optimal: "Use shot-list mode when you need explicit cut order for Sora.",
  },
  {
    id: 6,
    name: "Polish",
    line: "Optional reference image/video analyzers, Co-Producer, variations before export.",
    where: "Drag & Drop Analyzers, Co-Producer, Variation Engine.",
    next: "Copy Main prompt + Scene list into Sora.",
    optimal: "Analyzers are optional — you can copy straight from the guided final step.",
  },
  {
    id: 7,
    name: "Copy to Sora",
    line: "Copy paste-ready Main prompt and Scene list into Sora. Re-import finished output to iterate.",
    where: "Prompt Preview (right column) and guided copy blocks below.",
    next: "Generate in Sora → if drift, return here and tighten the opening sentence first.",
    optimal: "Factory presets are great starting points; save custom presets for recurring looks.",
  },
];

/**
 * Cumulative one-line “Style so far” preview (not necessarily under 1000 until final).
 * Steps 0–1: identity; 2: groove; 3: vocal+rules; 4: story; 5+: voice ref.
 * @param {number} maxStep 0..7
 */
export function getProgressiveStyleFragment(p, maxStep) {
  if (maxStep < 0) return "";
  const slice = {
    ...p,
    selectedSounds: maxStep >= 2 ? p.selectedSounds : [],
    selectedRhythms: maxStep >= 2 ? p.selectedRhythms : [],
    vocal: maxStep >= 3 ? p.vocal : "Instrumental",
    instrumentalVocalFx: maxStep >= 3 ? p.instrumentalVocalFx : false,
    rules: maxStep >= 3 ? p.rules : "",
    idea: maxStep >= 4 ? p.idea : "",
    voiceStyleLine: maxStep >= 5 ? p.voiceStyleLine : "",
    voiceStyleReference: maxStep >= 5 ? p.voiceStyleReference : "",
  };
  return buildSunoPastedStyleLine(slice);
}

function normalizeToken(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

function pushTokens(parts, items) {
  for (const item of items) {
    const t = normalizeToken(item);
    if (t) parts.push(t);
  }
}

/**
 * Join comma-separated style tokens and cap at Suno’s Style limit (1000).
 */
function joinWithCap(parts, cap, separator = ", ") {
  const clean = parts.map(normalizeToken).filter(Boolean);
  let s = clean.join(separator);
  if (s.length <= cap) return s;
  for (let n = clean.length - 1; n >= 1 && s.length > cap; n--) {
    s = clean.slice(0, n).join(separator);
  }
  if (s.length > cap) {
    s = s.slice(0, cap - 1) + "…";
  }
  return s;
}

/** Map lyric structure text to bracket section tags (Lyrics field only). */
export function structureToSectionTags(structure) {
  const raw = normalizeToken(structure);
  if (!raw) return [];
  return raw
    .split(/\s*(?:→|->|,|\/)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((segment, i) => {
      const lower = segment.toLowerCase();
      if (/final\s+chorus/.test(lower)) return "Final Chorus";
      if (/pre[-\s]?chorus/.test(lower)) return "Pre-Chorus";
      if (/post[-\s]?chorus/.test(lower)) return "Post-Chorus";
      if (lower.includes("chorus")) return "Chorus";
      if (lower.includes("bridge")) return "Bridge";
      if (lower.includes("intro")) return "Intro";
      if (lower.includes("outro")) return "Outro";
      if (lower.includes("verse")) return i === 0 ? "Verse 1" : `Verse ${i + 1}`;
      if (lower.includes("drop")) return "Drop";
      if (lower.includes("build")) return "Build";
      return segment
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    });
}

/** Minimal bracket scaffold — lyric lines only, no direction meta. */
export function buildMinimalLyricsScaffold({ lyricTheme = "", lyricStructure = "" }) {
  const theme = normalizeToken(lyricTheme);
  const tags = structureToSectionTags(lyricStructure);
  if (!tags.length) {
    if (!theme) return "";
    return `[Verse 1]\n${theme}\n\n[Chorus]\n${theme}`;
  }
  return tags
    .map((tag, i) => {
      const line = i === 0 && theme ? theme : "";
      return line ? `[${tag}]\n${line}` : `[${tag}]`;
    })
    .join("\n\n");
}

/**
 * **Final** Suno “Style of Music” paste: priority-ordered, always ≤ 1000 characters.
 * Sound-first, compact — safe for one-shot copy into Suno.
 */
export function buildSunoPastedStyleLine(p) {
  const {
    selectedGenres = [],
    tempo = "",
    moodWords = "",
    selectedSounds = [],
    selectedRhythms = [],
    vocal = "Instrumental",
    instrumentalVocalFx = false,
    idea = "",
    rules = "",
    voiceStyleReference = "",
    voiceStyleLine = "",
  } = p;
  const voiceRef = normalizeToken(voiceStyleLine || voiceStyleReference).slice(0, 120);

  const parts = [];
  pushTokens(parts, selectedGenres.length ? selectedGenres : ["electronic"]);
  if (tempo) parts.push(tempo);
  if (moodWords) pushTokens(parts, moodWords.split(/,\s*/));
  if (vocal === "Instrumental") {
    parts.push(
      instrumentalVocalFx
        ? "instrumental, vocal FX only, no sung lyrics"
        : "instrumental, no vocals, no vocal chops, no mumbled texture",
    );
  } else if (vocal) {
    parts.push(vocal);
  }
  pushTokens(parts, (selectedSounds || []).slice(0, 6));
  pushTokens(parts, (selectedRhythms || []).slice(0, 4));
  const goal = normalizeToken(idea).slice(0, 120);
  if (goal) parts.push(goal);
  const r = normalizeToken(rules).replace(/\n/g, ", ");
  if (r) pushTokens(parts, r.split(/,\s*/).slice(0, 10));
  if (voiceRef && vocal !== "Instrumental") parts.push(voiceRef);

  return joinWithCap(parts, SUNO_STYLE_CHAR_CAP);
}

/**
 * **Final** Suno Lyrics field — priority-ordered (metadata first, lyric body last to drop).
 * Vocal tags and section brackets survive trimming longer than prose tails.
 */
export function buildSunoPastedLyricsField(p) {
  const vocal = p.vocal || "Instrumental";
  if (vocal === "Instrumental") {
    return "Instrumental only.";
  }

  const generated = normalizeToken(p.generatedLyrics);
  if (generated) {
    return joinWithCap([generated], SUNO_LYRICS_CHAR_TYPICAL_MAX, "\n\n");
  }

  const scaffold = buildMinimalLyricsScaffold({
    lyricTheme: p.lyricTheme,
    lyricStructure: p.lyricStructure,
  });
  if (scaffold) {
    return joinWithCap([scaffold], SUNO_LYRICS_CHAR_TYPICAL_MAX, "\n\n");
  }

  return "";
}

export function getStepCount() {
  return SUNO_GUIDED_STEPS.length;
}

/** 0-based index of the “Polish” step (analyzers / final polish before copy). */
export function getGuidedPolishStepIndex() {
  const i = SUNO_GUIDED_STEPS.findIndex((s) => s.name === "Polish");
  return i >= 0 ? i : 6;
}

/** Clamp guided path to the Polish (analyzer) step. */
export function resolvePolishStepIndex() {
  const max = getStepCount() - 1;
  const polish = getGuidedPolishStepIndex();
  return Math.min(max, Math.max(0, polish));
}

/** Short caption under “Live Style preview” — what this step’s preview includes vs later steps. */
export function getSunoStylePreviewHint(stepIndex) {
  if (stepIndex < 0) return "";
  if (stepIndex < 2) return "Shows identity only (genres, tempo, mood). Rhythm & sound chips join at step 3.";
  if (stepIndex < 3) return "Includes groove & sound palette when you’ve selected chips.";
  if (stepIndex < 4) return "Adds vocal role and rules.";
  if (stepIndex < 5) return "Adds idea and structure lines (walkthrough order).";
  if (stepIndex < 6) return "Adds voice reference when set (omitted for instrumental).";
  if (stepIndex < 7) {
    return "Polish step: Voice Character Studio, analyzers, and Co-Producer are optional — use Next whenever you're ready to copy.";
  }
  return "Use the two copy blocks only — the Style line is 1000-safe and re-ordered for Suno (not the same as the walkthrough string above).";
}
