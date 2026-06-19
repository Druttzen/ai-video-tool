"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cancelDirectorBuild, getDirectorBuildStatus, isElectronApp } from "../lib/electron-bridge";

const ACTIVE_STATUSES = new Set(["running", "starting", "cancelling"]);

/**
 * Track build progress — polls Electron log/pid or simulates for export-only.
 */
export function useDirectorBuildProgress() {
  const [state, setState] = useState(null);
  const timerRef = useRef(null);
  const buildRef = useRef(null);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const tickSimulated = useCallback(
    (build) => {
      if (build.cancelled) {
        setState({
          progress: build.progressAtCancel ?? state?.progress ?? 0,
          remainingSec: 0,
          status: "cancelled",
          message: "Export cancelled",
          estimatedLabel: build.estimatedLabel,
        });
        stop();
        return;
      }

      const elapsed = Date.now() - build.startedAt;
      const progress = Math.min(100, (elapsed / build.estimatedMs) * 100);
      const remainingSec = Math.max(0, Math.ceil((build.estimatedMs - elapsed) / 1000));
      const status = progress >= 100 ? "complete" : "running";
      setState({
        progress,
        remainingSec,
        status,
        message: build.message || "Exporting job…",
        estimatedLabel: build.estimatedLabel,
      });
      if (status === "complete") stop();
    },
    [state?.progress, stop],
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
        setState({
          progress: res.progress,
          remainingSec: res.remainingSec,
          status: res.status,
          message: res.message,
          estimatedLabel: build.estimatedLabel,
        });
        if (res.status === "complete" || res.status === "failed" || res.status === "cancelled") {
          stop();
        }
      } catch {
        /* keep polling */
      }
    },
    [stop],
  );

  const start = useCallback(
    (build) => {
      stop();
      buildRef.current = { ...build, cancelled: false };
      setState({
        progress: 1,
        remainingSec: Math.ceil((build.estimatedMs || 60000) / 1000),
        status: "starting",
        message: build.message || "Starting build…",
        estimatedLabel: build.estimatedLabel,
      });

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

  const cancelBuild = useCallback(async () => {
    const build = buildRef.current;
    if (!build || build.cancelled) return { ok: false, error: "No active build" };

    build.cancelled = true;
    build.progressAtCancel = state?.progress ?? buildRef.current?.progressAtCancel ?? 0;
    setState((prev) => ({
      progress: prev?.progress ?? 0,
      remainingSec: 0,
      status: "cancelling",
      message: "Cancelling…",
      estimatedLabel: prev?.estimatedLabel || build.estimatedLabel,
    }));
    stop();

    if (build.simulated) {
      setState({
        progress: build.progressAtCancel,
        remainingSec: 0,
        status: "cancelled",
        message: "Export cancelled",
        estimatedLabel: build.estimatedLabel,
      });
      buildRef.current = null;
      return { ok: true, message: "Export cancelled" };
    }

    if (isElectronApp()) {
      const res = await cancelDirectorBuild({ logPath: build.logPath, pid: build.pid });
      setState({
        progress: build.progressAtCancel,
        remainingSec: 0,
        status: res.ok ? "cancelled" : "failed",
        message: res.ok ? "Build cancelled" : res.error || "Cancel failed",
        estimatedLabel: build.estimatedLabel,
      });
      buildRef.current = null;
      return res;
    }

    setState({
      progress: build.progressAtCancel,
      remainingSec: 0,
      status: "cancelled",
      message: "Build cancelled",
      estimatedLabel: build.estimatedLabel,
    });
    buildRef.current = null;
    return { ok: true, message: "Build cancelled" };
  }, [state?.progress, stop]);

  const reset = useCallback(() => {
    stop();
    buildRef.current = null;
    setState(null);
  }, [stop]);

  useEffect(() => () => stop(), [stop]);

  const isActive = state && ACTIVE_STATUSES.has(state.status);

  return {
    progressState: state,
    isBuilding: isActive,
    canCancelBuild: Boolean(state && (isActive || state.status === "cancelling")),
    startBuildProgress: start,
    cancelBuild,
    resetBuildProgress: reset,
    canTrackNative: isElectronApp(),
  };
}
