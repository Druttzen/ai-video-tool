/**
 * Manuscript chat — user writes a creative brief; AI returns video styles + prompts.
 */
import { resolveCatalogTags } from "./analyzer-suggestions";
import {
  genreOptions,
  lyricModeOptions,
  rhythmOptions,
  soundOptions,
  vocalOptions,
} from "./video-config";
import { clamp } from "./music-helpers";
import { LLM_REQUEST_TIMEOUT_MS } from "./co-producer-llm";

export const MANUSCRIPT_CHAT_STORAGE_KEY = "ai_video_creator_manuscript_chat_v1";

const VALID_MOOD_KEYS = ["energy", "aggression", "darkness", "emotion", "complexity", "space"];

function normalize(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

/** @param {string} raw */
export function extractJsonFromLlmText(raw) {
  const text = String(raw || "").trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(candidate.slice(start, end + 1));
  }
  return JSON.parse(candidate);
}

/**
 * @param {object} raw — parsed LLM JSON
 */
export function buildProjectPatchFromManuscript(raw) {
  if (!raw || typeof raw !== "object") return null;

  const patch = {};
  if (raw.idea) patch.idea = normalize(raw.idea);
  if (raw.structure) patch.structure = normalize(raw.structure);
  if (raw.lyricTheme) patch.lyricTheme = normalize(raw.lyricTheme);
  if (raw.lyricStructure) patch.lyricStructure = normalize(raw.lyricStructure);
  if (raw.generatedLyrics) patch.generatedLyrics = String(raw.generatedLyrics).trim();
  if (raw.notes) patch.notes = String(raw.notes).trim();
  if (raw.rules) patch.rules = normalize(raw.rules);
  if (raw.tempo) patch.tempo = normalize(raw.tempo);
  if (raw.coProducerOutput) patch.coProducerOutput = String(raw.coProducerOutput).trim();

  const genres = resolveCatalogTags(raw.selectedGenres || raw.visualStyles || [], genreOptions);
  const lighting = resolveCatalogTags(raw.selectedSounds || raw.lighting || [], soundOptions);
  const cameras = resolveCatalogTags(raw.selectedRhythms || raw.camera || [], rhythmOptions);

  if (genres.length) patch.selectedGenres = genres.slice(0, 3);
  if (lighting.length) patch.selectedSounds = lighting.slice(0, 6);
  if (cameras.length) patch.selectedRhythms = cameras.slice(0, 4);

  const vocal = resolveCatalogTags([raw.vocal].filter(Boolean), vocalOptions)[0];
  if (vocal) patch.vocal = vocal;

  const mode = lyricModeOptions.find(
    (m) => m.toLowerCase() === String(raw.lyricMode || "").toLowerCase(),
  );
  if (mode) patch.lyricMode = mode;

  if (raw.mood && typeof raw.mood === "object") {
    const mood = {};
    for (const k of VALID_MOOD_KEYS) {
      if (typeof raw.mood[k] === "number") mood[k] = clamp(raw.mood[k], 0, 100);
    }
    if (Object.keys(mood).length) patch.mood = mood;
  }

  patch.promptEngine = "Director";
  return patch;
}

/**
 * Offline keyword pass when LLM is unavailable.
 * @param {string} text
 */
export function manuscriptToVideoHeuristic(text) {
  const t = normalize(text);
  const lower = t.toLowerCase();
  const genres = [];
  const lighting = [];
  const cameras = [];

  const genreHints = [
    ["noir", "Noir"],
    ["neon", "Noir"],
    ["cinematic", "Cinematic"],
    ["anime", "Anime"],
    ["horror", "Horror"],
    ["documentary", "Documentary"],
    ["music video", "Music video"],
    ["commercial", "Commercial"],
    ["sci-fi", "Sci-fi"],
    ["fantasy", "Fantasy"],
    ["vintage", "Vintage film"],
    ["drone", "Drone aerial"],
  ];
  for (const [kw, g] of genreHints) {
    if (lower.includes(kw) && !genres.includes(g)) genres.push(g);
  }
  if (!genres.length) genres.push("Cinematic");

  if (/night|neon|club|cyber/i.test(t)) lighting.push("Neon night", "Rain reflections");
  else if (/sunset|golden|warm/i.test(t)) lighting.push("Golden hour", "Practical lamps");
  else if (/dark|moody|shadow/i.test(t)) lighting.push("Low-key noir", "Volumetric haze");
  else lighting.push("Mixed tungsten + LED", "Overcast soft");

  if (/fast|action|chase|montage/i.test(t)) cameras.push("Whip pan", "Handheld follow");
  else if (/slow|meditative|dream/i.test(t)) cameras.push("Slow dolly in", "Steadicam glide");
  else cameras.push("Tracking shot", "Medium cut rhythm");

  const sentences = t.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const idea = sentences[0] || t.slice(0, 280);

  return buildProjectPatchFromManuscript({
    idea,
    selectedGenres: genres,
    selectedSounds: lighting,
    selectedRhythms: cameras,
    structure: "establishing wide → subject focus → emotional hold",
    lyricTheme: sentences[1] || "visual story from manuscript",
    rules: "photorealistic, consistent wardrobe, no watermark, stable anatomy",
    vocal: /dialogue|speak|conversation/i.test(t) ? "Dialogue scene" : "Silent visual",
    tempo: /short|tiktok|reel/i.test(t) ? "8s" : "12s",
    mood: {
      energy: /energetic|fast|intense/i.test(t) ? 75 : 50,
      darkness: /dark|noir|horror/i.test(t) ? 70 : 40,
      emotion: /love|hope|joy/i.test(t) ? 65 : 45,
      aggression: /aggressive|fight|war/i.test(t) ? 70 : 35,
      complexity: 50,
      space: 55,
    },
    generatedLyrics: `[Scene 1]\n${idea}\n\n[Scene 2]\n${sentences[1] || "Continue the visual arc."}`,
    coProducerOutput: `Manuscript parsed locally (no LLM). Theme: ${idea.slice(0, 120)}…`,
  });
}

