"use client";

import {
  pickProjectActionInput,
  pickWorkspaceContextExtras,
} from "../lib/workspace-bindings-input";
import { useManuscriptChat } from "./use-manuscript-chat";
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

  const manuscript = useManuscriptChat({
    coProducerLlmSettings: projectState.coProducerLlmSettings,
    patch: projectState.patch,
    captureSnapshot: snapshot.captureSnapshot,
    setStatusWithTime,
    projectContext: {
      idea: projectState.idea,
      selectedGenres: projectState.selectedGenres,
      lyricTheme: projectState.lyricTheme,
    },
  });

  const help = useHelpDialog();

  return useWorkspaceValue({
    ...actions,
    ...manuscript,
    ...help,
    ...pickWorkspaceContextExtras(projectState, analyzers, pipeline, snapshot, externals),
    copyToClipboard,
  });
}
