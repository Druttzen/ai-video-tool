/**
 * Platform detection for managed addon installs (Windows, Linux, macOS, WSL).
 */
const path = require("path");
const { spawn } = require("child_process");
const { execLocal } = require("./process-exec.cjs");
const { getAddonsRoot, getManagedWslVenvDir } = require("./addon-paths.cjs");
const { GPU_VENDOR_ENV, resolveGpuVendor } = require("./gpu-vendor.cjs");
const WSL_BOOTSTRAP_TIMEOUT_MS = 1800000;

function normalizeUnixScript(content) {
  return String(content || "").replace(/\r/g, "");
}

function wslTensornvmeEnvPrelude() {
  return 'export LD_LIBRARY_PATH="${HOME}/.tensornvme/lib:${LD_LIBRARY_PATH:-}"';
}

function shellQuoteBash(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function windowsPathToWsl(mixedPath) {
  const raw = String(mixedPath || "").trim().replace(/\\/g, "/");
  const driveMatch = raw.match(/^([A-Za-z]):\/?(.*)/);
  if (driveMatch) {
    return `/mnt/${driveMatch[1].toLowerCase()}/${driveMatch[2]}`;
  }
  const normalized = path.resolve(mixedPath).replace(/\\/g, "/");
  const resolvedDrive = normalized.match(/^([A-Za-z]):\/*(.*)/);
  if (resolvedDrive) {
    return `/mnt/${resolvedDrive[1].toLowerCase()}/${resolvedDrive[2]}`;
  }
  return normalized;
}

async function wslAvailable() {
  if (process.platform !== "win32") return false;
  try {
    await execLocal("wsl", ["--status"], { timeout: 8000 });
    return true;
  } catch {
    try {
      await execLocal("wsl", ["-l", "-v"], { timeout: 8000 });
      return true;
    } catch {
      return false;
    }
  }
}

async function wslVenvExists(userDataPath) {
  if (process.platform !== "win32") return false;
  const wslVenv = windowsPathToWsl(getManagedWslVenvDir(userDataPath));
  const cmd = [
    `test -x ${shellQuoteBash(`${wslVenv}/bin/python`)}`,
    `|| test -x ${shellQuoteBash(`${wslVenv}/bin/python3`)}`,
  ].join(" ");
  try {
    await execLocal("wsl", ["bash", "-lc", cmd], { timeout: 15000 });
    return true;
  } catch {
    return false;
  }
}

async function probeWslPythonModule(userDataPath, moduleName = "torch") {
  if (process.platform !== "win32") return false;
  const wslVenv = windowsPathToWsl(getManagedWslVenvDir(userDataPath));
  const python = `${wslVenv}/bin/python3`;
  const cmd = [
    wslTensornvmeEnvPrelude(),
    `test -x ${shellQuoteBash(python)}`,
    `VIRTUAL_ENV=${shellQuoteBash(wslVenv)} ${shellQuoteBash(python)} -c ${shellQuoteBash(`import ${moduleName}`)}`,
  ].join(" && ");
  try {
    await execLocal("wsl", ["bash", "-lc", cmd], { timeout: 90000 });
    return true;
  } catch {
    return false;
  }
}

async function probeWslPythonCode(userDataPath, code) {
  if (process.platform !== "win32") return false;
  const wslVenv = windowsPathToWsl(getManagedWslVenvDir(userDataPath));
  const python = `${wslVenv}/bin/python3`;
  const cmd = [
    wslTensornvmeEnvPrelude(),
    `test -x ${shellQuoteBash(python)}`,
    `VIRTUAL_ENV=${shellQuoteBash(wslVenv)} ${shellQuoteBash(python)} -c ${shellQuoteBash(code)}`,
  ].join(" && ");
  try {
    await execLocal("wsl", ["bash", "-lc", cmd], { timeout: 300000 });
    return true;
  } catch {
    return false;
  }
}

async function probeWslWanReady(userDataPath) {
  const torchCuda = await probeWslPythonCode(
    userDataPath,
    "import torch; assert torch.cuda.is_available()",
  );
  if (!torchCuda) return false;
  return probeWslPythonCode(
    userDataPath,
    "import importlib.metadata as m; v=m.version('diffusers'); assert tuple(int(x) for x in v.split('.')[:2])>=(0,38)",
  );
}

/** @returns {Promise<{ ok: boolean, torch: boolean, colossalai: boolean, tensornvme: boolean, wanReady: boolean }>} */
async function probeWslRenderStack(userDataPath) {
  const torch = await probeWslPythonModule(userDataPath, "torch");
  const colossalai = torch ? await probeWslPythonModule(userDataPath, "colossalai") : false;
  const tensornvme = torch ? await probeWslPythonModule(userDataPath, "tensornvme") : false;
  const wanReady = torch ? await probeWslWanReady(userDataPath) : false;
  return {
    torch,
    colossalai,
    tensornvme,
    wanReady,
    ok: Boolean(torch && (colossalai || wanReady)),
  };
}

/**
 * Run the WSL bootstrap script via stdin so CRLF on /mnt/c cached copies cannot break bash.
 * @param {object} params
 * @param {string} params.userDataPath
 * @param {string} params.scriptContent
 * @param {string} [params.openSoraPath]
 * @param {number} [params.timeout]
 */
async function runWslBootstrap({
  userDataPath,
  scriptContent,
  openSoraPath,
  optionalRequirementsPath,
  timeout = WSL_BOOTSTRAP_TIMEOUT_MS,
}) {
  if (process.platform !== "win32") {
    throw new Error("WSL bootstrap only runs on Windows");
  }

  const normalized = normalizeUnixScript(scriptContent);
  const addonsRoot = windowsPathToWsl(getAddonsRoot(userDataPath));
  const wslVenv = `${addonsRoot}/wsl-venv`;
  const reqFile = `${addonsRoot}/requirements.txt`;
  const openSora = windowsPathToWsl(openSoraPath || path.join(getAddonsRoot(userDataPath), "open-sora"));
  const optionalReq = optionalRequirementsPath
    ? windowsPathToWsl(optionalRequirementsPath)
    : `${addonsRoot}/addon-requirements-optional.txt`;
  const gpuVendor = await resolveGpuVendor();
  const prelude = [
    `export ADDONS_ROOT=${shellQuoteBash(addonsRoot)}`,
    `export VENV_DIR=${shellQuoteBash(wslVenv)}`,
    `export REQ_FILE=${shellQuoteBash(reqFile)}`,
    `export OPEN_SORA_DIR=${shellQuoteBash(openSora)}`,
    `export OPTIONAL_REQ_FILE=${shellQuoteBash(optionalReq)}`,
    `export ${GPU_VENDOR_ENV}=${shellQuoteBash(gpuVendor)}`,
  ].join("; ");

  return new Promise((resolve, reject) => {
    const child = spawn("wsl", ["bash", "-lc", `${prelude}; exec bash -s`], {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.stdin.write(normalized, "utf8");
    child.stdin.end();

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`WSL bootstrap timeout after ${timeout}ms`));
    }, timeout);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ ok: true });
        return;
      }
      reject(new Error(stderr.trim() || `WSL bootstrap exited with code ${code}`));
    });
  });
}

