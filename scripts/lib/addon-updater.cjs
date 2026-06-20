/**
 * Check and install updates for Open-Sora, bundled Python, and FFmpeg addons.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const http = require("http");
const { execFile, spawn } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const MANIFEST_PATH = path.join(__dirname, "..", "..", "data", "addon-updates-manifest.json");

function loadAddonManifest() {
  const raw = fs.readFileSync(MANIFEST_PATH, "utf8");
  return JSON.parse(raw);
}

function getAddonsRoot(userDataPath) {
  return path.join(userDataPath, "addons");
}

function getManagedPythonDir(userDataPath, version) {
  return path.join(getAddonsRoot(userDataPath), "python", String(version || "embed"));
}

function getManagedFfmpegDir(userDataPath, version) {
  return path.join(getAddonsRoot(userDataPath), "ffmpeg", String(version || "bundled"));
}

function parseSemver(input) {
  const match = String(input || "").match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return { major: +match[1], minor: +match[2], patch: +match[3], raw: match[0] };
}

function compareSemver(a, b) {
  const va = parseSemver(a);
  const vb = parseSemver(b);
  if (!va && !vb) return 0;
  if (!va) return -1;
  if (!vb) return 1;
  if (va.major !== vb.major) return va.major - vb.major;
  if (va.minor !== vb.minor) return va.minor - vb.minor;
  return va.patch - vb.patch;
}

function downloadFile(url, destPath, redirectLimit = 5) {
  return new Promise((resolve, reject) => {
    if (redirectLimit <= 0) {
      reject(new Error("Too many redirects"));
      return;
    }
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        downloadFile(res.headers.location, destPath, redirectLimit - 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed (${res.statusCode}): ${url}`));
        res.resume();
        return;
      }
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve(destPath)));
      file.on("error", reject);
    });
    req.on("error", reject);
  });
}

async function runGit(args, cwd) {
  return execFileAsync("git", args, {
    cwd,
    timeout: 120000,
    shell: process.platform === "win32",
  });
}

async function gitAvailable() {
  try {
    await execFileAsync("git", ["--version"], { timeout: 5000, shell: process.platform === "win32" });
    return true;
  } catch {
    return false;
  }
}

async function getOpenSoraGitState(installPath) {
  const target = String(installPath || "").trim();
  if (!target) return { installed: false };
  const gitDir = path.join(target, ".git");
  if (!fs.existsSync(gitDir)) {
    return { installed: fs.existsSync(target), isGit: false, path: target };
  }
  try {
    const { stdout: head } = await runGit(["rev-parse", "HEAD"], target);
    const { stdout: branch } = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], target);
    let remoteHead = null;
    try {
      const remote = await runGit(["ls-remote", "origin", "HEAD"], target);
      remoteHead = remote.stdout.trim().split(/\s+/)[0] || null;
    } catch {
      /* offline */
    }
    return {
      installed: true,
      isGit: true,
      path: target,
      localHead: head.trim(),
      branch: branch.trim(),
      remoteHead,
      updateAvailable: Boolean(remoteHead && head.trim() !== remoteHead),
    };
  } catch (e) {
    return { installed: true, isGit: true, path: target, error: e?.message || "git read failed" };
  }
}

async function pipInstallRequirements(pythonPath, installPath, requirementsFile) {
  const req = path.join(installPath, requirementsFile);
  if (!fs.existsSync(req)) return { ok: true, skipped: true, message: "No requirements file" };
  await execFileAsync(
    pythonPath,
    ["-m", "pip", "install", "-r", req],
    { cwd: installPath, timeout: 600000, shell: process.platform === "win32" },
  );
  return { ok: true, message: `pip install -r ${requirementsFile}` };
}

async function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  if (process.platform === "win32") {
    await execFileAsync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
      ],
      { timeout: 120000 },
    );
    return;
  }
  await execFileAsync("unzip", ["-o", zipPath, "-d", destDir], { timeout: 120000 });
}

