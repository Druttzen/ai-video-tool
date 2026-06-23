const fs = require("fs");
const os = require("os");
const path = require("path");

/** Electron userData folder name (matches package.json build.productName). */
const APP_DATA_DIR = "AI Video Creator";

const REPO_PACKAGE_NAME = "ai-video-tool";
const LOCAL_USERDATA_DIR = ".userdata";

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

function isPackagedAppPath(startDir) {
  const normalized = String(startDir || "").replace(/\\/g, "/");
  return normalized.includes("/app.asar") || normalized.includes("/resources/app");
}

/**
 * Walk upward from startDir to find the ai-video-tool repo root.
 * @param {string} [startDir]
 * @returns {string|null}
 */
function findRepoRoot(startDir) {
  let dir = path.resolve(String(startDir || process.cwd()).trim());
  const root = path.parse(dir).root;

  while (dir && dir !== root) {
    const pkgPath = path.join(dir, "package.json");
    try {
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        if (pkg?.name === REPO_PACKAGE_NAME) return dir;
      }
    } catch {
      /* try parent */
    }
    dir = path.dirname(dir);
  }

  return null;
}

/**
 * Resolve Electron userData — managed addons live at `{userData}/addons/`.
 *
 * Priority:
 * 1. ADDON_USER_DATA or AI_VIDEO_CREATOR_USER_DATA
 * 2. Repo checkout → `{repo}/.userdata` (dev/CLI default)
 * 3. Packaged app or AI_VIDEO_USE_APPDATA=1 → OS AppData
 *
 * @param {string} [startDir]
 */
function resolveUserDataPath(startDir) {
  const explicit = String(process.env.ADDON_USER_DATA || process.env.AI_VIDEO_CREATOR_USER_DATA || "").trim();
  if (explicit) return path.resolve(explicit);

  if (process.env.AI_VIDEO_USE_APPDATA === "1") {
    return defaultUserDataPath();
  }

  const probe = startDir || path.join(__dirname, "..", "..");
  if (!isPackagedAppPath(probe)) {
    const repoRoot = findRepoRoot(probe);
    if (repoRoot) return path.join(repoRoot, LOCAL_USERDATA_DIR);
  }

  return defaultUserDataPath();
}

/**
 * Default Open-Sora install path — always under managed addons when userData is known.
 * @param {string} [userDataPath]
 */
function defaultOpenSoraPath(userDataPath) {
  const base = String(userDataPath || "").trim() || resolveUserDataPath();
  return managedOpenSoraPath(base);
}

module.exports = {
  APP_DATA_DIR,
  LOCAL_USERDATA_DIR,
  defaultOpenSoraPath,
  defaultUserDataPath,
  findRepoRoot,
  managedOpenSoraPath,
  resolveUserDataPath,
};
