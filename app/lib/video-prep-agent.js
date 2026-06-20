/**
 * Video Prep Agent — unified chat context, LLM schema, action dispatch, learning, persistence.
 */
import {
  buildProjectPatchFromManuscript,
  extractJsonFromLlmText,
  manuscriptToVideoHeuristic,
} from "./manuscript-video-chat";
import {
  getMusicVideoWorkflowReadiness,
  MUSIC_VIDEO_WORKFLOWS,
  scrollToDirectorPanelAfterApply,
  scrollToPanel,
} from "./music-video-workflows";
import { loadDirectorSettingsFromStorage, saveDirectorSettingsToStorage } from "./director-settings";
import {
  genreOptions,
  lyricModeOptions,
  rhythmOptions,
  soundOptions,
  vocalOptions,
} from "./video-config";
import { LLM_REQUEST_TIMEOUT_MS } from "./co-producer-llm";
import { safeLocalStorage } from "./safe-local-storage";
import {
  getDirectorAspectRatios,
  getDirectorExamplePrompts,
  getDirectorQualityPresets,
} from "./director-catalog";
import {
  getGpuWorkflowFunctions,
  getGpuWorkflowPresets,
} from "./gpu-workflow-functions";
import {
  getIndexPrinciples,
  getIndexRulesMusicVideo,
  getIndexRulesUniversal,
  getIndexWorkflows,
  INDEX_SOURCES,
} from "./video-creator-index";
import { PANEL_HELP } from "./panel-help";
import { buildRenderHonestyNoteFromDirectorSettings } from "./render-segment-hints";
import { loadAgentSessionFromHost, saveAgentSessionToHost } from "./electron-bridge";
import { createDefaultProductionState, normalizeProductionState } from "./video-production-pipeline";

export const VIDEO_PREP_AGENT_STORAGE_KEY = "ai_video_creator_manuscript_chat_v1";
export const VIDEO_PREP_AGENT_SESSION_KEY = "ai_video_creator_video_prep_agent_session_v1";
export const AGENT_SESSION_VERSION = 1;
export const AGENT_SESSION_REL_DIR = "agent-memory";
export const AGENT_SESSION_FILENAME = "video-prep-agent-session.json";

/** @typedef {"start"|"media_uploaded"|"analyzed"|"brief_sent"|"plan_ready"|"applied"|"director_ready"|"rendering"|"assembled"|"rendered"|"done"} WorkflowPhase */

export const WORKFLOW_PHASES = [
  "start",
  "media_uploaded",
  "analyzed",
  "brief_sent",
  "plan_ready",
  "applied",
  "director_ready",
  "rendering",
  "assembled",
  "rendered",
  "done",
];

export const WORKFLOW_CHECKLIST_KEYS = [
  "hasAudio",
  "hasImage",
  "hasSunoPaste",
  "hasBrief",
  "hasPlan",
  "patchApplied",
  "directorReady",
];

/** @typedef {"patchProject"|"applyAudioToMusicVideo"|"applySunoPasteToMusicVideo"|"applyMusicVideoFromBoth"|"applyAudioVisualMusicVideo"|"saveDirectorSettings"|"runGpuWorkflow"|"generateLyrics"|"runFullProduction"|"checkProductionReadiness"} AgentActionId */

export const AGENT_ACTION_IDS = [
  "patchProject",
  "applyAudioToMusicVideo",
  "applySunoPasteToMusicVideo",
  "applyMusicVideoFromBoth",
  "applyAudioVisualMusicVideo",
  "saveDirectorSettings",
  "runGpuWorkflow",
  "generateLyrics",
  "runFullProduction",
  "checkProductionReadiness",
];

/**
 * @param {object|null} audioAnalysis
 * @param {object|null} imageAnalysis
 */
export function buildAnalysisChips(audioAnalysis, imageAnalysis) {
  const chips = [];
  if (audioAnalysis) {
    chips.push({
      kind: "audio",
      label: audioAnalysis.estimatedBpm
        ? `BPM ${audioAnalysis.estimatedBpm}`
        : "Audio analyzed",
      detail:
        audioAnalysis.moodSuggestion?.energy != null
          ? `energy ${audioAnalysis.moodSuggestion.energy}`
          : audioAnalysis.fileName || "",
    });
    if (audioAnalysis.interpretation || audioAnalysis.trackSummary) {
      chips.push({
        kind: "audio-mood",
        label: "Track mood",
        detail: String(audioAnalysis.interpretation || audioAnalysis.trackSummary).slice(0, 120),
      });
    }
  }
  if (imageAnalysis) {
    chips.push({
      kind: "image",
      label: imageAnalysis.visualMood
        ? `Visual: ${imageAnalysis.visualMood}`
        : "Image analyzed",
      detail: imageAnalysis.avgColor || imageAnalysis.fileName || "",
    });
  }
  return chips;
}

/** @returns {object} */
export function createDefaultLearningProfile() {
  return {
    acceptedActions: {},
    dismissedSuggestions: {},
    patchFieldPrefs: {},
    genres: {},
    styles: {},
    aspectRatios: {},
    workflowIntents: {},
    intentByGenre: {},
    updatedAt: null,
  };
}

/** @returns {object} */
export function buildDefaultAgentSession() {
  return {
    version: AGENT_SESSION_VERSION,
    updatedAt: null,
    messages: [],
    lastProposal: null,
    workflow: {
      phase: "start",
      checklist: {
        hasAudio: false,
        hasImage: false,
        hasSunoPaste: false,
        hasBrief: false,
        hasPlan: false,
        patchApplied: false,
        directorReady: false,
      },
    },
    learningProfile: createDefaultLearningProfile(),
    analysisSnapshots: {
      audioFileName: null,
      imageFileName: null,
      lastAnalyzedAt: null,
    },
    production: createDefaultProductionState(),
  };
}

/**
 * @param {object} params
 */
export function buildWorkflowChecklist({
  audioAnalysis = null,
  imageAnalysis = null,
  sunoPasteStyle = "",
  sunoPasteLyrics = "",
  messages = [],
  lastProposal = null,
  patchApplied = false,
  directorReady = false,
  production = null,
} = {}) {
  const hasAudio = Boolean(audioAnalysis);
  const hasImage = Boolean(imageAnalysis);
  const hasSunoPaste = Boolean(
    String(sunoPasteStyle || "").trim() || String(sunoPasteLyrics || "").trim(),
  );
  const hasBrief = messages.some((m) => m.role === "user" && String(m.content || "").trim());
  const hasPlan = Boolean(lastProposal?.patch?.idea || lastProposal?.patch?.selectedGenres?.length);

  return {
    hasAudio,
    hasImage,
    hasSunoPaste,
    hasBrief,
    hasPlan,
    patchApplied: Boolean(patchApplied),
    directorReady: Boolean(directorReady),
  };
}

/**
 * @param {object} params
 * @returns {WorkflowPhase}
 */
