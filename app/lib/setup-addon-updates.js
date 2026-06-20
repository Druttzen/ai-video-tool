import { safeLocalStorage } from "./safe-local-storage";
import { isElectronApp } from "./electron-bridge";

export const SETUP_ADDON_AUTO_UPDATE_KEY = "ai_video_creator_addon_auto_update_v1";

export function loadAddonAutoUpdateSetting() {
  if (typeof window === "undefined") return true;
  const value = safeLocalStorage.getJSON(SETUP_ADDON_AUTO_UPDATE_KEY, null);
  if (value === null) return true;
  return Boolean(value.enabled);
}

export function saveAddonAutoUpdateSetting(enabled) {
  if (typeof window === "undefined") return;
  safeLocalStorage.setJSON(SETUP_ADDON_AUTO_UPDATE_KEY, { enabled: Boolean(enabled) });
}

export async function checkAddonUpdatesFromHost(payload) {
  if (!isElectronApp() || !window.electronAPI?.checkAddonUpdates) {
    return { ok: false, error: "Addon updates require the desktop app" };
  }
  return window.electronAPI.checkAddonUpdates(payload);
}

export async function updateAddonFromHost(payload) {
  if (!isElectronApp() || !window.electronAPI?.updateAddon) {
    return { ok: false, error: "Addon updates require the desktop app" };
  }
  return window.electronAPI.updateAddon(payload);
}

export async function updateAllAddonsFromHost(payload) {
  if (!isElectronApp() || !window.electronAPI?.updateAllAddons) {
    return { ok: false, error: "Addon updates require the desktop app" };
  }
  return window.electronAPI.updateAllAddons(payload);
}

export async function getToolInstallProtocolFromHost() {
  if (!isElectronApp() || !window.electronAPI?.getToolInstallProtocol) {
    return { ok: false, error: "Tool installer requires the desktop app" };
  }
  return window.electronAPI.getToolInstallProtocol();
}

export async function scanMissingToolsFromHost() {
  if (!isElectronApp() || !window.electronAPI?.scanMissingTools) {
    return { ok: false, error: "Tool scan requires the desktop app" };
  }
  return window.electronAPI.scanMissingTools();
}

export async function installToolsFromHost(payload) {
  if (!isElectronApp() || !window.electronAPI?.installTools) {
    return { ok: false, error: "Tool install requires the desktop app" };
  }
  return window.electronAPI.installTools(payload);
}

export async function openExternalUrlFromHost(url) {
  if (!isElectronApp() || !window.electronAPI?.openExternal) {
    if (typeof window !== "undefined" && url) window.open(url, "_blank", "noopener,noreferrer");
    return { ok: false, error: "openExternal requires the desktop app" };
  }
  return window.electronAPI.openExternal(url);
}

/** @param {{ items?: { id: string, updateAvailable?: boolean, label?: string }[] }|null} report */
export function summarizeAddonUpdateReport(report) {
  if (!report?.items?.length) return "No addon update data";
  const pending = report.items.filter((i) => i.updateAvailable);
  if (!pending.length) return "All addons up to date";
  return `${pending.length} addon update(s) available: ${pending.map((i) => i.label || i.id).join(", ")}`;
}
