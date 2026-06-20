const os = require("os");
const path = require("path");

/** Electron userData folder name (matches package.json build.productName). */
const APP_DATA_DIR = "AI Video Creator";

function managedOpenSoraPath(userDataPath) {
  return path.join(String(userDataPath || "").trim(), "addons", "open-sora");
}

function defaultUserDataPath() {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, APP_DATA_DIR);
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", APP_DATA_DIR);
  }
  return path.join(os.homedir(), ".config", APP_DATA_DIR);
}

/**
 * Default Open-Sora install path — always under managed addons when userData is known.
 * @param {string} [userDataPath]
 */
function defaultOpenSoraPath(userDataPath) {
  const base = String(userDataPath || "").trim() || defaultUserDataPath();
  return managedOpenSoraPath(base);
}

module.exports = { APP_DATA_DIR, defaultOpenSoraPath, defaultUserDataPath, managedOpenSoraPath };
