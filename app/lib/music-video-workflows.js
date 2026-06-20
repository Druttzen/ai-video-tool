/**
 * Music video quick-start workflows 1–4.
 */
import {
  loadGpuWorkflowSettings,
  runGpuWorkflowPipeline,
} from "./gpu-workflow-functions";
import { loadDirectorSettingsFromStorage, saveDirectorSettingsToStorage } from "./director-settings";

export const MUSIC_VIDEO_WORKFLOWS = [
  {
    id: 1,
    title: "Suno track only",
    badge: "A",
    summary: "Analyze a Suno export or reference track → map sonic DNA to video fields.",
    steps: [
      "Drop audio in Drag & Drop Analyzers",
      "Click Track → video (or A in the studio panel)",
      "Optional: enable GPU Workflow enhancements",
      "Open Director and render",
    ],
    scrollTarget: "analyzers-panel",
    directorAfter: true,
  },
  {
    id: 2,
    title: "Suno paste only",
    badge: "B",
    summary: "Paste finished Suno Style + Lyrics → visual genres, lighting, shot beats.",
    steps: [
      "Paste Style + Lyrics in Suno → Music Video Studio",
      "Click Suno paste → video (B)",
      "Open Director and render",
    ],
    scrollTarget: "music-video-panel",
    directorAfter: true,
  },
  {
    id: 3,
    title: "Full sync (track + paste)",
    badge: "C",
    summary: "Merge analyzed track with Suno fields — beat-sync + bracket structure.",
    steps: [
      "Drop track in Analyzers",
      "Paste Style + Lyrics in the studio panel",
      "Click BOTH (track + paste) → Director",
    ],
    scrollTarget: "music-video-panel",
    directorAfter: true,
  },
  {
    id: 4,
    title: "From scratch (manuscript)",
    badge: "D",
    summary: "Write your own brief — AI turns it into styles, prompts, and shot list.",
    steps: [
      "Open Video Prep Agent (primary path)",
      "Drop audio/image + describe your vision",
      "Send → prep video, then Apply all → Director",
    ],
    scrollTarget: "manuscript-chat-panel",
    directorAfter: true,
  },
  {
    id: 5,
    title: "Audio + picture sync",
    badge: "E",
    summary: "Analyzed track + reference image → beat-sync cuts, lip-sync, full song duration.",
    steps: [
      "Drop audio and image in Analyzers",
      "Click Audio + picture → music video",
      "Open Director — duration matches song length",
    ],
    scrollTarget: "analyzers-panel",
    directorAfter: true,
  },
];

/**
 * @param {number} workflowId 1–5
 * @param {{ audioAnalysis?: object|null, imageAnalysis?: object|null, sunoPasteStyle?: string, sunoPasteLyrics?: string }} ctx
 */
export function getMusicVideoWorkflowReadiness(workflowId, ctx) {
  const hasTrack = Boolean(ctx.audioAnalysis);
  const hasImage = Boolean(ctx.imageAnalysis);
  const hasPaste = Boolean(
    String(ctx.sunoPasteStyle || "").trim() || String(ctx.sunoPasteLyrics || "").trim(),
  );

  switch (workflowId) {
    case 1:
      return {
        ready: hasTrack,
        missing: hasTrack ? [] : ["track"],
        hint: hasTrack ? "Ready — run Path 1" : "Drop a track in Analyzers first",
      };
    case 2:
      return {
        ready: hasPaste,
        missing: hasPaste ? [] : ["paste"],
        hint: hasPaste ? "Ready — run Path 2" : "Paste Suno Style and/or Lyrics first",
      };
    case 3:
      return {
        ready: hasTrack && hasPaste,
        missing: [!hasTrack && "track", !hasPaste && "paste"].filter(Boolean),
        hint:
          hasTrack && hasPaste
            ? "Ready — run Path 3"
            : !hasTrack && !hasPaste
              ? "Need track + Suno paste"
              : !hasTrack
                ? "Drop track in Analyzers"
                : "Paste Suno Style/Lyrics in studio panel",
      };
    case 4:
      return { ready: true, missing: [], hint: "Write your manuscript — LLM optional" };
    case 5:
      return {
        ready: hasTrack && hasImage,
        missing: [!hasTrack && "track", !hasImage && "image"].filter(Boolean),
        hint:
          hasTrack && hasImage
            ? "Ready — run Path 5"
            : !hasTrack && !hasImage
              ? "Need analyzed audio + image"
              : !hasTrack
                ? "Drop audio in Analyzers"
                : "Drop reference image in Analyzers",
      };
    default:
      return { ready: false, missing: ["unknown"], hint: "Unknown workflow" };
  }
}

