/**
 * Execute recommended build action from analyzer build intent.
 * @param {object} buildIntent
 * @param {object} handlers
 */
export async function executeAnalyzerBuildPlan(buildIntent, handlers = {}) {
  if (!buildIntent?.ok) {
    return { ok: false, message: buildIntent?.reasoning || "Nothing to build yet" };
  }

  const actionId = buildIntent.recommendedActionId;
  const { scrollToPanel } = await import("./music-video-workflows");

  switch (actionId) {
    case "applyAudioVisualMusicVideo":
      await handlers.applyAudioVisualMusicVideo?.(buildIntent.durationMode);
      return { ok: true, message: `Building Path ${buildIntent.workflowPath} music video` };
    case "applyAudioToMusicVideo":
      await handlers.applyAudioToMusicVideo?.();
      return { ok: true, message: "Track mapped to music video" };
    case "applyMusicVideoFromBoth":
      await handlers.applyMusicVideoFromBoth?.();
      return { ok: true, message: "Track + Suno paste merged" };
    case "applySunoPasteToMusicVideo":
      handlers.applySunoPasteToMusicVideo?.();
      return { ok: true, message: "Suno paste mapped to music video" };
    case "applyImageToSunoStyle":
      handlers.applyImageToSunoStyle?.();
      return { ok: true, message: "Image style merged" };
    case "openCanvas": {
      const res = await handlers.openCanvas?.();
      return res?.ok
        ? { ok: true, message: "Canvas opened with build plan" }
        : { ok: false, message: res?.error || "Could not open canvas" };
    }
    case "sendAgentMessage":
      scrollToPanel("manuscript-chat-panel");
      if (buildIntent.userRequest && handlers.setAgentDraft && !handlers.agentDraft?.trim()) {
        handlers.setAgentDraft(buildIntent.userRequest);
      }
      return {
        ok: true,
        message: "Open Manuscript Chat — send your brief to prep video",
      };
    case "patchProject":
    default:
      scrollToPanel("manuscript-chat-panel");
      return { ok: true, message: "Describe your vision in Manuscript Chat" };
  }
}
