"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { computeFinishAtMs } from "../lib/build-progress-format";
import { cancelDirectorBuild, getDirectorBuildStatus, isElectronApp } from "../lib/electron-bridge";

const ACTIVE_STATUSES = new Set(["running", "starting", "cancelling"]);
const TERMINAL_STATUSES = new Set(["complete", "failed", "cancelled"]);

function enrichState(partial, build) {
  const remainingSec = partial.remainingSec ?? 0;
  return {
    ...partial,
    title: partial.title || build?.title || "Video build",
    estimatedLabel: partial.estimatedLabel ?? build?.estimatedLabel,
    finishAtMs: computeFinishAtMs(remainingSec),
  };
}

/**
 * Track build progress — polls Electron log/pid or simulates for export-only.
 */
export function useDirectorBuildProgress() {
  const [state, setState] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [abortBusy, setAbortBusy] = useState(false);
  const timerRef = useRef(null);
  const buildRef = useRef(null);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const applyState = useCallback((partial) => {
    setState((prev) => enrichState({ ...prev, ...partial }, buildRef.current));
  }, []);

  const tickSimulated = useCallback(
    (build) => {
      if (build.cancelled) {
        applyState({
          progress: build.progressAtCancel ?? 0,
          remainingSec: 0,
          status: "cancelled",
          message: "Export cancelled",
        });
        stop();
        return;
      }

      const elapsed = Date.now() - build.startedAt;
      const progress = Math.min(100, (elapsed / build.estimatedMs) * 100);
      const remainingSec = Math.max(0, Math.ceil((build.estimatedMs - elapsed) / 1000));
      const status = progress >= 100 ? "complete" : "running";
      applyState({
        progress,
        remainingSec,
        status,
        message: build.message || "Exporting job…",
      });
      if (status === "complete") stop();
    },
    [applyState, stop],
  );

  const tickNative = useCallback(
    async (build) => {
      if (build.cancelled) return;
      try {
        const res = await getDirectorBuildStatus({
          logPath: build.logPath,
          pid: build.pid,
          startedAt: build.startedAt,
          estimatedMs: build.estimatedMs,
        });
        if (!res?.ok) return;
        applyState({
          progress: res.progress,
          remainingSec: res.remainingSec,
          status: res.status,
          message: res.message,
        });
        if (res.status === "complete" || res.status === "failed" || res.status === "cancelled") {
          stop();
        }
      } catch {
        /* keep polling */
      }
    },
    [applyState, stop],
  );

  const start = useCallback(
    (build) => {
      stop();
      buildRef.current = { ...build, cancelled: false };
      const initialRemaining = Math.ceil((build.estimatedMs || 60000) / 1000);
      setState(
        enrichState(
          {
            progress: 1,
            remainingSec: initialRemaining,
            status: "starting",
            message: build.message || "Starting build…",
            estimatedLabel: build.estimatedLabel,
            title: build.title || "Video build",
          },
          build,
        ),
      );
      setModalOpen(true);

      const onTick = () => {
        const current = buildRef.current;
        if (!current) return;
        if (current.simulated) tickSimulated(current);
        else tickNative(current);
      };

      onTick();
      timerRef.current = setInterval(onTick, 500);
    },
    [stop, tickSimulated, tickNative],
  );

  const killActiveBuild = useCallback(async (build, message) => {
    if (build.simulated) {
      buildRef.current = null;
      applyState({
        progress: build.progressAtCancel ?? 0,
        remainingSec: 0,
        status: "cancelled",
        message: message || "Build stopped",
      });
      return { ok: true, message: message || "Build stopped" };
    }

    if (isElectronApp()) {
      return cancelDirectorBuild({ logPath: build.logPath, pid: build.pid });
    }

    return { ok: true, message: message || "Build stopped" };
  }, [applyState]);

  const cancelBuild = useCallback(async () => {
    const build = buildRef.current;
    if (!build || build.cancelled) return { ok: false, error: "No active build" };

    build.cancelled = true;
    build.progressAtCancel = state?.progress ?? 0;
    applyState({
      progress: build.progressAtCancel,
      remainingSec: 0,
      status: "cancelling",
      message: "Cancelling…",
    });
    stop();

    const res = await killActiveBuild(build, "Build cancelled");
    applyState({
      progress: build.progressAtCancel,
      remainingSec: 0,
      status: res.ok ? "cancelled" : "failed",
      message: res.ok ? "Build cancelled" : res.error || "Cancel failed",
    });
    buildRef.current = null;
    return res;
  }, [applyState, killActiveBuild, state?.progress, stop]);

  const abortOnError = useCallback(async () => {
    const build = buildRef.current;
    if (!build) {
      applyState({
        remainingSec: 0,
        status: "failed",
        message: state?.message || "Build aborted",
      });
      return { ok: true, message: "Build aborted" };
    }

    build.cancelled = true;
    build.progressAtCancel = state?.progress ?? build.progressAtCancel ?? 0;
    stop();

    const res = await killActiveBuild(build, "Build aborted after error");
    applyState({
      progress: build.progressAtCancel,
      remainingSec: 0,
      status: "failed",
      message: res.ok ? "Build aborted — process stopped" : res.error || "Abort failed",
    });
    buildRef.current = null;
    return res;
  }, [applyState, killActiveBuild, state?.message, state?.progress, stop]);

  const handleCancelBuild = useCallback(async () => {
    if (cancelBusy) return;
    setCancelBusy(true);
    try {
      await cancelBuild();
    } finally {
      setCancelBusy(false);
    }
  }, [cancelBuild, cancelBusy]);

  const handleAbortOnError = useCallback(async () => {
    if (abortBusy) return;
    setAbortBusy(true);
    try {
      await abortOnError();
    } finally {
      setAbortBusy(false);
    }
  }, [abortBusy, abortOnError]);

  const dismissBuildModal = useCallback(() => {
    if (state && ACTIVE_STATUSES.has(state.status)) return;
    setModalOpen(false);
    if (state && TERMINAL_STATUSES.has(state.status)) {
      stop();
      buildRef.current = null;
      setState(null);
    }
  }, [state, stop]);

  const reset = useCallback(() => {
    stop();
    buildRef.current = null;
    setState(null);
    setModalOpen(false);
    setCancelBusy(false);
    setAbortBusy(false);
  }, [stop]);

  useEffect(() => () => stop(), [stop]);

  const isActive = state && ACTIVE_STATUSES.has(state.status);

  return {
    progressState: state,
    isBuilding: isActive,
    modalOpen: modalOpen && Boolean(state),
    canCancelBuild: Boolean(state && (isActive || state.status === "cancelling")),
    cancelBusy,
    abortBusy,
    startBuildProgress: start,
    cancelBuild,
    abortOnError,
    handleCancelBuild,
    handleAbortOnError,
    dismissBuildModal,
    resetBuildProgress: reset,
    canTrackNative: isElectronApp(),
  };
}