/**
 * @param {Array<{ role: string, content: string }>} history
 * @param {string} userText
 * @param {object} [projectContext]
 */
export function buildManuscriptChatLlmMessages(history, userText, projectContext = {}) {
  const system = `You are a music-video and cinematic prompt director for AI video generation.
The user writes a manuscript (creative brief, story, scene description, or Suno track vision).
Reply with ONLY valid JSON (no markdown outside a json code block) using this schema:
{
  "assistantReply": "short friendly summary of what you built (2-4 sentences)",
  "idea": "one-line video concept / logline",
  "selectedGenres": ["pick 1-3 from: ${genreOptions.slice(0, 20).join(", ")}..."],
  "selectedSounds": ["lighting terms, 2-4 from catalog"],
  "selectedRhythms": ["camera motion, 2-3 terms"],
  "structure": "shot flow with → arrows",
  "lyricTheme": "visual/emotional theme",
  "lyricStructure": "beat flow for Multi-beat mode",
  "generatedLyrics": "optional [Scene] / [Verse]-style shot list with bracket tags",
  "rules": "comma-separated constraints",
  "vocal": "one of: ${vocalOptions.join(", ")}",
  "tempo": "clip length like 10s or 15s",
  "lyricMode": "Multi-beat scene | Shot list | Single scene",
  "mood": { "energy": 0-100, "aggression": 0-100, "darkness": 0-100, "emotion": 0-100, "complexity": 0-100, "space": 0-100 },
  "directorPromptPreview": "full paragraph prompt ready for video model",
  "notes": "optional production notes"
}
Use Suno bracket vocabulary when the brief mentions music, chorus, verse, or drops.
Match lighting to sonic/mood cues. For music videos use Music video genre when appropriate.`;

  const contextLine = projectContext.idea
    ? `\nCurrent project idea: ${projectContext.idea}`
    : "";
  const messages = [
    { role: "system", content: system },
    ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    {
      role: "user",
      content: `${userText}${contextLine}\n\nReturn JSON only.`,
    },
  ];
  return messages;
}

/**
 * @param {Array<{ role: string, content: string }>} messages
 * @param {object} settings — co-producer LLM settings
 * @param {{ signal?: AbortSignal, timeoutMs?: number }} [options]
 */
export async function sendManuscriptChatRequest(messages, settings, options = {}) {
  const timeoutMs = options.timeoutMs ?? LLM_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener("abort", () => controller.abort(), { once: true });

  try {
    const res = await fetch(String(settings.apiUrl).trim(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${String(settings.apiKey).trim()}`,
      },
      body: JSON.stringify({
        model: settings.model || "gpt-4o-mini",
        messages,
        temperature: 0.75,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`LLM failed (${res.status})${errText ? `: ${errText.slice(0, 100)}` : ""}`);
    }
    const data = await res.json();
    const raw = String(data?.choices?.[0]?.message?.content || "").trim();
    if (!raw) throw new Error("Empty LLM response");
    const parsed = extractJsonFromLlmText(raw);
    const patch = buildProjectPatchFromManuscript(parsed);
    if (!patch?.idea && !patch?.selectedGenres) throw new Error("LLM JSON missing video fields");
    return {
      assistantReply: parsed.assistantReply || parsed.directorPromptPreview || "Video concept ready.",
      directorPromptPreview: parsed.directorPromptPreview || "",
      patch,
      raw: parsed,
    };
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error(`Manuscript chat timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function loadManuscriptChatHistory() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(MANUSCRIPT_CHAT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveManuscriptChatHistory(messages) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MANUSCRIPT_CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-40)));
  } catch {
    /* ignore quota */
  }
}