function findFileRecursive(root, fileName, depth = 0) {
  if (depth > 6 || !fs.existsSync(root)) return null;
  const direct = path.join(root, fileName);
  if (fs.existsSync(direct)) return direct;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const found = findFileRecursive(path.join(root, entry.name), fileName, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * @param {object} params
 * @param {object} params.scan
 * @param {string} params.userDataPath
 * @param {string} [params.openSoraPath]
 */
async function checkAddonUpdates({ scan, userDataPath, openSoraPath }) {
  const manifest = loadAddonManifest();
  const items = [];

  const oSoraPath =
    openSoraPath || scan?.openSora?.path || scan?.pipeline?.path || "";
  const gitState = await getOpenSoraGitState(oSoraPath);
  items.push({
    id: "open-sora",
    label: manifest.addons["open-sora"].label,
    installed: gitState.installed,
    currentVersion: gitState.localHead?.slice(0, 8) || null,
    latestVersion: gitState.remoteHead?.slice(0, 8) || manifest.addons["open-sora"].branch,
    updateAvailable: !gitState.installed || gitState.updateAvailable || !gitState.isGit,
    message: !gitState.installed
      ? "Not installed — clone available"
      : gitState.updateAvailable
        ? "Git update available (pull)"
        : gitState.isGit
          ? "Up to date"
          : "Folder exists but is not a git repo — re-clone recommended",
    path: oSoraPath || null,
  });

  const pyManifest = manifest.addons.python;
  const currentPy = scan?.python?.version || "";
  const belowMinimum = compareSemver(currentPy, pyManifest.minimumVersion) < 0;
  const embed = pyManifest.embed?.[process.platform];
  const managedPy = embed ? getManagedPythonDir(userDataPath, embed.version) : null;
  const managedExe =
    managedPy && embed ? path.join(managedPy, embed.executable || "python.exe") : null;
  const hasManagedEmbed = Boolean(managedExe && fs.existsSync(managedExe));
  items.push({
    id: "python",
    label: pyManifest.label,
    installed: Boolean(scan?.python?.ok),
    currentVersion: currentPy || null,
    latestVersion: pyManifest.recommendedVersion,
    updateAvailable:
      !scan?.python?.ok ||
      belowMinimum ||
      (embed && process.platform === "win32" && !hasManagedEmbed && belowMinimum),
    message: !scan?.python?.ok
      ? "Python not detected — embed install available on Windows"
      : belowMinimum
        ? `Below minimum ${pyManifest.minimumVersion}`
        : "Version OK",
    path: scan?.python?.path || (hasManagedEmbed ? managedExe : null),
    embedUrl: embed?.url || null,
  });

  const ffManifest = manifest.addons.ffmpeg.builds?.[process.platform];
  const managedFfDir = ffManifest ? getManagedFfmpegDir(userDataPath, ffManifest.version) : null;
  const managedFf =
    managedFfDir && ffManifest
      ? findFileRecursive(managedFfDir, ffManifest.zipExecutable || "ffmpeg.exe")
      : null;
  items.push({
    id: "ffmpeg",
    label: manifest.addons.ffmpeg.label,
    installed: Boolean(scan?.ffmpeg?.ok),
    currentVersion: scan?.ffmpeg?.bundled ? ffManifest?.version : scan?.ffmpeg?.ok ? "path" : null,
    latestVersion: ffManifest?.version || null,
    updateAvailable:
      Boolean(ffManifest) &&
      (!scan?.ffmpeg?.ok || !scan?.ffmpeg?.bundled) &&
      process.platform === "win32",
    message: scan?.ffmpeg?.ok
      ? scan.ffmpeg.bundled
        ? "Bundled addon installed"
        : "Using PATH ffmpeg"
      : ffManifest
        ? "Download static build available"
        : "Optional — manual install",
    path: scan?.ffmpeg?.path || managedFf,
  });

  return { ok: true, checkedAt: new Date().toISOString(), items };
}

async function updateOpenSora({ installPath, userDataPath, pythonPath, manifest }) {
  const cfg = manifest.addons["open-sora"];
  const target = String(installPath || "").trim() || path.join(os.homedir(), "Open-Sora");

  if (!(await gitAvailable())) {
    return { ok: false, error: "Git is required to update Open-Sora — install Git for Windows" };
  }

  if (fs.existsSync(path.join(target, ".git"))) {
    await runGit(["fetch", "origin"], target);
    await runGit(["pull", "--ff-only", "origin", cfg.branch], target);
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
      return { ok: false, error: `Path not empty and not a git repo: ${target}` };
    }
    await runGit(["clone", "--depth", "1", "--branch", cfg.branch, cfg.repo, target], path.dirname(target) || ".");
  }

  let pipResult = null;
  if (pythonPath && cfg.requirementsFile) {
    try {
      pipResult = await pipInstallRequirements(pythonPath, target, cfg.requirementsFile);
    } catch (e) {
      pipResult = { ok: false, error: e?.message || "pip failed" };
    }
  }

  return {
    ok: true,
    path: target,
    message: "Open-Sora updated",
    pip: pipResult,
  };
}

async function updatePythonEmbed({ userDataPath, manifest }) {
  const embed = manifest.addons.python.embed?.[process.platform];
  if (!embed?.url || !embed.executable) {
    return {
      ok: false,
      error: embed?.note || "Embeddable Python auto-install is only supported on Windows",
    };
  }

  const destRoot = getManagedPythonDir(userDataPath, embed.version);
  const zipPath = path.join(getAddonsRoot(userDataPath), "cache", `python-${embed.version}.zip`);
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });

  await downloadFile(embed.url, zipPath);
  if (fs.existsSync(destRoot)) {
    fs.rmSync(destRoot, { recursive: true, force: true });
  }
  await extractZip(zipPath, destRoot);

  const exePath = findFileRecursive(destRoot, embed.executable);
  if (!exePath) {
    return { ok: false, error: `Python executable not found after extract in ${destRoot}` };
  }

  return {
    ok: true,
    path: exePath,
    version: embed.version,
    message: `Python ${embed.version} embed installed`,
  };
}

