/**
 * Main-process IPC validation — path allowlists, safe spawns, external URLs.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const SHELL_META_RE = /[;&|`$<>]/;
const BUNDLE_FILE_RE = /\.(json|aivbundle\.json)$/i;
const VIDEO_EXT_RE = /\.(mp4|mov|webm|mkv|m4v)$/i;
const AUDIO_EXT_RE = /\.(wav|mp3|flac|ogg|m4a|aac)$/i;
/** ~48 MB — keeps IPC beat-analysis payloads bounded for long tracks. */
const MUSIC_VIDEO_MAX_AUDIO_BYTES = 48 * 1024 * 1024;

function normalizeResolvedPath(filePath) {
  return path.resolve(String(filePath || "").trim());
}

function isPathUnderRoot(resolved, root) {
  const rootResolved = path.resolve(root);
  const relative = path.relative(rootResolved, resolved);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isPathUnderAnyRoot(resolved, roots) {
  return roots.some((root) => isPathUnderRoot(resolved, root));
}

function isAllowedBundleFilename(resolved) {
  const lower = resolved.toLowerCase();
  return (
    lower.endsWith(".aivbundle.json") ||
    (lower.endsWith(".json") && lower.includes("bundle"))
  );
}

function createBundlePathGuard() {
  const allowed = new Set();

  return {
    register(filePath) {
      if (!filePath) return;
      try {
        allowed.add(path.resolve(String(filePath)));
      } catch {
        /* ignore invalid paths */
      }
    },
    validate(filePath, { pendingPath } = {}) {
      const resolved = normalizeResolvedPath(filePath);
      if (!isAllowedBundleFilename(resolved)) {
        return {
          ok: false,
          error: "Bundle file must be *.aivbundle.json or a *bundle*.json file",
        };
      }
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        return { ok: false, error: `Bundle not found: ${resolved}` };
      }
      const pending = pendingPath ? path.resolve(pendingPath) : null;
      if (!allowed.has(resolved) && resolved !== pending) {
        return { ok: false, error: "Bundle path not authorized for import" };
      }
      return { ok: true, resolved };
    },
  };
}

function isAllowedExternalUrl(urlString) {
  try {
    const parsed = new URL(String(urlString || "").trim());
    return ["http:", "https:", "mailto:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function resolveSafeExecutable(exePath, fallback = "python") {
  const raw = String(exePath || fallback).trim();
  if (!raw) return { ok: false, error: "Empty executable path" };
  if (SHELL_META_RE.test(raw) || /[\r\n]/.test(raw)) {
    return { ok: false, error: "Invalid executable path characters" };
  }

  const isBareCommand =
    !path.isAbsolute(raw) && !raw.includes(path.sep) && !raw.includes("/") && !raw.includes("\\");
  if (isBareCommand) {
    return { ok: true, executable: raw };
  }

  const resolved = path.isAbsolute(raw) ? raw : path.resolve(raw);
  if (!fs.existsSync(resolved)) {
    return { ok: false, error: `Executable not found: ${resolved}` };
  }
  if (!fs.statSync(resolved).isFile()) {
    return { ok: false, error: `Executable is not a file: ${resolved}` };
  }
  return { ok: true, executable: resolved };
}

function getMediaPathRoots(userDataPath) {
  const userRoot = path.resolve(String(userDataPath || ""));
  return [
    userRoot,
    os.tmpdir(),
    path.join(userRoot, "video-jobs"),
    path.join(userRoot, "open-sora-jobs"),
    path.join(userRoot, "music-video"),
  ].map((entry) => path.resolve(entry));
}

function assertExistingMediaFile(resolved, { video = false, audio = false } = {}) {
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return { ok: false, error: `File not found: ${resolved}` };
  }
  const lower = resolved.toLowerCase();
  if (video && !VIDEO_EXT_RE.test(lower)) {
    return { ok: false, error: `Clip must be a video file: ${resolved}` };
  }
  if (audio && !AUDIO_EXT_RE.test(lower) && !lower.includes("mv-audio-")) {
    return { ok: false, error: `Audio path must be a supported audio file: ${resolved}` };
  }
  return { ok: true };
}

function validateMusicVideoAssemblePaths({ clipPaths, audioPath, outputPath, userDataPath }) {
  const roots = getMediaPathRoots(userDataPath);
  const clips = Array.isArray(clipPaths) ? clipPaths : [];
  if (!clips.length) {
    return { ok: false, error: "clipPaths array required" };
  }

  for (const clip of clips) {
    const resolved = normalizeResolvedPath(clip);
    if (!isPathUnderAnyRoot(resolved, roots)) {
      return { ok: false, error: `Clip path not allowed: ${resolved}` };
    }
    const clipCheck = assertExistingMediaFile(resolved, { video: true });
    if (!clipCheck.ok) return clipCheck;
  }

  const audioResolved = normalizeResolvedPath(audioPath);
  if (!isPathUnderAnyRoot(audioResolved, roots)) {
    return { ok: false, error: `Audio path not allowed: ${audioResolved}` };
  }
  const audioCheck = assertExistingMediaFile(audioResolved, { audio: true });
  if (!audioCheck.ok) return audioCheck;

  const outputResolved = normalizeResolvedPath(outputPath);
  if (!isPathUnderAnyRoot(outputResolved, roots)) {
    return { ok: false, error: `Output path not allowed: ${outputResolved}` };
  }
  if (!VIDEO_EXT_RE.test(outputResolved.toLowerCase())) {
    return { ok: false, error: "Output path must be a .mp4 file" };
  }

  return { ok: true };
}

function validateMusicVideoAudioBuffer(audioBuffer) {
  const bytes = audioBuffer?.byteLength ?? 0;
  if (!bytes) {
    return { ok: false, error: "Audio buffer required for beat analysis" };
  }
  if (bytes > MUSIC_VIDEO_MAX_AUDIO_BYTES) {
    return {
      ok: false,
      error: `Audio buffer too large (${Math.round(bytes / (1024 * 1024))} MB). Max ${Math.round(MUSIC_VIDEO_MAX_AUDIO_BYTES / (1024 * 1024))} MB for beat analysis — trim range or use a shorter clip.`,
    };
  }
  return { ok: true };
}

function validateRevealPath(filePath, { userDataPath } = {}) {
  const resolved = normalizeResolvedPath(filePath);
  if (!fs.existsSync(resolved)) {
    return { ok: false, error: "Path not found" };
  }
  const roots = getMediaPathRoots(userDataPath);
  if (!isPathUnderAnyRoot(resolved, roots)) {
    return { ok: false, error: "Path not allowed for reveal" };
  }
  return { ok: true, resolved };
}

module.exports = {
  BUNDLE_FILE_RE,
  MUSIC_VIDEO_MAX_AUDIO_BYTES,
  createBundlePathGuard,
  getMediaPathRoots,
  isAllowedBundleFilename,
  isAllowedExternalUrl,
  isPathUnderAnyRoot,
  isPathUnderRoot,
  resolveSafeExecutable,
  validateMusicVideoAssemblePaths,
  validateMusicVideoAudioBuffer,
  validateRevealPath,
};
