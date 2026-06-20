/**
 * Shared host environment scan for Setup Hub (Electron main + CLI smoke scripts).
 */
const fs = require("fs");
const path = require("path");
const { defaultOpenSoraPath } = require("./open-sora-paths.cjs");
const {
  ensureModelsCkptsLink,
  fileExists,
  resolveModelWeightsStatus,
  getManagedRequirementsPath,
  getManagedVenvDir,
  getVenvPythonPath,
  getWslVenvPythonPath,
} = require("./addon-paths.cjs");
const { gitAvailable, probeWslRenderStack, wslAvailable, wslVenvExists } = require("./addon-platform.cjs");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { execLocal } = require("./process-exec.cjs");

const execFileAsync = promisify(execFile);

function isPipelineFolder(dir) {
  const target = String(dir || "").trim();
  if (!target || !fs.existsSync(target)) return false;
  return (
    fs.existsSync(path.join(target, "inference.py")) ||
    fs.existsSync(path.join(target, "scripts", "diffusion", "inference.py")) ||
    fs.existsSync(path.join(target, "app_pro.py")) ||
    fs.existsSync(path.join(target, "configs"))
  );
}

function resolveBundledResource(resourcesPath, relativePath) {
  if (!resourcesPath) return null;
  const candidate = path.join(resourcesPath, relativePath);
  return fs.existsSync(candidate) ? candidate : null;
}