/** @param {string} testId */
export function scrollToPanel(testId) {
  if (typeof document === "undefined") return;
  document.querySelector(`[data-testid="${testId}"]`)?.scrollIntoView({
    behavior: "instant",
    block: "start",
  });
}

/** Scroll to Director after a music-video path applies project fields. */
export function scrollToDirectorPanelAfterApply() {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => scrollToPanel("director-panel"));
}

/**
 * @param {number} workflowId
 * @param {Record<string, Function>} actions — workspace handlers
 */
export async function runMusicVideoWorkflow(workflowId, actions) {
  const ctx = {
    audioAnalysis: actions.audioAnalysis,
    imageAnalysis: actions.imageAnalysis,
    sunoPasteStyle: actions.sunoPasteStyle,
    sunoPasteLyrics: actions.sunoPasteLyrics,
  };
  const wf = MUSIC_VIDEO_WORKFLOWS.find((w) => w.id === workflowId);
  if (!wf) return { ok: false, message: "Unknown workflow" };

  const { ready, hint } = getMusicVideoWorkflowReadiness(workflowId, ctx);

  actions.setPromptEngine("Director");

  if (workflowId === 1) {
    if (!ready) {
      scrollToPanel("analyzers-panel");
      return { ok: false, message: hint };
    }
    actions.captureSnapshot("before workflow 1");
    await actions.applyAudioToMusicVideo();
    await maybeRunGpuWorkflow(actions, { hasImageRef: Boolean(actions.hasImageRef) });
    if (wf.directorAfter) scrollToPanel("director-panel");
    return { ok: true, message: "Path 1 applied — track mapped to music video" };
  }

  if (workflowId === 2) {
    if (!ready) {
      scrollToPanel("music-video-panel");
      return { ok: false, message: hint };
    }
    actions.captureSnapshot("before workflow 2");
    actions.applySunoPasteToMusicVideo();
    await maybeRunGpuWorkflow(actions, { hasImageRef: Boolean(actions.hasImageRef) });
    if (wf.directorAfter) scrollToPanel("director-panel");
    return { ok: true, message: "Path 2 applied — Suno paste mapped to music video" };
  }

  if (workflowId === 3) {
    if (!ready) {
      scrollToPanel(wf.scrollTarget);
      if (!ctx.audioAnalysis) scrollToPanel("analyzers-panel");
      return { ok: false, message: hint };
    }
    actions.captureSnapshot("before workflow 3");
    await actions.applyMusicVideoFromBoth();
    await maybeRunGpuWorkflow(actions, { hasImageRef: Boolean(actions.hasImageRef) });
    if (wf.directorAfter) scrollToPanel("director-panel");
    return { ok: true, message: "Path 3 applied — track + Suno paste merged" };
  }

  if (workflowId === 4) {
    if (actions.manuscriptProposal?.patch) {
      actions.captureSnapshot?.("before workflow 4");
      actions.applyManuscriptToProject?.();
      await maybeRunGpuWorkflow(actions, { hasImageRef: Boolean(actions.hasImageRef) });
      scrollToDirectorPanelAfterApply();
      return { ok: true, message: "Path 4 applied — manuscript merged into project" };
    }
    scrollToPanel("manuscript-chat-panel");
    await maybeRunGpuWorkflow(actions, { hasImageRef: Boolean(actions.hasImageRef) });
    return { ok: true, message: "Path 4 — write your manuscript below (Ctrl+Enter to send)" };
  }

  if (workflowId === 5) {
    if (!ready) {
      scrollToPanel("analyzers-panel");
      return { ok: false, message: hint };
    }
    actions.captureSnapshot("before workflow 5");
    await actions.applyAudioVisualMusicVideo?.(actions.pathEDurationMode);
    await maybeRunGpuWorkflow(actions, { hasImageRef: Boolean(actions.hasImageRef) });
    if (wf.directorAfter) scrollToPanel("director-panel");
    return { ok: true, message: "Path 5 applied — audio + picture beat-sync music video" };
  }

  return { ok: false, message: "Unknown workflow" };
}

async function maybeRunGpuWorkflow(actions, ctx = {}) {
  const gpuSettings = loadGpuWorkflowSettings();
  if (gpuSettings.autoRunOnWorkflow === false) return null;

  const settings = loadDirectorSettingsFromStorage();
  const result = await runGpuWorkflowPipeline({
    settings,
    gpuSettings,
    hook: "workflow",
    hasImageRef: ctx.hasImageRef,
    promptLength: actions.promptLength || 0,
  });

  if (result.settings) saveDirectorSettingsToStorage(result.settings);

  if (result.applied?.length) {
    actions.setStatusWithTime?.(
      `GPU: ${result.applied.join(", ")}`,
      result.ok ? "info" : "warning",
    );
  }

  return result;
}
