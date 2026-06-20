/**
 * Shared host environment scan for Setup Hub (Electron main + CLI smoke scripts).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

function isPipelineFolder(dir) {
  const target = String(dir || "").trim();
  if (!target || !fs.existsSync(target)) return false;
  return (
    fs.existsSync(path.join(target, "inference.py")) ||
    fs.existsSync(path.join(target, "app_pro.py")) ||
    fs.existsSync(path.join(target, "configs"))
  );
}

function resolveBundledResource(resourcesPath, relativePath) {
  if (!resourcesPath) return null;
  const candidate = path.join(resourcesPath, relativePath);
  return fs.existsSync(candidate) ? candidate : null;
}

function defaultOpenSoraPath() {
  return process.platform === "win32"
    ? "E:\\Open-Sora"
    : path.join(os.homedir(), "Open-Sora");
}

async function probePythonExecutable(pythonPath) {
  const target = String(pythonPath || "").trim() || "python";
  try {
    const { stdout } = await execFileAsync(target, ["--version"], {
      timeout: 8000,
      shell: process.platform === "win32",
    });
    const raw = String(stdout || "").trim();
    return {
      ok: true,
      path: target,
      version: raw.replace(/^Python\s+/i, "") || raw,
      bundled: false,
    };
  } catch (e) {
    return { ok: false, path: target, error: e?.message || "Python not found" };
  }
}

async function probeFfmpegExecutable(ffmpegPath) {
  const target = String(ffmpegPath || "").trim() || "ffmpeg";
  try {
    await execFileAsync(target, ["-version"], {
      timeout: 5000,
      shell: process.platform === "win32",
    });
    return { ok: true, path: target, bundled: false };
  } catch (e) {
    return { ok: false, path: target, error: e?.message || "ffmpeg not found" };
  }
}

/**
 * @param {object} [options]
 * @param {object} [options.directorSettings]
 * @param {string} [options.openSoraInstallPath]
 * @param {string|null} [options.resourcesPath]
 * @param {boolean} [options.packaged]
 * @param {() => Promise<object|null>} [options.gatherGpu]
 */
async function scanSetupEnvironment({
  directorSettings = {},
  openSoraInstallPath = "",
  resourcesPath = null,
  userDataPath = null,
  packaged = false,
  gatherGpu = async () => null,
} = {}) {
  let managedPython = null;
  let managedFfmpeg = null;
  if (userDataPath) {
    try {
      const { getManagedAddonPaths } = require("./addon-updater.cjs");
      const managed = getManagedAddonPaths(userDataPath);
      managedPython = managed.pythonPath || null;
      managedFfmpeg = managed.ffmpegPath || null;
    } catch {
      /* optional */
    }
  }

  const bundledPython =
    process.platform === "win32"
      ? resolveBundledResource(resourcesPath, path.join("python", "python.exe"))
      : resolveBundledResource(resourcesPath, path.join("python", "bin", "python3")) ||
        resolveBundledResource(resourcesPath, path.join("python", "bin", "python"));

  const bundledFfmpeg =
    process.platform === "win32"
      ? resolveBundledResource(resourcesPath, path.join("tools", "ffmpeg", "ffmpeg.exe"))
      : resolveBundledResource(resourcesPath, path.join("tools", "ffmpeg", "ffmpeg"));

  const pythonCandidates = [
    String(directorSettings.localPythonPath || "").trim(),
    managedPython,
    bundledPython,
    process.platform === "win32" ? "py" : "python3",
    "python",
  ].filter(Boolean);

  let python = { ok: false, error: "Python not found — install 3.10+ or bundle under resources/python" };
  for (const candidate of [...new Set(pythonCandidates)]) {
    const probe = await probePythonExecutable(candidate);
    if (probe.ok) {
      python = {
        ...probe,
        bundled: Boolean(
          (bundledPython && candidate === bundledPython) ||
            (managedPython && candidate === managedPython),
        ),
      };
      break;
    }
    python = probe;
  }

  const pipelinePath = String(directorSettings.localPipelinePath || "").trim();
  let pipeline =
    pipelinePath && isPipelineFolder(pipelinePath)
      ? { ok: true, path: pipelinePath }
      : {
          ok: false,
          path: pipelinePath,
          error: pipelinePath
            ? `Pipeline folder missing inference.py — ${pipelinePath}`
            : "Set Director → Advanced → local pipeline folder",
        };

  const openSoraCandidates = [
    openSoraInstallPath,
    pipelinePath,
    defaultOpenSoraPath(),
    process.env.OPEN_SORA_ROOT,
  ].filter(Boolean);

  let openSora = {
    ok: false,
    error: "Optional — clone Open-Sora or set install path in Open-Sora panel",
  };
  for (const candidate of [...new Set(openSoraCandidates.map(String))]) {
    if (isPipelineFolder(candidate)) {
      openSora = { ok: true, path: candidate };
      break;
    }
  }

  if (!pipeline.ok && openSora.ok) {
    pipeline = { ok: true, path: openSora.path, linkedFromOpenSora: true };
  }

  const ffmpegCandidates = [managedFfmpeg, bundledFfmpeg, "ffmpeg"].filter(Boolean);
  let ffmpeg = { ok: false, error: "Optional — not required for prompt studio" };
  for (const candidate of [...new Set(ffmpegCandidates)]) {
    const probe = await probeFfmpegExecutable(candidate);
    if (probe.ok) {
      ffmpeg = {
        ...probe,
        bundled: Boolean(
          (bundledFfmpeg && candidate === bundledFfmpeg) ||
            (managedFfmpeg && candidate === managedFfmpeg),
        ),
      };
      break;
    }
    ffmpeg = probe;
  }

  const gpu = (await gatherGpu()) || null;

  return {
    scannedAt: new Date().toISOString(),
    platform: process.platform,
    electron: { packaged, dev: !packaged },
    python,
    pipeline,
    openSora,
    ffmpeg,
    gpu,
  };
}

module.exports = {
  defaultOpenSoraPath,
  isPipelineFolder,
  scanSetupEnvironment,
};
