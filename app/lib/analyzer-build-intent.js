/**
 * Synthesize what to build (music video vs canvas vs Director) from analyzers + user request.
 */
import { MV_DURATION_MODES, hasVocalsLikely, resolveMusicVideoDurationSec } from "./audio-visual-music-video";

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

/**
 * Pick the best available user brief from chat, draft, or project idea.
 * @param {object} [ctx]
 */
export function resolveAnalyzerUserRequest(ctx = {}) {
  const direct = normalizeText(ctx.userRequest);
  if (direct) return direct;

  const draft = normalizeText(ctx.agentDraft || ctx.manuscriptDraft);
  if (draft) return draft;

  const messages = Array.isArray(ctx.agentMessages) ? ctx.agentMessages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const row = messages[i];
    if (row?.role === "user" && normalizeText(row.content)) {
      return normalizeText(row.content);
    }
  }

  const idea = normalizeText(ctx.idea);
  if (idea) return idea;

  return "";
}

function mergeGenres(audioAnalysis, imageAnalysis) {
  const genres = [
    ...(audioAnalysis?.suggestedGenres || []),
    ...(imageAnalysis?.suggestedGenres || []),
  ];
  return [...new Set(genres.map((g) => String(g).trim()).filter(Boolean))].slice(0, 4);
}

function synthesizeConcept(request, audioAnalysis, imageAnalysis) {
  const parts = [];
  if (request) parts.push(request);
  else if (audioAnalysis?.trackSummary) parts.push(audioAnalysis.trackSummary.split(".")[0]);
  else if (imageAnalysis?.visualMood) parts.push(`Visual: ${imageAnalysis.visualMood}`);

  if (audioAnalysis && imageAnalysis) {
    const genres = mergeGenres(audioAnalysis, imageAnalysis);
    if (genres.length) parts.push(`Blend ${genres.slice(0, 2).join(" + ")}`);
  }

  const concept = parts.join(" — ").trim();
  return concept.slice(0, 320) || "Untitled production";
}

function buildDirectorBrief({ concept, audioAnalysis, imageAnalysis, lipSync, durationMode, clipCount }) {
  const lines = [concept];
  if (audioAnalysis) {
    const dur = resolveMusicVideoDurationSec(audioAnalysis, durationMode);
    lines.push(
      `Audio: ${audioAnalysis.estimatedBpm || audioAnalysis.bpm || "—"} · ${dur}s ${durationMode === MV_DURATION_MODES.HIGHLIGHT ? "highlight" : "full track"}`,
    );
    if (clipCount >= 2) lines.push(`Beat-sync plan: ${clipCount} segments`);
  }
  if (imageAnalysis) {
    lines.push(`Reference look: ${imageAnalysis.visualMood} (${imageAnalysis.avgColor})`);
  }
  lines.push(lipSync ? "Lip-sync on vocal phrases" : "Music-driven visuals, no lip-sync");
  return lines.join("\n");
}

function buildCanvasSummary({ buildTarget, workflowPath, clipCount, concept, request }) {
  if (buildTarget === "canvas") {
    return `Open Canvas to inspect ${clipCount >= 2 ? `${clipCount} beat-sync segments` : "analyzer snapshot"} for: ${concept}`;
  }
  if (request) {
    return `Canvas snapshot for brief: ${request.slice(0, 120)}${request.length > 120 ? "…" : ""}`;
  }
  return `Canvas overview — Path ${workflowPath} planning`;
}

/**
 * @param {object} params
 * @param {object|null} [params.audioAnalysis]
 * @param {object|null} [params.imageAnalysis]
 * @param {string} [params.userRequest]
 * @param {string} [params.idea]
 * @param {string} [params.agentDraft]
 * @param {string} [params.manuscriptDraft]
 * @param {Array<{role:string,content:string}>} [params.agentMessages]
 * @param {string} [params.sunoPasteStyle]
 * @param {string} [params.sunoPasteLyrics]
 */
