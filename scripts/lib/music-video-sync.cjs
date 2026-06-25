/**
 * Music video sync — librosa beat analysis via managed Python venv.
 */
const fs = require("fs");
const path = require("path");
const { execLocal } = require("./process-exec.cjs");
const { resolveBundledScript } = require("./install-console.cjs");
const { fileExists, requireManagedVenvPython } = require("./addon-paths.cjs");

const SCRIPT_RELATIVE = "scripts/run-music-video-sync.py";

function resolveMusicVideoSyncScript() {
  const candidates = [
    resolveBundledScript(SCRIPT_RELATIVE),
    path.join(__dirname, "..", "run-music-video-sync.py"),
    path.join(process.resourcesPath || "", "app.asar.unpacked", SCRIPT_RELATIVE),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fileExists(candidate)) return candidate;
  }
  return null;
}

/**
 * @param {object} params
 * @param {string} params.audioPath
 * @param {string} params.userDataPath
 * @param {number} [params.rangeStart]
 * @param {number} [params.rangeEnd]
 */
async function analyzeMusicVideoBeats({
  audioPath,
  userDataPath,
  rangeStart = 0,
  rangeEnd = -1,
  minSec,
  maxSec,
  maxClips,
}) {
  const scriptPath = resolveMusicVideoSyncScript();
  if (!scriptPath) {
    return { ok: false, error: "run-music-video-sync.py not found in app bundle" };
  }
  if (!fileExists(audioPath)) {
    return { ok: false, error: `Audio file not found: ${audioPath}` };
  }

  let pythonPath;
  try {
    pythonPath = requireManagedVenvPython(userDataPath, true);
  } catch (err) {
    return { ok: false, error: err?.message || "Managed venv required for music video sync" };
  }

  const args = [scriptPath, "--audio", audioPath, "--range-start", String(rangeStart)];
  if (Number(rangeEnd) >= 0) {
    args.push("--range-end", String(rangeEnd));
  }
  if (Number(minSec) > 0) {
    args.push("--min-sec", String(minSec));
  }
  if (Number(maxSec) > 0) {
    args.push("--max-sec", String(maxSec));
  }
  if (Number(maxClips) > 0) {
    args.push("--max-clips", String(maxClips));
  }

  try {
    const { stdout } = await execLocal(pythonPath, args, { timeout: 300000 });
    const parsed = JSON.parse(String(stdout || "").trim() || "{}");
    if (!parsed.ok) {
      return { ok: false, error: parsed.error || "librosa analysis failed" };
    }
    return parsed;
  } catch (err) {
    return { ok: false, error: err?.message || "music video sync analysis failed" };
  }
}

async function probeMusicVideoSyncReady(userDataPath) {
  const scriptPath = resolveMusicVideoSyncScript();
  if (!scriptPath) {
    return { ok: false, error: "run-music-video-sync.py missing from bundle" };
  }
  try {
    const pythonPath = requireManagedVenvPython(userDataPath, true);
    await execLocal(pythonPath, ["-c", "import librosa, soundfile"], { timeout: 30000 });
    return { ok: true, path: scriptPath, message: "Music video sync (librosa) ready" };
  } catch (err) {
    return { ok: false, error: err?.message || "librosa not available in managed venv" };
  }
}

module.exports = {
  analyzeMusicVideoBeats,
  probeMusicVideoSyncReady,
  resolveMusicVideoSyncScript,
};