export function detectWorkflowPhase(params = {}) {
  const productionPhase = params.productionPhase || params.production?.phase;
  if (productionPhase === "done") return "done";
  if (productionPhase === "assembled") return "assembled";
  if (productionPhase === "rendering") return "rendering";
  const checklist = buildWorkflowChecklist(params);
  if (params.rendered || productionPhase === "rendered") return "rendered";
  if (checklist.directorReady || (checklist.patchApplied && checklist.hasPlan)) {
    return checklist.directorReady ? "director_ready" : "applied";
  }
  if (checklist.hasPlan) return "plan_ready";
  if (checklist.hasBrief) return "brief_sent";
  if (checklist.hasAudio || checklist.hasImage) {
    if (checklist.hasAudio && audioHasAnalysis(params.audioAnalysis)) {
      return "analyzed";
    }
    if (checklist.hasImage && imageHasAnalysis(params.imageAnalysis)) {
      return "analyzed";
    }
    return "media_uploaded";
  }
  if (checklist.hasSunoPaste) return "media_uploaded";
  return "start";
}

function audioHasAnalysis(audioAnalysis) {
  return Boolean(
    audioAnalysis &&
      (audioAnalysis.estimatedBpm ||
        audioAnalysis.moodSuggestion ||
        audioAnalysis.suggestedGenres?.length),
  );
}

function imageHasAnalysis(imageAnalysis) {
  return Boolean(
    imageAnalysis &&
      (imageAnalysis.visualMood || imageAnalysis.avgColor || imageAnalysis.moodSuggestion),
  );
}

/**
 * @param {WorkflowPhase} phase
 * @param {object} context
 * @param {object} [learningProfile]
 * @returns {Array<{ id: string, label: string, kind: string, actionId?: string, destructive?: boolean, score?: number }>}
 */
export function buildWorkflowSuggestions(phase, context = {}, learningProfile = {}) {
  const checklist = context.checklist || buildWorkflowChecklist(context);
  const dismissed = learningProfile.dismissedSuggestions || {};
  const accepted = learningProfile.acceptedActions || {};
  const candidates = [];

  const push = (item) => {
    if ((dismissed[item.id] || 0) >= 3) return;
    let score = item.score ?? 1;
    if (item.actionId && accepted[item.actionId]) score += accepted[item.actionId] * 0.15;
    candidates.push({ ...item, score });
  };

  if (!checklist.hasAudio && !checklist.hasSunoPaste) {
    push({ id: "drop-track", label: "Drop a track (WAV/MP3)", kind: "attach", score: 2 });
  }
  if (checklist.hasAudio && !checklist.hasImage) {
    push({
      id: "path-e-image",
      label: "Add reference image for Path E",
      kind: "attach",
      score: 1.8,
    });
  }
  if (checklist.hasAudio && checklist.hasImage && phase !== "applied") {
    push({
      id: "path-e-run",
      label: "Path E — audio + picture MV",
      kind: "action",
      actionId: "applyAudioVisualMusicVideo",
      score: 2,
    });
  }
  if (phase === "start" || phase === "media_uploaded") {
    push({ id: "describe-vision", label: "Describe your MV vision", kind: "focus-input", score: 1.2 });
  }
  if (phase === "analyzed" && !checklist.hasBrief) {
    push({ id: "send-brief", label: "Send brief to agent", kind: "focus-input", score: 1.5 });
  }
  if (phase === "plan_ready" && !checklist.patchApplied) {
    push({
      id: "apply-all",
      label: "Apply all",
      kind: "action",
      actionId: "applyAll",
      destructive: true,
      score: 2.5,
    });
    push({
      id: "apply-project",
      label: "Apply to project",
      kind: "action",
      actionId: "patchProject",
      score: 2,
    });
  }
  if (phase === "applied" || phase === "director_ready") {
    push({
      id: "produce-video",
      label: "Produce video (full pipeline)",
      kind: "action",
      actionId: "runFullProduction",
      score: 2.8,
    });
    push({ id: "open-director", label: "Open Director", kind: "scroll", target: "director-panel", score: 2.2 });
  }
  if (phase === "rendering" || phase === "assembled") {
    push({
      id: "check-readiness",
      label: "Check production status",
      kind: "action",
      actionId: "checkProductionReadiness",
      score: 1.5,
    });
  }
  if (checklist.hasAudio && (phase === "analyzed" || phase === "brief_sent")) {
    push({
      id: "gpu-optimize",
      label: "GPU optimize settings",
      kind: "action",
      actionId: "runGpuWorkflow",
      score: (accepted.runGpuWorkflow || 0) > 0 ? 1.8 : 1,
    });
  }
  if (context.sunoPaste?.hasPaste && checklist.hasAudio) {
    push({
      id: "merge-both",
      label: "Merge track + Suno paste",
      kind: "action",
      actionId: "applyMusicVideoFromBoth",
      score: 1.6 + (accepted.applyMusicVideoFromBoth || 0) * 0.1,
    });
  }

  const phaseBoost = {
    start: ["drop-track", "describe-vision"],
    media_uploaded: ["drop-track", "send-brief", "describe-vision"],
    analyzed: ["send-brief", "path-e-run", "gpu-optimize"],
    brief_sent: ["apply-all", "apply-project", "gpu-optimize"],
    plan_ready: ["apply-all", "apply-project"],
    applied: ["open-director", "produce-video"],
    director_ready: ["produce-video", "open-director"],
    rendering: ["check-readiness"],
    assembled: ["check-readiness"],
  };
  for (const c of candidates) {
    if (phaseBoost[phase]?.includes(c.id)) c.score = (c.score || 1) + 0.5;
  }

  return candidates
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 3);
}

/** @typedef {{ intent: string, confidence: number, recommendedPath: number, label: string, alternatives?: string[] }} WorkflowIntentResult */

const INTENT_LABELS = {
  "path-1": "Path A — track + beat sync MV",
  "path-2": "Path B — Suno paste only",
  "path-3": "Path C — full sync (track + paste)",
  "path-4": "Path D — manuscript / scratch brief",
  "path-5": "Path E — audio + picture sync",
  "beat-sync-mv": "Beat-sync music video",
  "instrumental-broll": "Instrumental B-roll",
  "dialogue-scene": "Dialogue / narrative scene",
  "suno-paste": "Suno paste workflow",
  "audio-image-sync": "Audio + image sync",
  manuscript: "Manuscript chat workflow",
};

const INTENT_TO_PATH = {
  "path-1": 1,
  "path-2": 2,
  "path-3": 3,
  "path-4": 4,
  "path-5": 5,
  "beat-sync-mv": 1,
  "suno-paste": 2,
  "audio-image-sync": 5,
  manuscript: 4,
  "instrumental-broll": 1,
  "dialogue-scene": 4,
};

function pathNumberFromIntent(intent) {
  return INTENT_TO_PATH[intent] ?? 4;
}

function intentLabel(intent) {
  return INTENT_LABELS[intent] || intent;
}

function collectIntentText(params = {}) {
  const parts = [
    params.userText,
    ...(params.messages || [])
      .filter((m) => m.role === "user")
      .map((m) => m.content),
    params.project?.idea,
    params.project?.lyricTheme,
    params.project?.generatedLyrics,
  ];
  return parts.filter(Boolean).join(" ");
}

/**
 * Detect story/workflow intent from chat, project fields, and uploaded media.
 * @param {object} params
 * @returns {WorkflowIntentResult}
 */