export function determineBuildFromAnalyzersAndRequest(params = {}) {
  const {
    audioAnalysis = null,
    imageAnalysis = null,
    sunoPasteStyle = "",
    sunoPasteLyrics = "",
  } = params;

  const request = resolveAnalyzerUserRequest(params);
  const lower = request.toLowerCase();
  const hasAudio = Boolean(audioAnalysis);
  const hasImage = Boolean(imageAnalysis);
  const hasPaste = Boolean(normalizeText(sunoPasteStyle) || normalizeText(sunoPasteLyrics));
  const clipPlan = audioAnalysis?.beatSync?.clipPlan || [];
  const clipCount = clipPlan.length;

  const wantsCanvas = /\b(canvas|dashboard|inspect|snapshot|timeline|overview)\b/i.test(lower);
  const wantsHighlight = /\b(highlight|chorus|hook|drop|best part|verse)\b/i.test(lower);
  const wantsInstrumental = /\b(instrumental|b-?roll|no lip|without vocal)\b/i.test(lower);
  const wantsLipSync = /\b(lip.?sync|singing|vocal performance|mouth sync)\b/i.test(lower);
  const wantsProduce = /\b(produce|render|full mv|music video|beat.?sync)\b/i.test(lower);

  const durationMode = wantsHighlight ? MV_DURATION_MODES.HIGHLIGHT : MV_DURATION_MODES.FULL;
  const lipSync = wantsLipSync || (hasVocalsLikely(audioAnalysis) && !wantsInstrumental);

  let buildTarget = "director-prompt";
  let workflowPath = 4;
  let workflowIntent = "manuscript-scene";
  let recommendedActionId = "patchProject";
  const nextSteps = [];

  if (!hasAudio && !hasImage && !request && !hasPaste) {
    return {
      ok: false,
      buildTarget: "none",
      workflowPath: 0,
      workflowIntent: "needs-input",
      recommendedActionId: null,
      durationMode,
      multiClip: false,
      clipCount: 0,
      lipSync: false,
      title: "Add inputs",
      concept: "",
      directorBrief: "",
      canvasSummary: "",
      canvasIntent: "project-only",
      userRequest: "",
      reasoning: "Drop audio and/or image, or describe your vision in Manuscript Chat.",
      nextSteps: [
        { label: "Drop audio in Analyzers", actionId: "scroll:analyzers-panel" },
        { label: "Write brief in Manuscript Chat", actionId: "scroll:manuscript-chat-panel" },
      ],
    };
  }

  if (wantsCanvas && (hasAudio || hasImage)) {
    buildTarget = "canvas";
    workflowPath = hasAudio && hasImage ? 5 : hasAudio ? 1 : 4;
    workflowIntent = clipCount >= 2 ? "music-video-path-e" : "project-inspect";
    recommendedActionId = "openCanvas";
    nextSteps.push({ label: "Open Project Canvas", actionId: "openCanvas", priority: "primary" });
  } else if (hasAudio && hasImage) {
    buildTarget = "music-video";
    workflowPath = 5;
    workflowIntent = "beat-sync-mv";
    recommendedActionId = "applyAudioVisualMusicVideo";
    nextSteps.push({
      label: "Build audio + picture MV (Path E)",
      actionId: "applyAudioVisualMusicVideo",
      priority: "primary",
      params: { durationMode },
    });
    nextSteps.push({ label: "Preview in Canvas", actionId: "openCanvas", priority: "optional" });
  } else if (hasAudio && hasPaste) {
    buildTarget = "music-video";
    workflowPath = 3;
    workflowIntent = "full-sync-mv";
    recommendedActionId = "applyMusicVideoFromBoth";
    nextSteps.push({ label: "Merge track + Suno paste (Path C)", actionId: "applyMusicVideoFromBoth", priority: "primary" });
  } else if (hasAudio) {
    buildTarget = wantsProduce || clipCount >= 2 ? "music-video" : "director-prompt";
    workflowPath = 1;
    workflowIntent = clipCount >= 2 ? "beat-sync-mv" : "track-mv";
    recommendedActionId = "applyAudioToMusicVideo";
    nextSteps.push({ label: "Map track to music video (Path A)", actionId: "applyAudioToMusicVideo", priority: "primary" });
  } else if (hasPaste) {
    buildTarget = "music-video";
    workflowPath = 2;
    workflowIntent = "suno-paste-mv";
    recommendedActionId = "applySunoPasteToMusicVideo";
    nextSteps.push({ label: "Suno paste → video (Path B)", actionId: "applySunoPasteToMusicVideo", priority: "primary" });
  } else if (hasImage && request) {
    buildTarget = "director-prompt";
    workflowPath = 4;
    workflowIntent = "image-led-scene";
    recommendedActionId = "applyImageToSunoStyle";
    nextSteps.push({ label: "Merge image style", actionId: "applyImageToSunoStyle", priority: "primary" });
  } else if (request) {
    workflowPath = 4;
    workflowIntent = "manuscript-scene";
    recommendedActionId = "sendAgentMessage";
    nextSteps.push({ label: "Send brief to Video Prep Agent", actionId: "sendAgentMessage", priority: "primary" });
  }

  if (wantsProduce && recommendedActionId !== "applyAudioVisualMusicVideo" && hasAudio && hasImage) {
    recommendedActionId = "applyAudioVisualMusicVideo";
  }

  const concept = synthesizeConcept(request, audioAnalysis, imageAnalysis);
  const multiClip = buildTarget === "music-video" && clipCount >= 2;

  const reasoningParts = [];
  if (request) reasoningParts.push(`Brief: “${request.slice(0, 100)}${request.length > 100 ? "…" : ""}”`);
  if (hasAudio) {
    reasoningParts.push(
      `Track ${audioAnalysis.fileName || "audio"} (${Number(audioAnalysis.duration) || 0}s)`,
    );
  }
  if (hasImage) {
    reasoningParts.push(`Image ${imageAnalysis.fileName || "image"} (${imageAnalysis.visualMood || "mood"})`);
  }
  if (clipCount >= 2) reasoningParts.push(`${clipCount} beat-sync segments`);
  reasoningParts.push(`→ ${buildTarget === "canvas" ? "Canvas dashboard" : buildTarget === "music-video" ? `Path ${workflowPath} music video` : "Director prompt prep"}`);

  return {
    ok: true,
    buildTarget,
    workflowPath,
    workflowIntent,
    recommendedActionId,
    durationMode,
    multiClip,
    clipCount,
    lipSync,
    title: concept.slice(0, 72),
    concept,
    directorBrief: buildDirectorBrief({
      concept,
      audioAnalysis,
      imageAnalysis,
      lipSync,
      durationMode,
      clipCount,
    }),
    canvasSummary: buildCanvasSummary({ buildTarget, workflowPath, clipCount, concept, request }),
    canvasIntent: clipCount >= 2 && hasAudio ? "music-video-path-e" : hasAudio || hasImage ? "project-handoff" : "project-only",
    userRequest: request,
    reasoning: reasoningParts.join(" · "),
    nextSteps,
  };
}

/**
 * @param {object} buildIntent
 * @param {object|null} audioAnalysis
 * @param {object|null} imageAnalysis
 */
export function slimBuildIntent(buildIntent) {
  if (!buildIntent?.ok) return null;
  return {
    buildTarget: buildIntent.buildTarget,
    workflowPath: buildIntent.workflowPath,
    workflowIntent: buildIntent.workflowIntent,
    recommendedActionId: buildIntent.recommendedActionId,
    durationMode: buildIntent.durationMode,
    multiClip: buildIntent.multiClip,
    clipCount: buildIntent.clipCount,
    lipSync: buildIntent.lipSync,
    title: buildIntent.title,
    concept: buildIntent.concept,
    directorBrief: buildIntent.directorBrief,
    canvasSummary: buildIntent.canvasSummary,
    canvasIntent: buildIntent.canvasIntent,
    reasoning: buildIntent.reasoning,
    userRequest: buildIntent.userRequest,
  };
}
