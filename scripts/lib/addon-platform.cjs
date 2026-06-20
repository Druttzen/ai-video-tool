/**
 * Platform detection for managed addon installs (Windows, Linux, macOS, WSL).
 */
const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

async function wslAvailable() {
  if (process.platform !== "win32") return false;
  try {
    await execFileAsync("wsl", ["--status"], { timeout: 8000, shell: true });
    return true;
  } catch {
    try {
      await execFileAsync("wsl", ["-l", "-v"], { timeout: 8000, shell: true });
      return true;
    } catch {
      return false;
    }
  }
}

async function gitAvailable() {
  try {
    await execFileAsync("git", ["--version"], { timeout: 5000, shell: process.platform === "win32" });
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
  gitAvailable,
  manifestPlatformKey,
  nodeExecutableName,
  npmExecutableName,
  resolveEffectivePlatform,
  shellForPlatform,
  wslAvailable,
};
