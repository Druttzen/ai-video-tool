/**
 * Managed addon directory layout under Electron userData.
 */
const fs = require("fs");
const path = require("path");

function getAddonsRoot(userDataPath) {
  return path.join(String(userDataPath || "").trim(), "addons");
}

function getManagedPythonDir(userDataPath, version) {
  return path.join(getAddonsRoot(userDataPath), "python", String(version || "embed"));
}

function getManagedNodeDir(userDataPath, version) {
  return path.join(getAddonsRoot(userDataPath), "nodejs", String(version || "lts"));
}

function getManagedFfmpegDir(userDataPath, version) {
  return path.join(getAddonsRoot(userDataPath), "ffmpeg", String(version || "bundled"));
}

function getManagedOpenSoraDir(userDataPath) {
  return path.join(getAddonsRoot(userDataPath), "open-sora");
}

function getManagedVenvDir(userDataPath) {
  return path.join(getAddonsRoot(userDataPath), "venv");
}

function getManagedWslVenvDir(userDataPath) {
  return path.join(getAddonsRoot(userDataPath), "wsl-venv");
}

function getManagedModelsDir(userDataPath) {
  return path.join(getAddonsRoot(userDataPath), "models");
}

function getManagedRequirementsPath(userDataPath) {
  return path.join(getAddonsRoot(userDataPath), "requirements.txt");
}

function getManagedRequirementsMetaPath(userDataPath) {
  return path.join(getAddonsRoot(userDataPath), "requirements.meta.json");
}

function getBundledOptionalRequirementsPath() {
  return path.join(__dirname, "..", "..", "data", "addon-requirements-optional.txt");
}

function getManagedWslBootstrapCopyPath(userDataPath) {
  return path.join(getAddonsCacheDir(userDataPath), "wsl-addon-bootstrap.sh");
}

function getBundledManifestPath() {
  return path.join(__dirname, "..", "..", "data", "addon-updates-manifest.json");
}

function getWslBootstrapScriptPath() {
  return path.join(__dirname, "..", "wsl-addon-bootstrap.sh");
}

function getVenvPythonPath(userDataPath) {
  const venvRoot = getManagedVenvDir(userDataPath);
  if (process.platform === "win32") {
    return path.join(venvRoot, "Scripts", "python.exe");
  }
  return path.join(venvRoot, "bin", "python3");
}

function getWslVenvPythonPath(userDataPath) {
  return path.join(getManagedWslVenvDir(userDataPath), "bin", "python3");
}

function getVenvPipPath(userDataPath) {
  const venvRoot = getManagedVenvDir(userDataPath);
  if (process.platform === "win32") {
    return path.join(venvRoot, "Scripts", "pip.exe");
  }
  return path.join(venvRoot, "bin", "pip3");
}

function getVenvActivatePath(userDataPath) {
  const venvRoot = getManagedVenvDir(userDataPath);
  if (process.platform === "win32") {
    return path.join(venvRoot, "Scripts", "activate.bat");
  }
  return path.join(venvRoot, "bin", "activate");
}

function getAddonsCacheDir(userDataPath) {
  return path.join(getAddonsRoot(userDataPath), "cache");
}

function fileExists(target) {
  return Boolean(target && fs.existsSync(target));
}

function getBundledRequirementsTemplatePath() {
  return path.join(__dirname, "..", "..", "data", "addon-requirements.txt");
}

function isModelArtifactName(name) {
  const lower = String(name || "").toLowerCase();
  if (!lower || lower.startsWith(".")) return false;
  if (lower === "readme.txt" || lower === "readme.md" || lower === ".gitkeep") return false;
  return true;
}

function countModelArtifacts(modelsDir) {
  if (!fileExists(modelsDir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(modelsDir, { withFileTypes: true })) {
    if (!isModelArtifactName(entry.name)) continue;
    count += 1;
  }
  return count;
}

/**
 * Returns managed venv python or throws if forceVenvForPip is enforced.
 * @param {string} userDataPath
 * @param {boolean} [force=true]
 */
function requireManagedVenvPython(userDataPath, force = true) {
  const venvPy = getVenvPythonPath(userDataPath);
  if (fileExists(venvPy)) return venvPy;
  if (force) {
    throw new Error("Managed venv required — run Install Addons or: npm run tools:install");
  }
  return null;
}

module.exports = {
  countModelArtifacts,
  fileExists,
  getAddonsCacheDir,
  getAddonsRoot,
  getBundledManifestPath,
  getBundledOptionalRequirementsPath,
  getBundledRequirementsTemplatePath,
  getManagedWslBootstrapCopyPath,
  isModelArtifactName,
  getManagedFfmpegDir,
  getManagedModelsDir,
  getManagedNodeDir,
  getManagedOpenSoraDir,
  getManagedPythonDir,
  getManagedRequirementsMetaPath,
  getManagedRequirementsPath,
  getManagedVenvDir,
  getManagedWslVenvDir,
  getVenvActivatePath,
  getVenvPipPath,
  getVenvPythonPath,
  getWslBootstrapScriptPath,
  getWslVenvPythonPath,
  requireManagedVenvPython,
};
