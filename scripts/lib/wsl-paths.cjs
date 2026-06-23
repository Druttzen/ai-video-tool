/**
 * Portable WSL path resolution for Node-side pipeline helpers.
 */
const fs = require("fs");
const path = require("path");
const { getAddonsRoot, getManagedOpenSoraDir, getManagedWslVenvDir } = require("./addon-paths.cjs");
const { resolveUserDataPath } = require("./open-sora-paths.cjs");

function winPathToWsl(mixedPath) {
  const normalized = path.resolve(String(mixedPath || "")).replace(/\\/g, "/");
  const match = normalized.match(/^([A-Za-z]):\/*(.*)/);
  if (!match) return normalized;
  return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
}

function shellQuoteBash(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function getUserDataPathWin() {
  return resolveUserDataPath(getRepoRootWin());
}

function getRepoRootWin() {
  if (process.env.AI_VIDEO_TOOL_REPO) {
    return path.resolve(process.env.AI_VIDEO_TOOL_REPO);
  }
  return path.join(__dirname, "..", "..");
}

function getRepoRootWsl() {
  return winPathToWsl(getRepoRootWin());
}

function getAddonsRootWin() {
  if (process.env.ADDONS_ROOT) {
    return path.resolve(process.env.ADDONS_ROOT);
  }
  const userData = getUserDataPathWin();
  if (userData) {
    return getAddonsRoot(userData);
  }
  const home = process.env.USERPROFILE || process.env.HOME || "";
  return path.join(home, ".ai-video-creator", "addons");
}

function getAddonsRootWsl() {
  return winPathToWsl(getAddonsRootWin());
}

function getVenvDirWsl() {
  if (process.env.VENV_DIR) {
    return winPathToWsl(process.env.VENV_DIR);
  }
  return `${getAddonsRootWsl()}/wsl-venv`;
}

function getVenvActivateWsl() {
  return `${getVenvDirWsl()}/bin/activate`;
}

function getWslPyWsl() {
  if (process.env.WSL_PY) {
    return winPathToWsl(process.env.WSL_PY);
  }
  return `${getVenvDirWsl()}/bin/python3`;
}

function getOpenSoraDirWsl() {
  if (process.env.OPEN_SORA_DIR) {
    return winPathToWsl(process.env.OPEN_SORA_DIR);
  }
  const userData = getUserDataPathWin();
  if (userData) {
    return winPathToWsl(getManagedOpenSoraDir(userData));
  }
  return `${getAddonsRootWsl()}/open-sora`;
}

function getOpensoraStubPathWsl() {
  const repoRoot = getRepoRootWsl();
  return `${repoRoot}/scripts/opensora-stub-paths/tensornvme:${repoRoot}/scripts/opensora-stub-paths/flash_attn`;
}

function getWslPathsScriptWsl() {
  return `${getRepoRootWsl()}/scripts/wsl-paths.sh`;
}

function wslTensornvmeEnvPrelude() {
  return 'export LD_LIBRARY_PATH="${HOME}/.tensornvme/lib:${LD_LIBRARY_PATH:-}"';
}

function wslSourcePathsPrelude() {
  return `. ${shellQuoteBash(getWslPathsScriptWsl())}`;
}

function wslPathsExist() {
  return fs.existsSync(path.join(getRepoRootWin(), "scripts", "wsl-paths.sh"));
}

module.exports = {
  getAddonsRootWsl,
  getAddonsRootWin,
  getOpenSoraDirWsl,
  getOpensoraStubPathWsl,
  getRepoRootWsl,
  getRepoRootWin,
  getUserDataPathWin,
  getVenvActivateWsl,
  getVenvDirWsl,
  getWslPathsScriptWsl,
  getWslPyWsl,
  shellQuoteBash,
  winPathToWsl,
  wslPathsExist,
  wslSourcePathsPrelude,
  wslTensornvmeEnvPrelude,
};
