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

/** @returns {Promise<{ ok: boolean, error?: string }>} */
export async function revealDirectorOutput(filePath) {
  if (!isElectronApp() || !window.electronAPI?.revealDirectorOutput) {
    return { ok: false, error: "Reveal output requires the desktop app" };
  }
  return window.electronAPI.revealDirectorOutput(filePath);
}

/** @returns {Promise<{ ok: boolean, scan?: object, error?: string }>} */
export async function scanSetupEnvironmentFromHost(payload) {
  if (!isElectronApp() || !window.electronAPI?.scanSetupEnvironment) {
    return { ok: false, error: "Setup scan requires the desktop app" };
  }
  return window.electronAPI.scanSetupEnvironment(payload);
}

export async function launchOpenSoraJob(payload) {
  if (!isElectronApp()) {
    return { ok: false, error: "Requires Electron desktop app" };
  }
  return window.electronAPI.launchOpenSoraJob(payload);
}

export async function openOpenSoraUi(payload = {}) {
  if (!isElectronApp()) {
    return { ok: false, error: "Open-Sora UI launch requires the Electron desktop app" };
  }
  if (!window.electronAPI?.openOpenSoraUi) {
    return { ok: false, error: "Open-Sora UI not available in this build" };
  }
  return window.electronAPI.openOpenSoraUi(payload);
}

export async function syncOpenSoraCatalog(installPath) {
  if (!isElectronApp() || !window.electronAPI?.syncOpenSoraCatalog) {
    return { ok: false, error: "Catalog sync requires the Electron desktop app" };
  }
  return window.electronAPI.syncOpenSoraCatalog(installPath);
}

/** @returns {Promise<{ ok: boolean, bpm?: number, beatTimes?: number[], clipPlan?: object[], error?: string }>} */
export async function analyzeMusicVideoBeatsFromHost(payload) {
  if (!isElectronApp() || !window.electronAPI?.analyzeMusicVideoBeats) {
    return { ok: false, error: "Music video sync requires the desktop app" };
  }
  return window.electronAPI.analyzeMusicVideoBeats(payload);
}

/** @returns {Promise<{ ok: boolean, path?: string, clipCount?: number, message?: string, error?: string }>} */
export async function assembleMusicVideoFromHost(payload) {
  if (!isElectronApp() || !window.electronAPI?.assembleMusicVideo) {
    return { ok: false, error: "Music video assembly requires the desktop app and FFmpeg addon" };
  }
  return window.electronAPI.assembleMusicVideo(payload);
}

/** @returns {Promise<{ ok: boolean, session?: object|null, path?: string, error?: string }>} */
export async function loadAgentSessionFromHost() {
  if (!isElectronApp() || !window.electronAPI?.loadAgentSession) {
    return { ok: false, error: "Agent session load requires the desktop app" };
  }
  return window.electronAPI.loadAgentSession();
}

/** @returns {Promise<{ ok: boolean, path?: string, error?: string }>} */
export async function saveAgentSessionToHost(session) {
  if (!isElectronApp() || !window.electronAPI?.saveAgentSession) {
    return { ok: false, error: "Agent session save requires the desktop app" };
  }
  return window.electronAPI.saveAgentSession(session);
}

/**
 * Open the analytical canvas dashboard with an optional project/handoff snapshot.
 * @param {object} [payload]
 * @returns {Promise<{ ok: boolean, error?: string, reused?: boolean }>}
 */
export async function openCanvasDashboard(payload) {
  if (!isElectronApp() || !window.electronAPI?.openCanvas) {
    return { ok: false, error: "Canvas requires the desktop app" };
  }
  return window.electronAPI.openCanvas(payload);
}
