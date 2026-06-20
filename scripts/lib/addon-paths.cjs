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

const MODEL_WEIGHT_EXTENSIONS = new Set([
  ".safetensors",
  ".ckpt",
  ".pt",
  ".pth",
  ".bin",
  ".onnx",
]);

function getOpenSoraCkptsDir(userDataPath) {
  return path.join(getManagedOpenSoraDir(userDataPath), "ckpts");
}

function isModelWeightFile(name) {
  const lower = String(name || "").toLowerCase();
  if (!lower || lower.startsWith(".")) return false;
  return MODEL_WEIGHT_EXTENSIONS.has(path.extname(lower));
}

/**
 * Recursively count checkpoint weight files under a directory.
 * @param {string} rootDir
 * @param {{ maxDepth?: number }} [opts]
 */
function countModelWeightFiles(rootDir, opts = {}) {
  const maxDepth = opts.maxDepth ?? 5;
  if (!fileExists(rootDir)) return 0;

  let count = 0;
  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.name || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile() && isModelWeightFile(entry.name)) {
        count += 1;
      }
    }
  }
  walk(rootDir, 0);
  return count;
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
 * Unified model weights probe — Open-Sora reads ./ckpts inside the managed pipeline.
 * @param {string} userDataPath
 */
function resolveModelWeightsStatus(userDataPath) {
  const modelsPath = getManagedModelsDir(userDataPath);
  const ckptsPath = getOpenSoraCkptsDir(userDataPath);
  const ckptsWeightCount = countModelWeightFiles(ckptsPath);
  const modelsWeightCount = countModelWeightFiles(modelsPath);
  const weightCount = Math.max(ckptsWeightCount, modelsWeightCount);
  const hasWeights = weightCount > 0;
  const placeholderReady =
    fileExists(modelsPath) &&
    (hasWeights || fileExists(path.join(modelsPath, "README.txt")) || fileExists(ckptsPath));

  return {
    modelsPath,
    ckptsPath,
    weightCount,
    ckptsWeightCount,
    modelsWeightCount,
    hasWeights,
    ok: placeholderReady,
    primaryPath: ckptsWeightCount > 0 ? ckptsPath : modelsPath,
    source:
      ckptsWeightCount > 0 ? "open-sora-ckpts" : modelsWeightCount > 0 ? "models" : null,
  };
}

/**
 * Link models/ckpts → open-sora/ckpts so Setup Hub and the pipeline share one folder.
 * @param {string} userDataPath
 */
function ensureModelsCkptsLink(userDataPath) {
  const modelsDir = getManagedModelsDir(userDataPath);
  const ckptsDir = getOpenSoraCkptsDir(userDataPath);
  const linkPath = path.join(modelsDir, "ckpts");

  fs.mkdirSync(modelsDir, { recursive: true });
  fs.mkdirSync(ckptsDir, { recursive: true });

  if (fileExists(linkPath)) {
    try {
      const stat = fs.lstatSync(linkPath);
      if (stat.isSymbolicLink()) {
        const target = fs.readlinkSync(linkPath);
        const resolved = path.resolve(modelsDir, target);
        if (resolved === path.resolve(ckptsDir)) {
          return { ok: true, linked: true, path: linkPath, skipped: true };
        }
      }
      if (stat.isDirectory() && !stat.isSymbolicLink()) {
        return {
          ok: true,
          linked: false,
          path: linkPath,
          skipped: true,
          reason: "models/ckpts already exists as a folder",
        };
      }
    } catch {
      /* try to create link below */
    }
  }

  try {
    const target = path.resolve(ckptsDir);
    if (process.platform === "win32") {
      fs.symlinkSync(target, linkPath, "junction");
    } else {
      fs.symlinkSync(target, linkPath, "dir");
    }
    return { ok: true, linked: true, path: linkPath };
  } catch (err) {
    return { ok: false, linked: false, error: err?.message || "symlink failed" };
  }
}

function buildModelsReadmeText() {
  return [
    "AI Video Creator — Open-Sora model weights",
    "",
    "Local render loads checkpoints from:",
    "  addons/open-sora/ckpts/",
    "",
    "This folder links to that path as:",
    "  addons/models/ckpts",
    "",
    "Download Open-Sora 2.0 (managed venv python — use snapshot_download API):",
    "  set CKPTS=%APPDATA%\\AI Video Creator\\addons\\open-sora\\ckpts",
    "  \"%APPDATA%\\AI Video Creator\\addons\\venv\\Scripts\\python.exe\" -c \"from huggingface_hub import snapshot_download; snapshot_download(repo_id='hpcai-tech/Open-Sora-v2', local_dir=r'%CKPTS%')\"",
    "",
    "Optional: set HF_TOKEN for faster downloads (gated models). Accept the model license on Hugging Face first.",
    "",
    "Then rescan in Setup Hub.",
    "",
  ].join("\n");
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
  buildModelsReadmeText,
  countModelArtifacts,
  countModelWeightFiles,
  ensureModelsCkptsLink,
  fileExists,
  getAddonsCacheDir,
  getAddonsRoot,
  getBundledManifestPath,
  getBundledOptionalRequirementsPath,
  getBundledRequirementsTemplatePath,
  getManagedWslBootstrapCopyPath,
  getOpenSoraCkptsDir,
  isModelArtifactName,
  isModelWeightFile,
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
  resolveModelWeightsStatus,
};
