"use client";

import { useCallback, useRef, useState } from "react";
import {
  appendSetupInstallLogLine,
  computeSetupInstallProgress,
  formatSetupInstallPhaseLabel,
  subscribeToolInstallProgress,
} from "../lib/setup-install-progress";

const PIPELINE_STEP_BY_PHASE = {
  "audit-scan": 1,
  "audit-scan-done": 1,
  "force-reinstall": 2,
  "update-all": 3,
  "safe-scan": 4,
  "safe-scan-done": 4,
};

const INITIAL_TRACKER = {
  completedAddons: 0,
  totalAddons: 11,
  pipelineStep: 1,
  lastPct: 1,
};

/**
 * Live Setup Hub install/update progress with modal state.
 */
export function useSetupHubInstallProgress() {
  const [state, setState] = useState(null);
  const trackerRef = useRef({ ...INITIAL_TRACKER });

  const resetTracker = useCallback((totalAddons = 11) => {
    trackerRef.current = { ...INITIAL_TRACKER, totalAddons };
  }, []);

  const applyProgressPayload = useCallback((payload) => {
    setState((prev) => {
      if (!prev) return prev;

      const tracker = trackerRef.current;
      if (payload?.phase === "addon-done") {
        tracker.completedAddons = Math.min(tracker.totalAddons, tracker.completedAddons + 1);
      }
      if (payload?.phase && PIPELINE_STEP_BY_PHASE[payload.phase]) {
        tracker.pipelineStep = PIPELINE_STEP_BY_PHASE[payload.phase];
      }

      const pct = computeSetupInstallProgress(payload, tracker);
      tracker.lastPct = pct;

      const lines = appendSetupInstallLogLine(prev.lines, payload?.line || payload?.message || null);
      const terminal = Boolean(payload?.done || payload?.phase === "complete" || payload?.phase === "error");

      return {
        ...prev,
        open: true,
        progress: pct,
        phaseLabel: formatSetupInstallPhaseLabel(payload),
        message: payload?.message || prev.message,
        lines,
        status: terminal ? (payload?.ok === false || payload?.phase === "error" ? "failed" : "complete") : "running",
        summary: terminal ? payload?.message || prev.summary : prev.summary,
        ok: terminal ? Boolean(payload?.ok !== false && payload?.phase !== "error") : prev.ok,
      };
    });
  }, []);

  const runWithProgress = useCallback(
    async (title, installFn, { totalAddons = 11 } = {}) => {
      resetTracker(totalAddons);
      setState({
        open: true,
        title,
        progress: 1,
        phaseLabel: "Starting…",
        message: "Preparing install…",
        lines: [],
        status: "starting",
        summary: "",
        ok: null,
      });

      const unsub = subscribeToolInstallProgress(applyProgressPayload);

      try {
        const result = await installFn();
        setState((prev) => {
          if (!prev) return prev;
          const ok = Boolean(result?.ok);
          const summary =
            result?.postScan?.summary ||
            result?.safe?.summary ||
            result?.error ||
            result?.message ||
            (ok ? "All tools installed successfully." : "Some tools failed to install.");
          return {
            ...prev,
            open: true,
            progress: ok ? 100 : Math.max(prev.progress || 0, 99),
            status: ok ? "complete" : "failed",
            phaseLabel: ok ? "Install complete" : "Install failed",
            summary,
            ok,
          };
        });
        return result;
      } catch (error) {
        const message = error?.message || "Install failed";
        setState((prev) =>
          prev
            ? {
                ...prev,
                open: true,
                progress: Math.max(prev.progress || 0, 99),
                status: "failed",
                phaseLabel: "Install failed",
                summary: message,
                lines: appendSetupInstallLogLine(prev.lines, message),
                ok: false,
              }
            : null,
        );
        return { ok: false, error: message };
      } finally {
        unsub();
      }
    },
    [applyProgressPayload, resetTracker],
  );

  const dismiss = useCallback(() => {
    setState(null);
    trackerRef.current = { ...INITIAL_TRACKER };
  }, []);

  return {
    modalOpen: Boolean(state?.open),
    progressState: state,
    runWithProgress,
    dismissInstallModal: dismiss,
  };
}