async function updateFfmpeg({ userDataPath, manifest }) {
  const build = manifest.addons.ffmpeg.builds?.[process.platform];
  if (!build?.url) {
    return { ok: false, error: "FFmpeg auto-install not configured for this platform" };
  }

  const destRoot = getManagedFfmpegDir(userDataPath, build.version);
  const zipPath = path.join(getAddonsRoot(userDataPath), "cache", `ffmpeg-${build.version}.zip`);
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });

  await downloadFile(build.url, zipPath);
  if (fs.existsSync(destRoot)) {
    fs.rmSync(destRoot, { recursive: true, force: true });
  }
  await extractZip(zipPath, destRoot);

  const exePath = findFileRecursive(destRoot, build.zipExecutable || "ffmpeg.exe");
  if (!exePath) {
    return { ok: false, error: `ffmpeg not found after extract in ${destRoot}` };
  }

  return {
    ok: true,
    path: exePath,
    version: build.version,
    message: `FFmpeg ${build.version} installed`,
  };
}

/**
 * @param {object} params
 * @param {string} params.addonId
 * @param {string} params.userDataPath
 * @param {object} [params.scan]
 * @param {string} [params.openSoraPath]
 * @param {string} [params.pythonPath]
 */
async function updateAddon({ addonId, userDataPath, scan, openSoraPath, pythonPath }) {
  const manifest = loadAddonManifest();
  const id = String(addonId || "").trim();

  if (id === "open-sora") {
    return updateOpenSora({
      installPath: openSoraPath || scan?.openSora?.path,
      userDataPath,
      pythonPath: pythonPath || scan?.python?.path,
      manifest,
    });
  }
  if (id === "python") {
    return updatePythonEmbed({ userDataPath, manifest });
  }
  if (id === "ffmpeg") {
    return updateFfmpeg({ userDataPath, manifest });
  }
  return { ok: false, error: `Unknown addon: ${id}` };
}

async function updateAllAddons(params) {
  const check = await checkAddonUpdates(params);
  const results = [];
  for (const item of check.items) {
    if (!item.updateAvailable) {
      results.push({ id: item.id, ok: true, skipped: true, message: item.message });
      continue;
    }
    const result = await updateAddon({ addonId: item.id, ...params });
    results.push({ id: item.id, ...result });
  }
  return { ok: results.every((r) => r.ok || r.skipped), results };
}

function getManagedAddonPaths(userDataPath) {
  if (!userDataPath) return {};
  let manifest;
  try {
    manifest = loadAddonManifest();
  } catch {
    return {};
  }
  const out = {};
  const py = manifest.addons?.python?.embed?.[process.platform];
  if (py?.version) {
    const dir = getManagedPythonDir(userDataPath, py.version);
    const exe = findFileRecursive(dir, py.executable || "python.exe");
    if (exe) out.pythonPath = exe;
  }
  const ff = manifest.addons?.ffmpeg?.builds?.[process.platform];
  if (ff?.version) {
    const dir = getManagedFfmpegDir(userDataPath, ff.version);
    const exe = findFileRecursive(dir, ff.zipExecutable || "ffmpeg.exe");
    if (exe) out.ffmpegPath = exe;
  }
  return out;
}

module.exports = {
  checkAddonUpdates,
  compareSemver,
  getManagedAddonPaths,
  loadAddonManifest,
  updateAddon,
  updateAllAddons,
};
