"use client";

/**
 * Safe renderer bridge — no-op in the browser, wired in Electron via preload.js.
 */

/** @returns {boolean} */
export function isElectronApp() {
  return typeof window !== "undefined" && !!window.electronAPI;
}

/** @returns {Promise<{ ok: boolean, version?: string|null, error?: string }>} */
export async function checkForAppUpdates() {
  if (!isElectronApp()) {
    return { ok: false, error: "Updates are only available in the desktop app" };
  }
  return window.electronAPI.checkForUpdates();
}

/** @returns {Promise<void>} */
export async function quitAndInstallUpdate() {
  if (!isElectronApp()) return;
  await window.electronAPI.quitAndInstall();
}

/**
 * @param {(payload: { status?: string, message?: string }) => void} callback
 * @returns {() => void}
 */
export function subscribeToUpdateStatus(callback) {
  if (!isElectronApp() || typeof callback !== "function") return () => {};
  return window.electronAPI.onUpdateStatus(callback);
}

export async function launchDirectorJob({ job, imagePayload, settings }) {
  if (!isElectronApp()) {
    return { ok: false, error: "Requires Electron desktop app" };
  }
  return window.electronAPI.launchDirectorJob({ job, imagePayload, settings });
}

/** @returns {Promise<{ ok: boolean, stats?: import('./system-stats-types').SystemStats, error?: string }>} */
export async function getSystemStatsFromHost() {
  if (!isElectronApp() || !window.electronAPI?.getSystemStats) {
    return { ok: false, error: "Native system stats require the desktop app" };
  }
  return window.electronAPI.getSystemStats();
}

/** @returns {Promise<{ ok: boolean, progress?: number, remainingSec?: number, status?: string, message?: string, error?: string }>} */
export async function getDirectorBuildStatus(payload) {
  if (!isElectronApp() || !window.electronAPI?.getDirectorBuildStatus) {
    return { ok: false, error: "Build progress requires the desktop app" };
  }
  return window.electronAPI.getDirectorBuildStatus(payload);
}

/** @returns {Promise<{ ok: boolean, message?: string, error?: string }>} */
export async function cancelDirectorBuild(payload) {
  if (!isElectronApp() || !window.electronAPI?.cancelDirectorBuild) {
    return { ok: false, error: "Cancel build requires the desktop app" };
  }
  return window.electronAPI.cancelDirectorBuild(payload);
}

/** @deprecated use launchDirectorJob */
export async function launchOpenSoraJob(payload) {
  return launchDirectorJob(payload);
}

/** @deprecated */
export async function openOpenSoraUi() {
  return { ok: false, error: "Removed — use Director Engine export or Advanced local pipeline" };
}
