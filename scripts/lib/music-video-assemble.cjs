/**
 * FFmpeg concat + audio mux for beat-sync music video assembly.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execLocal } = require("./process-exec.cjs");
const { fileExists } = require("./addon-paths.cjs");
const { getManagedAddonPaths } = require("./addon-updater.cjs");

function resolveFfmpegExecutable(userDataPath) {
  const managed = getManagedAddonPaths(userDataPath);
  if (managed.ffmpegPath && fileExists(managed.ffmpegPath)) {
    return managed.ffmpegPath;
  }
  return "ffmpeg";
}

function quoteCmdPath(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

/**
 * @param {object} params
 * @param {string[]} params.clipPaths
 * @param {string} params.audioPath
 * @param {string} params.outputPath
 * @param {string} params.userDataPath
 */
async function assembleMusicVideo({ clipPaths, audioPath, outputPath, userDataPath }) {
  const clips = (clipPaths || []).filter((p) => fileExists(p));
  if (!clips.length) {
    return { ok: false, error: "No clip video files found to assemble" };
  }
  if (!fileExists(audioPath)) {
    return { ok: false, error: `Audio track not found: ${audioPath}` };
  }

  const ffmpeg = resolveFfmpegExecutable(userDataPath);
  const workDir = path.join(os.tmpdir(), `mv-assemble-${Date.now()}`);
  fs.mkdirSync(workDir, { recursive: true });
  const listPath = path.join(workDir, "clips.txt");
  const concatPath = path.join(workDir, "concat.mp4");
  fs.writeFileSync(
    listPath,
    clips.map((clip) => `file ${quoteCmdPath(path.resolve(clip))}`).join("\n"),
    "utf8",
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  try {
    await execLocal(
      ffmpeg,
      ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", concatPath],
      { timeout: 600000 },
    );
    await execLocal(
      ffmpeg,
      [
        "-y",
        "-i",
        concatPath,
        "-i",
        audioPath,
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-shortest",
        outputPath,
      ],
      { timeout: 600000 },
    );
    return {
      ok: true,
      path: outputPath,
      clipCount: clips.length,
      message: `Assembled ${clips.length} clip(s) with audio`,
    };
  } catch (err) {
    return { ok: false, error: err?.message || "FFmpeg assemble failed" };
  } finally {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

module.exports = {
  assembleMusicVideo,
  resolveFfmpegExecutable,
};
