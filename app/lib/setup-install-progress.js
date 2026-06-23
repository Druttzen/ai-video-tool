import { isElectronApp } from "./electron-bridge";

export const SETUP_INSTALL_PROGRESS_EVENT = "setup:tool-install-progress";

const PIPELINE_PHASES = new Set([
  "audit-scan",
  "audit-scan-done",
  "force-reinstall",
  "update-all",
  "safe-scan",
  "safe-scan-done",
]);

/** @param {(payload: object) => void} callback */
export function subscribeToolInstallProgress(callback) {
  if (!isElectronApp() || typeof callback !== "function" || !window.electronAPI?.onToolInstallProgress) {
    return () => {};
  }
  return window.electronAPI.onToolInstallProgress(callback);
}

/** @param {object|null|undefined} payload */
export function formatSetupInstallPhaseLabel(payload) {
  if (!payload) return "Preparing…";
  if (payload.phase === "complete") return payload.ok ? "Install complete" : "Install failed";
  if (payload.phase === "error") return "Install error";
  if (payload.phase === "addon-start") {
    return payload.forceReinstall
      ? `Installing ${payload.label || payload.addonId}…`
      : `Updating ${payload.label || payload.addonId}…`;
  }
  if (PIPELINE_PHASES.has(payload.phase)) return payload.message || payload.phase;
  if (payload.message) return payload.message;
  if (payload.phase) return String(payload.phase).replace(/-/g, " ");
  return "Working…";
}

/**
 * Estimate progress percent from streamed install payloads.
 * @param {{ phase?: string, addonId?: string, done?: boolean, ok?: boolean }} payload
 * @param {{ completedAddons: number, totalAddons: number, pipelineStep: number }} state
 */
export function computeSetupInstallProgress(payload, state) {
  const totalAddons = Math.max(1, state.totalAddons || 1);
  const pipelineWeight = 0.15;
  const addonWeight = 1 - pipelineWeight;

  if (payload?.done || payload?.phase === "complete") {
    return payload?.ok === false ? Math.min(99, state.lastPct || 0) : 100;
  }

  if (PIPELINE_PHASES.has(payload?.phase)) {
    const step = Math.min(4, Math.max(1, state.pipelineStep || 1));
    const pct = Math.round(((step - 1) / 4) * pipelineWeight * 100);
    return Math.max(state.lastPct || 0, pct);
  }

  if (payload?.phase === "addon-done") {
    const completed = Math.min(totalAddons, (state.completedAddons || 0) + 1);
    const pct = Math.round(pipelineWeight * 100 + (completed / totalAddons) * addonWeight * 100);
    return Math.min(99, Math.max(state.lastPct || 0, pct));
  }

  if (payload?.phase === "addon-start") {
    const completed = state.completedAddons || 0;
    const pct = Math.round(pipelineWeight * 100 + (completed / totalAddons) * addonWeight * 100);
    return Math.min(99, Math.max(state.lastPct || 0, pct));
  }

  return state.lastPct || 1;
}

/** @param {string[]} lines */
export function appendSetupInstallLogLine(lines, line, maxLines = 250) {
  if (!line) return lines;
  const next = [...lines, line];
  if (next.length > maxLines) next.splice(0, next.length - maxLines);
  return next;
}
