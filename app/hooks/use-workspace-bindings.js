"use client";

import {
  pickProjectActionInput,
  pickWorkspaceContextExtras,
} from "../lib/workspace-bindings-input";
import {
  loadGpuWorkflowSettings,
  runGpuWorkflowPipeline,
} from "../lib/gpu-workflow-functions";
import {
  loadDirectorSettingsFromStorage,
  saveDirectorSettingsToStorage,
} from "../lib/director-settings";
import { useVideoPrepAgent } from "./use-video-prep-agent";
import { useHelpDialog } from "./use-help-dialog";
import { useProjectActions } from "./use-project-actions";
import { useWorkspaceValue } from "./use-workspace-value";

/**
 * Wires project actions + memoized workspace context from shared binding pickers.
 */
export function useWorkspaceBindings({
  projectState,
  analyzers,
  pipeline,
  snapshot,
  avgScore,
  copyToClipboard,
  resetSplash,
  setStatusWithTime,
}) {
  const externals = { avgScore, copyToClipboard, resetSplash, setStatusWithTime };
  const actions = useProjectActions(
    pickProjectActionInput(projectState, analyzers, pipeline, snapshot, externals),
  );

  const runGpuWorkflow = async () => {
    const gpuSettings = loadGpuWorkflowSettings();
    const settings = loadDirectorSettingsFromStorage();
    const result = await runGpuWorkflowPipeline({
      settings,
      gpuSettings,
      hook: "video-prep-agent",
      hasImageRef: Boolean(analyzers.imageAnalysis),
      promptLength: String(projectState.prompt || "").length,
    });
    if (result.settings) saveDirectorSettingsToStorage(result.settings);
    if (result.applied?.length) {
      setStatusWithTime(`GPU: ${result.applied.join(", ")}`, result.ok ? "info" : "warning");
    }
    return result;
  };

  const videoPrepAgent = useVideoPrepAgent({
    coProducerLlmSettings: projectState.coProducerLlmSettings,
    patch: projectState.patch,
    captureSnapshot: snapshot.captureSnapshot,
    setStatusWithTime,
    projectContext: {
      idea: projectState.idea,
      selectedGenres: projectState.selectedGenres,
      selectedSounds: projectState.selectedSounds,
      selectedRhythms: projectState.selectedRhythms,
      lyricTheme: projectState.lyricTheme,
      lyricMode: projectState.lyricMode,
      promptEngine: projectState.promptEngine,
      mood: projectState.mood,
    },
    audioAnalysis: analyzers.audioAnalysis,
    imageAnalysis: analyzers.imageAnalysis,
    sunoPasteStyle: projectState.sunoPasteStyle,
    sunoPasteLyrics: projectState.sunoPasteLyrics,
    analyzeAudioFile: analyzers.analyzeAudioFile,
    analyzeImageFile: analyzers.analyzeImageFile,
    readImageSourceForOpenSora: analyzers.readImageSourceForOpenSora,
    applyAudioToMusicVideo: analyzers.applyAudioToMusicVideo,
    applySunoPasteToMusicVideo: actions.applySunoPasteToMusicVideo,
    applyMusicVideoFromBoth: actions.applyMusicVideoFromBoth,
    applyAudioVisualMusicVideo: analyzers.applyAudioVisualMusicVideo,
    runGpuWorkflow,
    generateLyrics: actions.generateExampleLyrics,
  });

  const help = useHelpDialog();

  return useWorkspaceValue({
    ...actions,
    ...videoPrepAgent,
    ...help,
    ...pickWorkspaceContextExtras(projectState, analyzers, pipeline, snapshot, externals),
    copyToClipboard,
  });
}