/**
 * Install libaio-dev + tensornvme (+ optional flash-attn) in WSL.
 * Uses stdio inherit so sudo password prompts work when run from a terminal.
 */
async function runWslLinuxOptionalInstall({ timeout = WSL_BOOTSTRAP_TIMEOUT_MS } = {}) {
  if (process.platform !== "win32") {
    throw new Error("WSL optional install only runs on Windows host");
  }
  const scriptWin = path.join(__dirname, "..", "wsl-install-linux-optional.sh");
  const scriptWsl = windowsPathToWsl(scriptWin);

  return new Promise((resolve, reject) => {
    const child = spawn("wsl", ["bash", scriptWsl], {
      shell: false,
      stdio: "inherit",
      windowsHide: false,
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`WSL optional install timeout after ${timeout}ms`));
    }, timeout);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true });
      else reject(new Error(`WSL optional install exited with code ${code}`));
    });
  });
}

async function gitAvailable() {
  try {
    await execLocal("git", ["--version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {object} [options]
 * @param {boolean} [options.preferWsl]
 * @returns {Promise<'win32'|'linux'|'darwin'|'wsl'>}
 */
async function resolveEffectivePlatform({ preferWsl = false } = {}) {
  if (preferWsl && process.platform === "win32" && (await wslAvailable())) {
    return "wsl";
  }
  if (process.platform === "win32") return "win32";
  if (process.platform === "darwin") return "darwin";
  return "linux";
}

/** Manifest embed/build key — WSL uses linux artifact URLs. */
function manifestPlatformKey(effectivePlatform) {
  return effectivePlatform === "wsl" ? "linux" : effectivePlatform;
}

function nodeExecutableName() {
  return process.platform === "win32" ? "node.exe" : "node";
}

function npmExecutableName() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function shellForPlatform(effectivePlatform) {
  return effectivePlatform === "wsl" || process.platform === "win32";
}

module.exports = {
  WSL_BOOTSTRAP_TIMEOUT_MS,
  gitAvailable,
  manifestPlatformKey,
  nodeExecutableName,
  normalizeUnixScript,
  npmExecutableName,
  probeWslPythonModule,
  probeWslPythonCode,
  probeWslWanReady,
  probeWslRenderStack,
  resolveEffectivePlatform,
  runWslBootstrap,
  runWslLinuxOptionalInstall,
  shellForPlatform,
  shellQuoteBash,
  windowsPathToWsl,
  wslTensornvmeEnvPrelude,
  wslAvailable,
  wslVenvExists,
};
