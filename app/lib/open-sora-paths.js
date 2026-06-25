/** Stable placeholder for Setup Hub input (SSR-safe — no absolute cwd paths). */
export const OPEN_SORA_PATH_PLACEHOLDER = ".userdata/addons/open-sora";

/** Default Open-Sora install folder — managed under Electron userData/addons/open-sora. */
const APP_DATA_DIR = "AI Video Creator";
const LOCAL_USERDATA_DIR = ".userdata";

function repoLocalOpenSoraPath() {
  if (typeof process !== "undefined" && process.cwd) {
    return `${process.cwd().replace(/\\/g, "/")}/${LOCAL_USERDATA_DIR}/addons/open-sora`;
  }
  return null;
}

/** Shown in UI when Electron userData path is not available (browser mode). */
export function getDefaultOpenSoraInstallPath() {
  if (typeof process !== "undefined" && process.env?.AI_VIDEO_USE_REPO_LOCAL_OPEN_SORA === "1") {
    const repoLocal = repoLocalOpenSoraPath();
    if (repoLocal) return repoLocal.replace(/\//g, "\\");
  }

  if (typeof window !== "undefined") {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    if (/Win/i.test(ua)) {
      return `%APPDATA%\\${APP_DATA_DIR}\\addons\\open-sora`;
    }
    return `~/.config/${APP_DATA_DIR}/addons/open-sora`;
  }
  if (typeof process !== "undefined" && process.platform === "win32") {
    const appData = process.env.APPDATA || "";
    if (appData) return `${appData}\\${APP_DATA_DIR}\\addons\\open-sora`;
    return `%APPDATA%\\${APP_DATA_DIR}\\addons\\open-sora`;
  }
  if (typeof process !== "undefined" && process.platform === "darwin") {
    const home = process.env.HOME || "";
    if (home) return `${home}/Library/Application Support/${APP_DATA_DIR}/addons/open-sora`;
  }
  const home =
    typeof process !== "undefined" ? process.env.HOME || process.env.USERPROFILE || "" : "";
  if (home) return `${home.replace(/\\/g, "/")}/.config/${APP_DATA_DIR}/addons/open-sora`;
  return `~/.config/${APP_DATA_DIR}/addons/open-sora`;
}