async function probePythonExecutable(pythonPath) {
  const target = String(pythonPath || "").trim() || "python";
  try {
    const { stdout } = await execLocal(target, ["--version"], {
      timeout: 8000,
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

async function probePythonModule(pythonPath, moduleName) {
  try {
    await execLocal(pythonPath, ["-c", `import ${moduleName}`], { timeout: 15000 });
    return true;
  } catch {
    return false;
  }
}

async function probeTorchCuda(pythonPath) {
  try {
    const { stdout } = await execLocal(
      pythonPath,
      ["-c", "import torch; print(torch.cuda.is_available())"],
      { timeout: 30000 },
    );
    return String(stdout || "").trim().toLowerCase() === "true";
  } catch {
    return false;
  }
}

async function probeFfmpegExecutable(ffmpegPath) {
  const target = String(ffmpegPath || "").trim() || "ffmpeg";
  try {
    await execLocal(target, ["-version"], { timeout: 5000 });
    return { ok: true, path: target, bundled: false };
  } catch (e) {
    return { ok: false, path: target, error: e?.message || "ffmpeg not found" };
  }
}

function loadForceManaged(userDataPath) {
  if (!userDataPath) return false;
  try {
    const { loadAddonManifest } = require("./addon-updater.cjs");
    return Boolean(loadAddonManifest().forceManaged);
  } catch {
    return false;
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
  const forceManaged = loadForceManaged(userDataPath);
  let managed = {};
  if (userDataPath) {
    try {
      const { getManagedAddonPaths } = require("./addon-updater.cjs");
      managed = getManagedAddonPaths(userDataPath);
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

  const pythonCandidates = forceManaged
    ? [managed.venvPythonPath, managed.pythonPath].filter(Boolean)
    : [
        String(directorSettings.localPythonPath || "").trim(),
        managed.venvPythonPath,
        managed.pythonPath,
        bundledPython,
        process.platform === "win32" ? "py" : "python3",
        "python",
      ].filter(Boolean);

  let python = {
    ok: false,
    error: forceManaged
      ? "Managed Python not installed — run Install Addons or Setup Hub → Install all tools"
      : "Python not found — install 3.10+ or bundle under resources/python",
  };
  for (const candidate of [...new Set(pythonCandidates)]) {
    const probe = await probePythonExecutable(candidate);
    if (probe.ok) {
      python = {
        ...probe,
        managed: Boolean(
          candidate === managed.venvPythonPath || candidate === managed.pythonPath,
        ),
        bundled: Boolean(
          (bundledPython && candidate === bundledPython) ||
            (managed.pythonPath && candidate === managed.pythonPath && !managed.venvPythonPath),
        ),
      };
      break;
    }
    python = probe;
  }

  const managedOpenSora = defaultOpenSoraPath(userDataPath || undefined);
  const pipelinePath = forceManaged
    ? managedOpenSora
    : String(directorSettings.localPipelinePath || "").trim();

  let pipeline =
    pipelinePath && isPipelineFolder(pipelinePath)
      ? { ok: true, path: pipelinePath, managed: forceManaged }
      : {
          ok: false,
          path: pipelinePath,
          managed: forceManaged,
          error: forceManaged
            ? "Managed Open-Sora not installed — run Install Addons or Setup Hub → Install all tools"
            : pipelinePath
              ? `Pipeline folder missing inference.py — ${pipelinePath}`
              : "Set Director → Advanced → local pipeline folder",
        };

  const openSoraCandidates = forceManaged
    ? [managedOpenSora]
    : [openSoraInstallPath, pipelinePath, managedOpenSora, process.env.OPEN_SORA_ROOT].filter(Boolean);

  let openSora = {
    ok: false,
    managed: forceManaged,
    error: forceManaged
      ? "Managed Open-Sora not installed — run Install Addons or Setup Hub → Install all tools"
      : "Optional — clone Open-Sora or set install path in Open-Sora panel",
  };
  for (const candidate of [...new Set(openSoraCandidates.map(String))]) {
    if (isPipelineFolder(candidate)) {
      openSora = { ok: true, path: candidate, managed: forceManaged || candidate === managedOpenSora };
      break;
    }
  }

  if (!pipeline.ok && openSora.ok) {
    pipeline = { ok: true, path: openSora.path, linkedFromOpenSora: true, managed: openSora.managed };
  }

  const ffmpegCandidates = forceManaged
    ? [managed.ffmpegPath].filter(Boolean)
    : [managed.ffmpegPath, bundledFfmpeg, "ffmpeg"].filter(Boolean);

  let ffmpeg = { ok: false, error: "Optional — not required for prompt studio" };
  for (const candidate of [...new Set(ffmpegCandidates)]) {
    const probe = await probeFfmpegExecutable(candidate);
    if (probe.ok) {
      ffmpeg = {
        ...probe,
        managed: Boolean(managed.ffmpegPath && candidate === managed.ffmpegPath),
        bundled: Boolean(
          (bundledFfmpeg && candidate === bundledFfmpeg) ||
            (managed.ffmpegPath && candidate === managed.ffmpegPath),
        ),
      };
      break;
    }
    ffmpeg = probe;
  }

  const venvPy = userDataPath ? getVenvPythonPath(userDataPath) : null;
  const venv = {
    ok: fileExists(venvPy),
    path: venvPy,
    managed: true,
  };

  const reqPath = userDataPath ? getManagedRequirementsPath(userDataPath) : null;
  const requirements = {
    ok: fileExists(reqPath),
    path: reqPath,
    managed: true,
  };

  const renderPython = python.ok ? python.path : venvPy;
  const torchOk = renderPython ? await probePythonModule(renderPython, "torch") : false;
  const cudaOk = renderPython && torchOk ? await probeTorchCuda(renderPython) : false;
  const colossalaiOk = renderPython ? await probePythonModule(renderPython, "colossalai") : false;
  const pipDeps = {
    ok: torchOk,
    cudaOk,
    colossalaiOk,
    winRenderReady: Boolean(torchOk && cudaOk && colossalaiOk),
    probeModule: "torch",
    managed: true,
  };

  if (userDataPath) {
    ensureModelsCkptsLink(userDataPath);
  }
  const weights = userDataPath ? resolveModelWeightsStatus(userDataPath) : null;
  const models = weights
    ? {
        ok: weights.ok,
        hasWeights: weights.hasWeights,
        count: weights.weightCount,
        path: weights.primaryPath,
        modelsPath: weights.modelsPath,
        ckptsPath: weights.ckptsPath,
        source: weights.source,
        managed: true,
      }
    : {
        ok: false,
        hasWeights: false,
        count: 0,
        path: null,
        managed: true,
      };

  let musicVideoSync = { ok: false, managed: true };
  if (userDataPath) {
    try {
      const { probeMusicVideoSyncReady } = require("./music-video-sync.cjs");
      const probe = await probeMusicVideoSyncReady(userDataPath);
      musicVideoSync = {
        ok: Boolean(probe.ok),
        path: probe.path || null,
        managed: true,
        error: probe.ok ? null : probe.error || "librosa not ready",
      };
    } catch (e) {
      musicVideoSync = { ok: false, managed: true, error: e?.message || "music video sync probe failed" };
    }
  }

  const gpu = (await gatherGpu()) || null;

  const hasGit = await gitAvailable();
  const git = {
    ok: hasGit,
    error: hasGit ? null : "Git not on PATH — install before Open-Sora clone",
  };

  let nodejs = { ok: false, managed: true };
  if (managed.nodePath && fileExists(managed.nodePath)) {
    const probe = await probePythonExecutable(managed.nodePath);
    nodejs = { ...probe, ok: probe.ok, managed: true, path: managed.nodePath };
  }

  let wsl = { ok: false, available: false, managed: true };
  if (process.platform === "win32") {
    const wslOk = await wslAvailable();
    wsl.available = wslOk;
    const wslPy = getWslVenvPythonPath(userDataPath || "");
    if (wslOk) {
      const wslProbe = await wslVenvExists(userDataPath || "");
      if (wslProbe) {
        const stack = await probeWslRenderStack(userDataPath || "");
        wsl = {
          ok: stack.ok,
          torchOk: stack.torch,
          colossalaiOk: stack.colossalai,
          tensornvmeOk: stack.tensornvme,
          available: true,
          path: wslPy,
          managed: true,
        };
      } else {
        wsl = { ok: false, available: true, path: wslPy, managed: true };
      }
    } else {
      wsl = { ok: false, available: false, path: wslPy, managed: true };
    }
  }

  return {
    scannedAt: new Date().toISOString(),
    platform: process.platform,
    electron: { packaged, dev: !packaged },
    forceManaged,
    addonsRoot: managed.addonsRoot || null,
    git,
    nodejs,
    python,
    venv,
    pipeline,
    openSora,
    ffmpeg,
    requirements,
    pipDeps,
    models,
    musicVideoSync,
    wsl,
    gpu,
  };
}

module.exports = {
  defaultOpenSoraPath,
  isPipelineFolder,
  scanSetupEnvironment,
};
