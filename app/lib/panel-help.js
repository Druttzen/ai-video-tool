/** Help copy keyed by panel topic — shown in Help dialog. */
import { getIndexHelpBody, INDEX_SOURCES } from "./video-creator-index";

export const PANEL_HELP = {
  "setup-hub": {
    title: "All-in-one setup hub",
    body: "Scan the desktop environment for Git, Node.js, managed Python/venv, Open-Sora, GPU, ffmpeg, pip/torch deps, librosa music-video sync, models, and optional WSL. Use Scan missing tools or Install all tools to run the built-in protocol (everything under AppData/addons). Apply maxed profile links paths to Director and enables GPU auto-run. Auto-update runs after each scan. Browser mode shows export-only status.",
  },
  global: {
    title: "Project actions",
    body: `Save — writes project to browser storage (localStorage).
Load — import a JSON bundle (project + presets + voice profile).
Clear — panel-specific reset; global Reset is in the left sidebar.
Help — opens this guide for the current panel.`,
  },
  "guided-path": {
    title: "Guided path",
    body: "Step-by-step workflow: preset → mood → camera/light → rules → idea → narrative → polish → copy. Use Next/Back or jump steps. Sora-like engine unlocks Suno-style copy fields.",
  },
  gpuWorkflow: {
    title: "GPU workflow enhancements",
    body: "Toggle GPU-powered steps: hardware scan, auto-optimize, local render, max resolution, premium quality, motion FX, I2V, VRAM guard, seed batch. Presets: Essentials, Local GPU studio, Max quality, Full stack. Auto-run on music video paths 1–5 and before render. Saved to localStorage and exported in project bundles.",
  },
  workflows: {
    title: "Music video paths 1–5",
    body: `Path 1 — drop track in Analyzers, Run maps to video (librosa beat sync on desktop).
Path 2 — paste Suno Style/Lyrics, Run applies visual fields.
Path 3 — BOTH merges track + paste for full sync (Director duration from track).
Path 4 — use Video Prep Agent: drop files + describe vision, Apply all → Director.
Path 5 — audio + reference image → librosa beat-sync MV with highlight or full-track duration.`,
  },
  idea: {
    title: "Idea input",
    body: "One-line scene goal or logline. Director and prompt builders lead with this sentence. Keep it visual and active.",
  },
  "lyric-style": {
    title: "Narrative / scene direction",
    body: "Theme, beat structure, lyric/scene mode, and generated shot list. Multi-beat scene mode pairs with music-video bracket tags.",
  },
  analyzers: {
    title: "Drag & drop analyzers",
    body: "Drop audio for BPM/genre/mood DNA or images for color/mood. Merge into Suno fields (Sora-like) or Map to music video (Director).",
  },
  "music-video": {
    title: "Suno → music video studio",
    body: "Paste Suno Style/Lyrics inline. A = track only, B = paste only, C = BOTH. Status chips show readiness.",
  },
  manuscript: {
    title: "Video Prep Agent",
    body: "Primary Cursor-like chat: drop audio/images, describe your MV or scene. Agent returns project fields, Director settings patch, and suggested actions (map track, merge paste, audio+image MV). Enable Co-Producer LLM for full AI; local parser works offline. Apply to project or Apply all — legacy analyzer/workflow panels optional.",
  },
  "style-dna": {
    title: "Style-DNA search",
    body: "Search Spotify/YouTube/MusicBrainz references. Apply maps sonic DNA through the music-video visual translator.",
  },
  mood: {
    title: "Mood sliders",
    body: "Energy, darkness, emotion, etc. feed mood words into Director prompts. Match your track or manuscript tone.",
  },
  "music-controls": {
    title: "Visual controls",
    body: "Visual style chips, camera motion, lighting, narration mode, duration. These are your primary video craft picks.",
  },
  "co-producer-quick": {
    title: "Co-producer quick buttons",
    body: "One-click creative nudges: darker, aggressive, minimal, cinematic, club — patches mood and rules.",
  },
  "co-producer": {
    title: "Co-producer AI",
    body: "Improve Prompt analyzes balance. Generate Hooks/Lyrics for Suno fields. Optional OpenAI-compatible LLM in settings.",
  },
  director: {
    title: "Director engine",
    body: "Create tab: craft + wizard + templates. Render tab: suggested benchmark settings (project + hardware), output dropdowns, DirectX/Vulkan/Metal APIs, load meters, GPU preflight, progress + cancel. Advanced: hardware + local pipeline.",
  },
  "suno-reimport": {
    title: "Suno re-import",
    body: "Paste finished Suno Style/Lyrics. Compare diff vs project-built fields. Apply to music video or use pasted copy for preview.",
  },
  variations: {
    title: "Variation engine",
    body: "Generate prompt variations from current project. Pick one to merge ideas into the workspace.",
  },
  "pro-mode": {
    title: "Pro mode fields",
    body: "Structure map, rules, notes, intensity. Rules hold hard constraints; keep the main idea sentence clean.",
  },
  presets: {
    title: "Style presets",
    body: "Factory presets load visual style + camera + lighting baselines. Save custom presets for recurring looks.",
  },
  "save-load": {
    title: "Save / load",
    body: "Save Progress → localStorage. Export Bundle → JSON file. Import Bundle → restore full session. Revert snapshot undoes last capture.",
  },
  "prompt-preview": {
    title: "Prompt preview",
    body: "Paste-ready Style/Lyrics (Sora-like) or full prompt (Standard/Director). Copy Prompt or individual Suno boxes.",
  },
  history: {
    title: "History / compare",
    body: "Manual snapshots and copy events. Restore reloads an earlier prompt state.",
  },
  scoring: {
    title: "Track scoring",
    body: "Rate outputs 1–5 on bass, rhythm, identity, clarity after generation — for comparing takes.",
  },
  "suno-language": {
    title: "Suno language index",
    body: "Symbols, bracket tags, genre anchors, principles. Apply Genre Anchors merges lighting + camera from selected visual genres.",
  },
  "video-index": {
    title: "Video Creator Index",
    body: "Master reference: workflows, bundles, manuscript templates, Director settings, styles, camera, lighting, mood, rules, and model-specific tips synced from community + official guides.",
  },
};

/**
 * @param {string} topic
 */
export function getPanelHelp(topic) {
  const base = PANEL_HELP[topic] || PANEL_HELP.global;
  const extra = getIndexHelpBody(topic);
  if (!extra) return base;
  const sources = INDEX_SOURCES.slice(0, 4).join(" · ");
  return {
    ...base,
    body: `${base.body}\n\n--- Reference index ---\n${extra}${sources ? `\n\nSources: ${sources}` : ""}`,
  };
}

/** @param {string} topic */
export function triggerImportBundleClick() {
  if (typeof document === "undefined") return;
  document.getElementById("global-import-bundle")?.click();
}
