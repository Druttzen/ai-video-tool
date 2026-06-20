/** Default Open-Sora install folder — managed under Electron userData/addons/open-sora. */
const APP_DATA_DIR = "AI Video Creator";

export function getManagedOpenSoraSubpath() {
  return "addons\\open-sora";
}

/** Shown in UI when Electron userData path is not available (browser mode). */
export function getDefaultOpenSoraInstallPath() {
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