export function detectWorkflowIntent(params = {}) {
  const combinedText = collectIntentText(params);
  const checklist = buildWorkflowChecklist(params);
  const learningProfile = params.learningProfile || createDefaultLearningProfile();
  /** @type {Record<string, number>} */
  const scores = {};
  const bump = (key, amt = 1) => {
    scores[key] = (scores[key] || 0) + amt;
  };

  if (/\b(beat[\s-]?sync|sync.*beat|librosa|cut on drop|chorus cut)\b/i.test(combinedText)) {
    bump("beat-sync-mv", 3);
  }
  if (/\b(instrumental|b[\s-]?roll|no lyric|ambient score|score only)\b/i.test(combinedText)) {
    bump("instrumental-broll", 3);
  }
  if (/\b(dialogue|conversation|monologue|talking head|character speaks|two shot dialogue)\b/i.test(combinedText)) {
    bump("dialogue-scene", 3);
  }
  if (/\b(suno paste|paste.*suno|finished suno|style\s*\+\s*lyrics)\b/i.test(combinedText)) {
    bump("path-2", 2);
  }
  if (/\b(both|full sync|track.*paste|merge.*suno|path c)\b/i.test(combinedText)) {
    bump("path-3", 3);
  }
  if (/\b(reference image|mood board|picture sync|path e|audio.*image|visual ref)\b/i.test(combinedText)) {
    bump("path-5", 2);
  }
  if (/\b(music video|\bmv\b|synthwave|edm|hip.?hop|chorus|verse|drop|full song)\b/i.test(combinedText)) {
    bump("path-1", 1);
    bump("beat-sync-mv", 1);
  }
  if (/\b(from scratch|manuscript|write.*brief|describe.*scene|path d)\b/i.test(combinedText)) {
    bump("path-4", 2);
  }

  if (checklist.hasAudio && checklist.hasImage) bump("path-5", 4);
  else if (checklist.hasAudio && checklist.hasSunoPaste) bump("path-3", 4);
  else if (checklist.hasSunoPaste && !checklist.hasAudio) bump("path-2", 4);
  else if (checklist.hasAudio) bump("path-1", 3);
  else if (checklist.hasBrief && !checklist.hasAudio) bump("path-4", 2);

  const genres = [
    ...(params.project?.selectedGenres || []),
    ...(params.audioAnalysis?.suggestedGenres || []),
  ];
  for (const genre of genres) {
    const intentMap = learningProfile.intentByGenre?.[genre];
    if (intentMap) {
      for (const [intent, count] of Object.entries(intentMap)) {
        bump(intent, count * 0.5);
      }
    }
  }
  for (const [intent, count] of Object.entries(learningProfile.workflowIntents || {})) {
    bump(intent, count * 0.35);
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const topIntent = sorted[0]?.[0] || "path-4";
  return {
    intent: topIntent,
    confidence: sorted[0]?.[1] || 0,
    recommendedPath: pathNumberFromIntent(topIntent),
    label: intentLabel(topIntent),
    alternatives: sorted.slice(1, 3).map(([k]) => k),
  };
}

/**
 * @param {unknown} raw
 * @param {unknown} recommendedPath
 */
export function normalizeWorkflowIntent(raw, recommendedPath) {
  if (raw && typeof raw === "object" && raw.intent) {
    return {
      intent: String(raw.intent),
      confidence: Number(raw.confidence) || 0,
      recommendedPath: Number(raw.recommendedPath || recommendedPath) || pathNumberFromIntent(raw.intent),
      label: raw.label ? String(raw.label) : intentLabel(String(raw.intent)),
      alternatives: Array.isArray(raw.alternatives) ? raw.alternatives.map(String) : [],
    };
  }
  if (typeof raw === "string" && raw.trim()) {
    return {
      intent: raw.trim(),
      confidence: 1,
      recommendedPath: pathNumberFromIntent(raw.trim()),
      label: intentLabel(raw.trim()),
      alternatives: [],
    };
  }
  return null;
}

/**
 * @param {unknown} steps
 * @returns {Array<{ title: string, why: string, actionId?: string|null, priority: "primary"|"optional", kind?: string, target?: string }>}
 */
export function normalizeNextSteps(steps) {
  if (!Array.isArray(steps)) return [];
  const out = [];
  for (const item of steps) {
    if (!item || typeof item !== "object") continue;
    const title = String(item.title || "").trim();
    const why = String(item.why || item.reason || "").trim();
    if (!title) continue;
    const priority = item.priority === "optional" ? "optional" : "primary";
    const actionId =
      item.actionId &&
      (AGENT_ACTION_IDS.includes(item.actionId) ||
        item.actionId === "applyAll" ||
        item.actionId === "revealProductionOutput")
        ? item.actionId
        : item.actionId
          ? String(item.actionId)
          : null;
    out.push({
      title,
      why,
      actionId,
      priority,
      kind: item.kind ? String(item.kind) : undefined,
      target: item.target ? String(item.target) : undefined,
    });
  }
  return out.slice(0, 4);
}

function rankNextSteps(steps, accepted = {}, workflowIntent = null) {
  return steps
    .map((step) => {
      let score = step.priority === "primary" ? 2 : 1;
      if (step.actionId && accepted[step.actionId]) score += accepted[step.actionId] * 0.25;
      if (workflowIntent?.recommendedPath === 5 && step.actionId === "applyAudioVisualMusicVideo") {
        score += 0.5;
      }
      if (
        (workflowIntent?.intent === "beat-sync-mv" || workflowIntent?.intent === "path-1") &&
        step.actionId === "applyAudioToMusicVideo"
      ) {
        score += 0.4;
      }
      return { ...step, score };
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0));
}

/**
 * Build ranked next steps for current phase + detected workflow intent.
 * @param {object} params
 */
export function buildNextSteps(params = {}) {
  const workflowIntent =
    params.workflowIntent?.intent != null
      ? params.workflowIntent
      : detectWorkflowIntent(params);
  const phase = params.phase || params.context?.workflowPhase || "start";
  const checklist = params.checklist || params.context?.workflowChecklist || buildWorkflowChecklist(params);
  const learningProfile = params.learningProfile || createDefaultLearningProfile();
  const path = workflowIntent.recommendedPath;
  /** @type {Array<{ title: string, why: string, actionId?: string|null, priority: "primary"|"optional", kind?: string, target?: string }>} */
  const steps = [];

  if (phase === "start" || phase === "media_uploaded") {
    if (path === 5) {
      steps.push({
        title: "Drop audio + reference image",
        why: "Path E needs both for beat-sync picture MV",
        actionId: null,
        priority: "primary",
        kind: "attach",
      });
    } else if (path === 2 || path === 3) {
      steps.push({
        title: "Paste Suno Style + Lyrics",
        why: `Path ${path === 3 ? "C" : "B"} starts from Suno fields in the studio panel`,
        actionId: null,
        priority: "primary",
      });
    } else if (!checklist.hasAudio) {
      steps.push({
        title: "Drop your track (WAV/MP3)",
        why: `Most relevant for ${workflowIntent.label}`,
        actionId: null,
        priority: "primary",
        kind: "attach",
      });
    }
    steps.push({
      title: "Describe your video story",
      why: "Agent maps genres, shots, and Director settings to your intent",
      actionId: null,
      priority: checklist.hasAudio ? "primary" : "optional",
      kind: "focus-input",
    });
  }

  if (phase === "analyzed" || phase === "brief_sent") {
    if (!checklist.hasBrief) {
      steps.push({
        title: "Send your brief to the agent",
        why: `Tailor shot beats for ${workflowIntent.label}`,
        actionId: null,
        priority: "primary",
        kind: "focus-input",
      });
    }
    if (path === 5 && checklist.hasAudio && checklist.hasImage) {
      steps.push({
        title: "Run Path E — audio + picture MV",
        why: "Merges reference image palette with librosa beat-sync cuts",
        actionId: "applyAudioVisualMusicVideo",
        priority: "primary",
      });
    } else if ((path === 1 || workflowIntent.intent === "beat-sync-mv") && checklist.hasAudio) {
      steps.push({
        title: "Map track → music video (Path A)",
        why: "Beat sync aligns chorus/verse cuts to analyzed BPM",
        actionId: "applyAudioToMusicVideo",
        priority: "primary",
      });
    } else if (path === 3 && checklist.hasAudio && checklist.hasSunoPaste) {
      steps.push({
        title: "Merge track + Suno paste (Path C)",
        why: "Full sync combines sonic DNA with Suno bracket structure",
        actionId: "applyMusicVideoFromBoth",
        priority: "primary",
      });
    } else if (path === 2 && checklist.hasSunoPaste) {
      steps.push({
        title: "Apply Suno paste → video (Path B)",
        why: "Maps pasted Style/Lyrics to visual genres and shot list",
        actionId: "applySunoPasteToMusicVideo",
        priority: "primary",
      });
    }
    if (checklist.hasPlan && !checklist.patchApplied) {
      steps.push({
        title: "Apply all",
        why: "Commits agent plan + suggested map/sync actions",
        actionId: "applyAll",
        priority: "primary",
      });
    }
    steps.push({
      title: "GPU optimize settings",
      why: "Optional — auto-tune Director for your GPU tier before render",
      actionId: "runGpuWorkflow",
      priority: "optional",
    });
  }

  if (phase === "plan_ready") {
    steps.push({
      title: "Apply all",
      why: `Primary action for ${workflowIntent.label} — fields + map/sync`,
      actionId: "applyAll",
      priority: "primary",
    });
    steps.push({
      title: "Apply to project only",
      why: "Optional — patch fields without running track/map actions",
      actionId: "patchProject",
      priority: "optional",
    });
  }

  if (phase === "applied" || phase === "director_ready") {
    steps.push({
      title: "Produce video — full pipeline",
      why: "Validate Setup Hub, render one Director clip, mux audio when ready",
      actionId: "runFullProduction",
      priority: "primary",
    });
    steps.push({
      title: "Open Director and render manually",
      why: "Optional — review prompt and tweak settings before render",
      actionId: null,
      priority: "optional",
      kind: "scroll",
      target: "director-panel",
    });
  }

  if (phase === "rendering") {
    steps.push({
      title: "Render in progress",
      why: "Local GPU render running — watch chat for progress",
      actionId: null,
      priority: "primary",
    });
  }

  if (phase === "done" || phase === "rendered") {
    steps.push({
      title: "Reveal finished MP4",
      why: "Open output folder from the last successful production run",
      actionId: "revealProductionOutput",
      priority: "primary",
    });
  }

  if (workflowIntent.intent === "dialogue-scene" && phase !== "director_ready") {
    steps.push({
      title: "Set lyric mode to Single scene",
      why: "Dialogue scenes work best with tight single-scene direction",
      actionId: "patchProject",
      priority: "optional",
    });
  }

  const ranked = rankNextSteps(steps, learningProfile.acceptedActions, workflowIntent);
  const primaries = ranked.filter((s) => s.priority === "primary").slice(0, 3);
  const optionals = ranked.filter((s) => s.priority === "optional").slice(0, 1);
  return [...primaries, ...optionals].slice(0, 4);
}

/**
 * @param {Array<{ title: string, why: string, priority: string }>} nextSteps
 * @param {WorkflowIntentResult|null} workflowIntent
 */
export function formatNextStepsSection(nextSteps, workflowIntent = null) {
  if (!nextSteps?.length) return "";
  const primary = nextSteps.filter((s) => s.priority === "primary");
  const optional = nextSteps.filter((s) => s.priority === "optional");
  let out = "\n\nNext steps";
  if (workflowIntent?.label) out += ` (${workflowIntent.label})`;
  out += ":\n";
  for (const s of primary) out += `• ${s.title} — ${s.why}\n`;
  for (const s of optional) out += `• Optional: ${s.title} — ${s.why}\n`;
  return out;
}

/**
 * @param {string} reply
 * @param {Array} nextSteps
 * @param {WorkflowIntentResult|null} workflowIntent
 */
export function buildAssistantReplyWithNextSteps(reply, nextSteps, workflowIntent = null) {
  const base = String(reply || "").trim();
  if (!nextSteps?.length) return base;
  if (/next steps/i.test(base)) return base;
  return base + formatNextStepsSection(nextSteps, workflowIntent);
}

/**
 * Pinned "What's next" block for chat UI.
 */
export function buildWhatsNextBlock(workflowIntent, phase, nextSteps) {
  const primary = (nextSteps || []).filter((s) => s.priority === "primary").slice(0, 3);
  const optional = (nextSteps || []).filter((s) => s.priority === "optional").slice(0, 1);
  return {
    phase: phase || "start",
    intentLabel: workflowIntent?.label || "Your video workflow",
    recommendedPath: workflowIntent?.recommendedPath ?? 4,
    workflowIntent: workflowIntent?.intent || "path-4",
    primary,
    optional,
  };
}

/**
 * Merge LLM/heuristic proposal with local next-step intelligence.
 */
export function enrichAgentProposal(proposal, context = {}, userText = "") {
  if (!proposal) return null;
  const workflowIntent =
    normalizeWorkflowIntent(proposal.workflowIntent, proposal.recommendedPath) ||
    detectWorkflowIntent({
      ...context,
      userText,
      project: context.project,
      messages: context.messages,
      learningProfile: context.learningProfile,
    });
  const nextSteps = normalizeNextSteps(proposal.nextSteps).length
    ? normalizeNextSteps(proposal.nextSteps)
    : buildNextSteps({
        workflowIntent,
        phase: context.workflowPhase,
        checklist: context.workflowChecklist,
        context,
        learningProfile: context.learningProfile,
      });
  return {
    ...proposal,
    workflowIntent,
    recommendedPath: proposal.recommendedPath ?? workflowIntent.recommendedPath,
    nextSteps,
    whatsNext: buildWhatsNextBlock(workflowIntent, context.workflowPhase, nextSteps),
  };
}

/**
 * Compact product knowledge for agent system prompt (local only).
 */
export function buildProductKnowledge() {
  const workflows = MUSIC_VIDEO_WORKFLOWS.map(
    (w) => `${w.badge} ${w.title}: ${w.summary}`,
  ).slice(0, 5);
  const indexWorkflows = getIndexWorkflows()
    .slice(0, 6)
    .map((w) => `${w.title}: ${(w.steps || []).join(" → ")}`);
  const gpuFns = getGpuWorkflowFunctions()
    .slice(0, 8)
    .map((f) => f.id);
  const gpuPresets = Object.keys(getGpuWorkflowPresets() || {});
  const director = loadDirectorSettingsFromStorage();
  const honesty = buildRenderHonestyNoteFromDirectorSettings(
    director,
    Number(director.durationSeconds) || 0,
  );

  return {
    indexSources: INDEX_SOURCES.slice(0, 4),
    principles: getIndexPrinciples().slice(0, 8),
    mvRules: getIndexRulesMusicVideo().slice(0, 4),
    universalRules: getIndexRulesUniversal().slice(0, 4),
    musicVideoPaths: workflows,
    indexWorkflows,
    panelHelp: {
      agent: PANEL_HELP.manuscript?.body?.slice(0, 400),
      workflows: PANEL_HELP.workflows?.body?.slice(0, 400),
      setupHub: PANEL_HELP["setup-hub"]?.body?.slice(0, 300),
      gpuWorkflow: PANEL_HELP.gpuWorkflow?.body?.slice(0, 250),
      director: PANEL_HELP.director?.body?.slice(0, 250),
    },
    directorCatalog: {
      aspectRatios: getDirectorAspectRatios(),
      qualityPresets: Object.keys(getDirectorQualityPresets()),
      examplePrompts: getDirectorExamplePrompts(4),
    },
    beatSync:
      "Desktop librosa beat sync maps BPM/sections to shot beats (Paths 1, 3, 5). Install music-video-sync addon via Setup Hub.",
    renderHonesty: honesty,
    gpuWorkflow: { functions: gpuFns, presets: gpuPresets },
    setupHints: {
      beatSync: "music-video-sync addon → librosa on desktop",
      ffmpeg: "FFmpeg addon for assemble full-track MV",
      models: "Open-Sora weights under userData/addons/open-sora/ckpts",
    },
  };
}

/**
 * @param {object|null} learningProfile
 */
export function buildLearningHints(learningProfile) {
  if (!learningProfile) return "";
  const hints = [];
  const topGenres = topEntries(learningProfile.genres, 3);
  const topStyles = topEntries(learningProfile.styles, 3);
  const topActions = topEntries(learningProfile.acceptedActions, 3);
  const topFields = topEntries(learningProfile.patchFieldPrefs, 4);
  const topAspect = topEntries(learningProfile.aspectRatios, 1);

  if (topAspect.length) hints.push(`often uses aspect ${topAspect.join(", ")}`);
  if (topGenres.length) hints.push(`prefers genres: ${topGenres.join(", ")}`);
  if (topStyles.length) hints.push(`visual styles: ${topStyles.join(", ")}`);
  if (topActions.length) hints.push(`usually runs: ${topActions.join(", ")}`);
  if (topFields.length) hints.push(`frequently edits: ${topFields.join(", ")}`);
  if (learningProfile.acceptedActions?.applyAudioVisualMusicVideo) {
    hints.push("likes beat-sync audio+image MV (Path E)");
  }
  if (learningProfile.acceptedActions?.runGpuWorkflow) {
    hints.push("runs GPU optimize before Director");
  }
  const topIntents = topEntries(learningProfile.workflowIntents, 2);
  if (topIntents.length) hints.push(`favored workflows: ${topIntents.map(intentLabel).join(", ")}`);
  if (!hints.length) return "";
  return `User learning (local): ${hints.join("; ")}.`;
}

function topEntries(record = {}, limit = 3) {
  return Object.entries(record || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}

function bumpCounter(record, key, amount = 1) {
  if (!key) return record;
  return { ...record, [key]: (record[key] || 0) + amount };
}

/**
 * @param {object} profile
 * @param {{ type: string, actionIds?: string[], patch?: object, suggestionId?: string, directorPatch?: object, workflowIntent?: string }} event
 */
export function mergeLearningProfile(profile, event) {
  const base = profile || createDefaultLearningProfile();
  const next = { ...base, updatedAt: Date.now() };

  if (event.type === "dismiss" && event.suggestionId) {
    next.dismissedSuggestions = bumpCounter(base.dismissedSuggestions, event.suggestionId);
    return next;
  }

  if (event.type === "apply") {
    for (const id of event.actionIds || []) {
      next.acceptedActions = bumpCounter(next.acceptedActions, id);
    }
    if (event.workflowIntent) {
      next.workflowIntents = bumpCounter(next.workflowIntents, event.workflowIntent);
    }
    const patch = event.patch || {};
    for (const key of Object.keys(patch)) {
      if (patch[key] != null && patch[key] !== "") {
        next.patchFieldPrefs = bumpCounter(next.patchFieldPrefs, key);
      }
    }
    for (const g of patch.selectedGenres || []) {
      next.genres = bumpCounter(next.genres, g);
      if (event.workflowIntent) {
        const genreMap = { ...(next.intentByGenre[g] || {}) };
        genreMap[event.workflowIntent] = (genreMap[event.workflowIntent] || 0) + 1;
        next.intentByGenre = { ...next.intentByGenre, [g]: genreMap };
      }
    }
    for (const s of patch.selectedSounds || []) {
      next.styles = bumpCounter(next.styles, s);
    }
    const aspect = event.directorPatch?.aspectRatio;
    if (aspect) next.aspectRatios = bumpCounter(next.aspectRatios, aspect);
    return next;
  }

  return next;
}

/**
 * @param {object} session
 * @param {object} params
 */
export function mergeSessionFromWorkspace(session, params) {
  const base = session || buildDefaultAgentSession();
  const checklist = buildWorkflowChecklist(params);
  const phase = detectWorkflowPhase({ ...params, patchApplied: checklist.patchApplied, production });
  const analysisSnapshots = {
    audioFileName: params.audioAnalysis?.fileName || base.analysisSnapshots?.audioFileName || null,
    imageFileName: params.imageAnalysis?.fileName || base.analysisSnapshots?.imageFileName || null,
    lastAnalyzedAt:
      params.audioAnalysis || params.imageAnalysis
        ? Date.now()
        : base.analysisSnapshots?.lastAnalyzedAt || null,
  };

  return {
    ...base,
    updatedAt: Date.now(),
    messages: params.messages ?? base.messages,
    lastProposal: params.lastProposal !== undefined ? params.lastProposal : base.lastProposal,
    workflow: { phase, checklist },
    learningProfile: params.learningProfile || base.learningProfile,
    analysisSnapshots,
    production: normalizeProductionState(
      params.production !== undefined ? params.production : base.production,
    ),
  };
}

/**
 * @param {object} raw
 */
export function normalizeAgentSession(raw) {
  if (!raw || typeof raw !== "object") return buildDefaultAgentSession();
  const base = buildDefaultAgentSession();
  return {
    ...base,
    ...raw,
    version: AGENT_SESSION_VERSION,
    workflow: {
      ...base.workflow,
      ...(raw.workflow || {}),
      checklist: { ...base.workflow.checklist, ...(raw.workflow?.checklist || {}) },
    },
    learningProfile: {
      ...createDefaultLearningProfile(),
      ...(raw.learningProfile || {}),
    },
    analysisSnapshots: { ...base.analysisSnapshots, ...(raw.analysisSnapshots || {}) },
    production: normalizeProductionState(raw.production),
    messages: Array.isArray(raw.messages) ? raw.messages.slice(-40) : [],
  };
}

function migrateLegacyChatHistory() {
  if (!hasBrowserStorage()) return null;
  try {
    const legacy = safeLocalStorage.getJSON(VIDEO_PREP_AGENT_STORAGE_KEY, null);
    if (Array.isArray(legacy) && legacy.length) {
      return { ...buildDefaultAgentSession(), messages: legacy };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function hasBrowserStorage() {
  return typeof localStorage !== "undefined";
}

/**
 * Load agent session — Electron userData file or browser localStorage.
 * @returns {Promise<{ session: object, source: string, path?: string }>}
 */
export async function loadAgentSession() {
  if (typeof window !== "undefined") {
    const host = await loadAgentSessionFromHost();
    if (host?.ok && host.session) {
      return {
        session: normalizeAgentSession(host.session),
        source: "userData",
        path: host.path,
      };
    }
  }

  if (!hasBrowserStorage()) {
    return { session: buildDefaultAgentSession(), source: "ssr" };
  }

  const stored = safeLocalStorage.getJSON(VIDEO_PREP_AGENT_SESSION_KEY, null);
  if (stored?.messages) {
    return { session: normalizeAgentSession(stored), source: "localStorage" };
  }

  const legacy = migrateLegacyChatHistory();
  if (legacy) return { session: normalizeAgentSession(legacy), source: "legacy" };

  return { session: buildDefaultAgentSession(), source: "default" };
}

/**
 * @param {object} session
 */
export async function saveAgentSession(session) {
  const payload = normalizeAgentSession({ ...session, updatedAt: Date.now() });

  if (typeof window !== "undefined") {
    const host = await saveAgentSessionToHost(payload);
    if (host?.ok) {
      if (hasBrowserStorage()) safeLocalStorage.setJSON(VIDEO_PREP_AGENT_SESSION_KEY, payload);
      saveVideoPrepAgentHistory(payload.messages);
      return { ok: true, source: "userData", path: host.path };
    }
  }

  if (!hasBrowserStorage()) return { ok: false, reason: "no-storage" };

  const result = safeLocalStorage.setJSON(VIDEO_PREP_AGENT_SESSION_KEY, payload);
  saveVideoPrepAgentHistory(payload.messages);
  return result.ok ? { ok: true, source: "localStorage" } : { ok: false, reason: result.reason };
}

/**
 * Map a next-step item to a runnable workflow suggestion.
 * @param {{ title: string, actionId?: string|null, kind?: string, target?: string, destructive?: boolean }} step
 */
export function nextStepToSuggestion(step) {
  if (!step) return null;
  const base = { id: `next-${step.actionId || step.kind || step.title}`, label: step.title };
  if (step.kind === "attach") return { ...base, kind: "attach" };
  if (step.kind === "focus-input") return { ...base, kind: "focus-input" };
  if (step.kind === "scroll") return { ...base, kind: "scroll", target: step.target || "director-panel" };
  if (step.actionId === "applyAll") {
    return { ...base, kind: "action", actionId: "applyAll", destructive: true };
  }
  if (step.actionId === "patchProject") {
    return { ...base, kind: "action", actionId: "patchProject" };
  }
  if (step.actionId && AGENT_ACTION_IDS.includes(step.actionId)) {
    return { ...base, kind: "action", actionId: step.actionId };
  }
  if (step.actionId === "revealProductionOutput") {
    return { ...base, kind: "action", actionId: "revealProductionOutput" };
  }
  return null;
}

/**
 * @param {object} step
 * @param {object} handlers
 */
export async function runNextStep(step, handlers = {}) {
  const suggestion = nextStepToSuggestion(step);
  if (!suggestion) return { ok: false, message: "No runnable step" };
  if (suggestion.destructive && typeof window !== "undefined") {
    const ok = window.confirm(`${suggestion.label}? This updates project fields.`);
    if (!ok) return { ok: false, message: "Cancelled" };
  }
  return runWorkflowSuggestion(suggestion, handlers);
}

/**
 * @param {object} suggestion
 * @param {object} handlers
 */
export async function runWorkflowSuggestion(suggestion, handlers = {}) {
  if (!suggestion) return { ok: false, message: "No suggestion" };
  switch (suggestion.kind) {
    case "attach":
      handlers.focusAttach?.();
      return { ok: true, message: suggestion.label };
    case "focus-input":
      handlers.focusInput?.();
      return { ok: true, message: suggestion.label };
    case "scroll":
      scrollToPanel(suggestion.target || "director-panel");
      return { ok: true, message: "Scrolled" };
    case "action":
      if (suggestion.actionId === "applyAll") {
        return handlers.applyAll?.() ?? { ok: true };
      }
      if (suggestion.actionId === "patchProject") {
        return handlers.applyProject?.() ?? { ok: true };
      }
      if (suggestion.actionId === "runGpuWorkflow") {
        await handlers.runGpuWorkflow?.();
        return { ok: true };
      }
      if (suggestion.actionId === "applyAudioVisualMusicVideo") {
        await handlers.applyAudioVisualMusicVideo?.("full");
        scrollToDirectorPanelAfterApply();
        return { ok: true };
      }
      if (suggestion.actionId === "applyMusicVideoFromBoth") {
        await handlers.applyMusicVideoFromBoth?.();
        return { ok: true };
      }
      if (suggestion.actionId === "runFullProduction") {
        return handlers.runFullProduction?.() ?? { ok: true };
      }
      if (suggestion.actionId === "checkProductionReadiness") {
        return handlers.checkProductionReadiness?.() ?? { ok: true };
      }
      return { ok: false, message: `Unknown action ${suggestion.actionId}` };
    default:
      return { ok: false, message: "Unsupported suggestion kind" };
  }
}

/**
 * @param {object} params
 */
export function buildVideoPrepContext({
  project = {},
  audioAnalysis = null,
  imageAnalysis = null,
  sunoPasteStyle = "",
  sunoPasteLyrics = "",
  directorSettings = null,
  messages = [],
  lastProposal = null,
  patchApplied = false,
  directorReady = false,
  production = null,
  learningProfile = null,
} = {}) {
  const director = directorSettings || loadDirectorSettingsFromStorage();
  const sunoPaste = {
    style: String(sunoPasteStyle || "").trim(),
    lyrics: String(sunoPasteLyrics || "").trim(),
    hasPaste: Boolean(String(sunoPasteStyle || "").trim() || String(sunoPasteLyrics || "").trim()),
  };

  const workflowReadiness = {};
  for (const id of [1, 2, 3, 4, 5]) {
    workflowReadiness[id] = getMusicVideoWorkflowReadiness(id, {
      audioAnalysis,
      imageAnalysis,
      sunoPasteStyle: sunoPaste.style,
      sunoPasteLyrics: sunoPaste.lyrics,
    });
  }

  const checklist = buildWorkflowChecklist({
    audioAnalysis,
    imageAnalysis,
    sunoPasteStyle: sunoPaste.style,
    sunoPasteLyrics: sunoPaste.lyrics,
    messages,
    lastProposal,
    patchApplied,
    directorReady,
  });
  const workflowPhase = detectWorkflowPhase({
    audioAnalysis,
    imageAnalysis,
    sunoPasteStyle: sunoPaste.style,
    sunoPasteLyrics: sunoPaste.lyrics,
    messages,
    lastProposal,
    patchApplied,
    directorReady,
    production,
  });
  const workflowSuggestions = buildWorkflowSuggestions(
    workflowPhase,
    { checklist, sunoPaste, audioAnalysis, imageAnalysis },
    learningProfile || createDefaultLearningProfile(),
  );
  const workflowIntent = detectWorkflowIntent({
    project,
    audioAnalysis,
    imageAnalysis,
    sunoPasteStyle: sunoPaste.style,
    sunoPasteLyrics: sunoPaste.lyrics,
    messages,
    learningProfile,
  });
  const nextSteps = buildNextSteps({
    workflowIntent,
    phase: workflowPhase,
    checklist,
    context: { workflowPhase, workflowChecklist: checklist, sunoPaste, audioAnalysis, imageAnalysis },
    learningProfile,
    project,
    messages,
  });
  const whatsNext = buildWhatsNextBlock(workflowIntent, workflowPhase, nextSteps);
  const productKnowledge = buildProductKnowledge();

  return {
    project: {
      idea: project.idea || "",
      selectedGenres: project.selectedGenres || [],
      selectedSounds: project.selectedSounds || [],
      selectedRhythms: project.selectedRhythms || [],
      lyricTheme: project.lyricTheme || "",
      lyricMode: project.lyricMode || "",
      promptEngine: project.promptEngine || "Director",
      mood: project.mood || {},
    },
    audioAnalysis: audioAnalysis
      ? {
          fileName: audioAnalysis.fileName,
          duration: audioAnalysis.duration,
          estimatedBpm: audioAnalysis.estimatedBpm,
          estimatedKey: audioAnalysis.estimatedKey,
          moodSuggestion: audioAnalysis.moodSuggestion,
          suggestedGenres: audioAnalysis.suggestedGenres,
          suggestedSounds: audioAnalysis.suggestedSounds,
          suggestedRhythms: audioAnalysis.suggestedRhythms,
          interpretation: audioAnalysis.interpretation,
        }
      : null,
    imageAnalysis: imageAnalysis
      ? {
          fileName: imageAnalysis.fileName,
          visualMood: imageAnalysis.visualMood,
          avgColor: imageAnalysis.avgColor,
          moodSuggestion: imageAnalysis.moodSuggestion,
          suggestedGenres: imageAnalysis.suggestedGenres,
          suggestedSounds: imageAnalysis.suggestedSounds,
          suggestedRhythms: imageAnalysis.suggestedRhythms,
        }
      : null,
    sunoPaste,
    directorSettings: {
      durationSeconds: director.durationSeconds,
      qualityPreset: director.qualityPreset,
      useI2vWhenImage: director.useI2vWhenImage,
      fps: director.fps,
      aspectRatio: director.aspectRatio,
    },
    workflowReadiness,
    workflowPhase,
    workflowChecklist: checklist,
    workflowSuggestions,
    workflowIntent,
    nextSteps,
    whatsNext,
    productKnowledgeSummary: {
      principles: productKnowledge.principles?.slice(0, 3),
      beatSync: productKnowledge.beatSync,
      renderHonesty: productKnowledge.renderHonesty,
    },
    analysisChips: buildAnalysisChips(audioAnalysis, imageAnalysis),
  };
}

/**
 * @param {object} raw — parsed LLM JSON
 */
export function parseAgentResponse(raw) {
  if (!raw || typeof raw !== "object") return null;

  const projectFields = raw.projectPatch && typeof raw.projectPatch === "object" ? raw.projectPatch : raw;
  const patch = buildProjectPatchFromManuscript(projectFields);

  let directorSettingsPatch = null;
  if (raw.directorSettingsPatch && typeof raw.directorSettingsPatch === "object") {
    directorSettingsPatch = { ...raw.directorSettingsPatch };
  }

  const suggestedActions = normalizeSuggestedActions(raw.suggestedActions);
  const workflowIntent = normalizeWorkflowIntent(raw.workflowIntent, raw.recommendedPath);
  const nextSteps = normalizeNextSteps(raw.nextSteps);

  const result = {
    assistantReply:
      raw.assistantReply ||
      raw.directorPromptPreview ||
      "Video prep plan ready — review and apply.",
    directorPromptPreview: raw.directorPromptPreview || patch?.idea || "",
    patch,
    directorSettingsPatch,
    suggestedActions,
    workflowIntent,
    recommendedPath: raw.recommendedPath ?? workflowIntent?.recommendedPath ?? null,
    nextSteps,
    raw,
  };

  return result;
}

/**
 * @param {unknown} actions
 * @returns {Array<{ id: AgentActionId, label?: string, params?: object }>}
 */
export function normalizeSuggestedActions(actions) {
  if (!Array.isArray(actions)) return [];
  const out = [];
  for (const item of actions) {
    if (typeof item === "string" && AGENT_ACTION_IDS.includes(item)) {
      out.push({ id: item });
      continue;
    }
    if (item && typeof item === "object" && AGENT_ACTION_IDS.includes(item.id)) {
      out.push({
        id: item.id,
        label: item.label ? String(item.label) : undefined,
        params: item.params && typeof item.params === "object" ? item.params : undefined,
      });
    }
  }
  return out;
}

/**
 * @param {Array<{ role: string, content: string }>} history
 * @param {string} userText
 * @param {ReturnType<typeof buildVideoPrepContext>} context
 * @param {object} [learningProfile]
 */
export function buildVideoPrepAgentLlmMessages(history, userText, context, learningProfile = null) {
  const ctxJson = JSON.stringify(context, null, 0);
  const knowledge = buildProductKnowledge();
  const knowledgeJson = JSON.stringify(knowledge, null, 0);
  const learningHints = buildLearningHints(learningProfile || context.learningProfile);
  const system = `You are the Video Prep Agent for an AI music-video studio (Cursor-like assistant).
The user chats, uploads audio/images, and you prepare project fields + Director settings without them visiting separate panels.

Product knowledge (local, authoritative):
${knowledgeJson}

${learningHints ? `${learningHints}\n` : ""}
Current workflow phase: ${context.workflowPhase || "start"}. Checklist: ${JSON.stringify(context.workflowChecklist || {})}.
Detected workflow intent: ${JSON.stringify(context.workflowIntent || {})}.
Proactive suggestions for this phase: ${(context.workflowSuggestions || []).map((s) => s.label).join("; ") || "none"}.

Reply with ONLY valid JSON using this schema:
{
  "assistantReply": "2-4 sentence friendly summary — do NOT list next steps here (use nextSteps array)",
  "workflowIntent": "path-1|path-2|path-3|path-4|path-5|beat-sync-mv|instrumental-broll|dialogue-scene",
  "recommendedPath": 1,
  "nextSteps": [
    { "title": "Drop track", "why": "Path A needs analyzed audio for beat sync", "actionId": "applyAudioToMusicVideo", "priority": "primary" },
    { "title": "GPU optimize", "why": "Optional tuning before Director", "actionId": "runGpuWorkflow", "priority": "optional" }
  ],
  "directorPromptPreview": "optional full paragraph prompt",
  "projectPatch": {
    "idea": "one-line concept",
    "selectedGenres": ["1-3 from catalog"],
    "selectedSounds": ["lighting 2-4"],
    "selectedRhythms": ["camera 2-3"],
    "structure": "shot flow with →",
    "lyricTheme": "visual theme",
    "lyricStructure": "beat flow",
    "generatedLyrics": "[Scene] shot list",
    "rules": "constraints",
    "vocal": "one of: ${vocalOptions.join(", ")}",
    "tempo": "10s or full song",
    "lyricMode": "Multi-beat scene | Shot list | Single scene",
    "mood": { "energy": 0-100, "aggression": 0-100, "darkness": 0-100, "emotion": 0-100, "complexity": 0-100, "space": 0-100 },
    "notes": "optional"
  },
  "directorSettingsPatch": {
    "durationSeconds": "match track when audio present",
    "useI2vWhenImage": true,
    "qualityPreset": "DRAFT|STANDARD|PREMIUM optional"
  },
  "suggestedActions": [
    { "id": "patchProject", "label": "Apply project fields" },
    { "id": "applyAudioToMusicVideo", "label": "Map track" },
    { "id": "applyMusicVideoFromBoth", "label": "Track + Suno paste" },
    { "id": "applyAudioVisualMusicVideo", "label": "Audio + image MV", "params": { "durationMode": "full|highlight" } }
  ]
}
Valid action ids: ${AGENT_ACTION_IDS.join(", ")}.
Catalog genres sample: ${genreOptions.slice(0, 12).join(", ")}...
When audioAnalysis is present, align BPM/mood/duration. When imageAnalysis is present, merge visual palette.
When sunoPaste.hasPaste, prefer applyMusicVideoFromBoth if track exists.
Always include nextSteps (2-4 items) ranked primary then optional, tailored to workflowIntent and phase.
Pick suggestedActions the user can run next — do not invent panel names.`;

  return [
    { role: "system", content: system },
    ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    {
      role: "user",
      content: `${userText}\n\n--- workspace context ---\n${ctxJson}\n\nReturn JSON only.`,
    },
  ];
}

/**
 * @param {Array<{ role: string, content: string }>} messages
 * @param {object} settings
 * @param {{ signal?: AbortSignal, timeoutMs?: number }} [options]
 */
export async function sendVideoPrepAgentRequest(messages, settings, options = {}) {
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
    const rawText = String(data?.choices?.[0]?.message?.content || "").trim();
    if (!rawText) throw new Error("Empty LLM response");
    const parsed = extractJsonFromLlmText(rawText);
    const parsedResult = parseAgentResponse(parsed);
    if (!parsedResult?.patch?.idea && !parsedResult?.patch?.selectedGenres?.length) {
      throw new Error("LLM JSON missing video fields");
    }
    return parsedResult;
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error(`Video Prep Agent timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Offline fallback when LLM unavailable.
 * @param {string} text
 * @param {ReturnType<typeof buildVideoPrepContext>} context
 */
export function videoPrepHeuristic(text, context = {}) {
  const base = manuscriptToVideoHeuristic(text);
  const actions = [{ id: "patchProject", label: "Apply project fields" }];

  if (context.audioAnalysis && context.imageAnalysis) {
    actions.push({
      id: "applyAudioVisualMusicVideo",
      label: "Audio + image music video",
      params: { durationMode: "full" },
    });
  } else if (context.audioAnalysis) {
    actions.push({ id: "applyAudioToMusicVideo", label: "Map track to music video" });
  }
  if (context.audioAnalysis && context.sunoPaste?.hasPaste) {
    actions.push({ id: "applyMusicVideoFromBoth", label: "Merge track + Suno paste" });
  } else if (context.sunoPaste?.hasPaste) {
    actions.push({ id: "applySunoPasteToMusicVideo", label: "Apply Suno paste" });
  }

  let directorSettingsPatch = null;
  if (context.audioAnalysis?.duration) {
    directorSettingsPatch = {
      durationSeconds: String(Math.round(context.audioAnalysis.duration)),
      useI2vWhenImage: Boolean(context.imageAnalysis),
    };
  }

  return enrichAgentProposal(
    {
      assistantReply:
        "Parsed locally (enable Co-Producer LLM for full agent). Review suggested actions below.",
      directorPromptPreview: base.idea || "",
      patch: base,
      directorSettingsPatch,
      suggestedActions: actions,
    },
    context,
    text,
  );
}

/**
 * @param {ReturnType<typeof parseAgentResponse>} proposal
 * @param {object} handlers
 * @param {{ runSuggested?: boolean, snapshotLabel?: string }} [opts]
 */
export async function dispatchAgentActions(proposal, handlers, opts = {}) {
  const results = [];
  if (!proposal) return { ok: false, results, message: "No proposal" };

  handlers.captureSnapshot?.(opts.snapshotLabel || "before video prep agent apply");

  if (proposal.patch && Object.keys(proposal.patch).length) {
    handlers.patch?.(proposal.patch);
    results.push({ id: "patchProject", ok: true });
  }

  if (proposal.directorSettingsPatch && handlers.saveDirectorSettings) {
    const merged = {
      ...loadDirectorSettingsFromStorage(),
      ...proposal.directorSettingsPatch,
    };
    handlers.saveDirectorSettings(merged);
    results.push({ id: "saveDirectorSettings", ok: true });
  } else if (proposal.directorSettingsPatch) {
    saveDirectorSettingsToStorage({
      ...loadDirectorSettingsFromStorage(),
      ...proposal.directorSettingsPatch,
    });
    results.push({ id: "saveDirectorSettings", ok: true });
  }

  const actions = opts.runSuggested !== false ? proposal.suggestedActions || [] : [];
  for (const action of actions) {
    if (action.id === "patchProject") continue;
    try {
      switch (action.id) {
        case "applyAudioToMusicVideo":
          await handlers.applyAudioToMusicVideo?.();
          results.push({ id: action.id, ok: true });
          break;
        case "applySunoPasteToMusicVideo":
          handlers.applySunoPasteToMusicVideo?.();
          results.push({ id: action.id, ok: true });
          break;
        case "applyMusicVideoFromBoth":
          await handlers.applyMusicVideoFromBoth?.();
          results.push({ id: action.id, ok: true });
          break;
        case "applyAudioVisualMusicVideo": {
          const mode = action.params?.durationMode === "highlight" ? "highlight" : "full";
          await handlers.applyAudioVisualMusicVideo?.(mode);
          results.push({ id: action.id, ok: true });
          break;
        }
        case "runGpuWorkflow":
          await handlers.runGpuWorkflow?.();
          results.push({ id: action.id, ok: true });
          break;
        case "generateLyrics":
          await handlers.generateLyrics?.(action.params);
          results.push({ id: action.id, ok: true });
          break;
        default:
          break;
      }
    } catch (err) {
      results.push({ id: action.id, ok: false, error: err?.message || String(err) });
    }
  }

  return { ok: true, results };
}

export function loadVideoPrepAgentHistory() {
  if (typeof window === "undefined") return [];
  const stored = safeLocalStorage.getJSON(VIDEO_PREP_AGENT_SESSION_KEY, null);
  if (Array.isArray(stored?.messages)) return stored.messages;
  try {
    const raw = localStorage.getItem(VIDEO_PREP_AGENT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveVideoPrepAgentHistory(messages) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(VIDEO_PREP_AGENT_STORAGE_KEY, JSON.stringify(messages.slice(-40)));
  } catch {
    /* ignore quota */
  }
}
