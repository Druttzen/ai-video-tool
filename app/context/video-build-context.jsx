"use client";

import { createContext, useContext, useMemo, useCallback, useEffect } from "react";
import { useDirectorBuildProgress } from "../hooks/use-director-build-progress";
import { VideoBuildProgressModal } from "../components/video-build-progress-modal";
import { revealDirectorOutput } from "../lib/electron-bridge";
import { PROJECT_RESET_EVENT } from "../lib/project-reset";

const VideoBuildContext = createContext(null);

export const VIDEO_BUILD_START_EVENT = "video-build-start";

const noopBuildApi = {
  progressState: null,
  isBuilding: false,
  canCancelBuild: false,
  startBuildProgress: () => {},
  cancelBuild: async () => ({ ok: false }),
  abortOnError: async () => ({ ok: false }),
  resetBuildProgress: () => {},
  dismissBuildModal: () => {},
  modalOpen: false,
};

export function VideoBuildProvider({ children }) {
  const build = useDirectorBuildProgress();
  const resetBuildProgress = build.resetBuildProgress;

  const handleRevealOutput = useCallback(async () => {
    const target = build.progressState?.outputVideoPath;
    if (!target) return { ok: false, error: "No output video" };
    return revealDirectorOutput(target);
  }, [build.progressState?.outputVideoPath]);

  useEffect(() => {
    const onProjectReset = () => {
      resetBuildProgress();
    };
    window.addEventListener(PROJECT_RESET_EVENT, onProjectReset);
    return () => window.removeEventListener(PROJECT_RESET_EVENT, onProjectReset);
  }, [resetBuildProgress]);

  useEffect(() => {
    const onBuildStart = (event) => {
      const { result, opts } = event?.detail || {};
      if (result) trackLaunchBuildProgress(build.startBuildProgress, result, opts);
    };
    window.addEventListener(VIDEO_BUILD_START_EVENT, onBuildStart);
    return () => window.removeEventListener(VIDEO_BUILD_START_EVENT, onBuildStart);
  }, [build.startBuildProgress]);

  const value = useMemo(
    () => ({
      progressState: build.progressState,
      isBuilding: build.isBuilding,
      canCancelBuild: build.canCancelBuild,
      startBuildProgress: build.startBuildProgress,
      cancelBuild: build.cancelBuild,
      abortOnError: build.abortOnError,
      resetBuildProgress: build.resetBuildProgress,
      dismissBuildModal: build.dismissBuildModal,
      modalOpen: build.modalOpen,
    }),
    [build],
  );

  return (
    <VideoBuildContext.Provider value={value}>
      {children}
      <VideoBuildProgressModal
        open={build.modalOpen}
        title={build.progressState?.title || "Video build"}
        progress={build.progressState?.progress}
        remainingSec={build.progressState?.remainingSec}
        status={build.progressState?.status}
        estimatedLabel={build.progressState?.estimatedLabel}
        message={build.progressState?.message}
        finishAtMs={build.progressState?.finishAtMs}
        outputVideoPath={build.progressState?.outputVideoPath}
        onRevealOutput={build.progressState?.outputVideoPath ? handleRevealOutput : undefined}
        canCancel={build.canCancelBuild}
        cancelBusy={build.cancelBusy}
        abortBusy={build.abortBusy}
        onCancel={build.handleCancelBuild}
        onAbortError={build.handleAbortOnError}
        onClose={build.dismissBuildModal}
      />
    </VideoBuildContext.Provider>
  );
}

export function useVideoBuild() {
  const ctx = useContext(VideoBuildContext);
  return ctx || noopBuildApi;
}

/** Start progress tracking from a Director / Open-Sora launch result. */
export function trackLaunchBuildProgress(startBuildProgress, result, opts = {}) {
  if (!result?.ok) return;

  const estimatedMs =
    result.estimatedMs || (opts.estimatedSeconds ? opts.estimatedSeconds * 1000 : 180000);
  const estimatedLabel = result.estimatedLabel || opts.estimatedLabel || "";
  const title = opts.title || "Video build";

  if (result.logPath) {
    startBuildProgress({
      logPath: result.logPath,
      pid: result.pid,
      startedAt: result.startedAt || Date.now(),
      estimatedMs,
      estimatedLabel,
      message: result.message,
      title,
      simulated: false,
    });
    return;
  }

  startBuildProgress({
    simulated: true,
    startedAt: Date.now(),
    estimatedMs: Math.max(2000, Math.min(8000, estimatedMs / 10)),
    estimatedLabel,
    message: result.message || "Exporting job…",
    title,
  });
}
