/**
 * Sync, check, and install managed addons under Electron userData.
 * All runtime deps (Python, venv, Open-Sora, pip, FFmpeg, models) live in {userData}/addons/.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const http = require("http");
const crypto = require("crypto");
const { execFile, spawn } = require("child_process");
const { promisify } = require("util");
const { execLocal } = require("./process-exec.cjs");
const {
  countModelArtifacts,
  fileExists,
  getAddonsCacheDir,
  getAddonsRoot,
  getBundledOptionalRequirementsPath,
  getBundledRequirementsTemplatePath,
  getManagedWslBootstrapCopyPath,
  getManagedFfmpegDir,
  getManagedModelsDir,
  getManagedNodeDir,
  getManagedOpenSoraDir,
  getManagedPythonDir,
  getManagedRequirementsMetaPath,
  getManagedRequirementsPath,
  getManagedVenvDir,
  getManagedWslVenvDir,
  getVenvPythonPath,
  getWslBootstrapScriptPath,
  getWslVenvPythonPath,
  requireManagedVenvPython,
} = require("./addon-paths.cjs");
const {
  gitAvailable,
  manifestPlatformKey,
  normalizeUnixScript,
  probeWslPythonModule,
  runWslBootstrap,
  wslAvailable,
  wslVenvExists,
} = require("./addon-platform.cjs");

const execFileAsync = promisify(execFile);

const MANIFEST_PATH = path.join(__dirname, "..", "..", "data", "addon-updates-manifest.json");

function loadAddonManifest() {
  const raw = fs.readFileSync(MANIFEST_PATH, "utf8");
  return JSON.parse(raw);
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

const DOWNLOAD_TIMEOUT_MS = 600000;
const PIP_Package_BLOCKLIST = new Set(["opensora", "open-sora"]);

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
    req.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
      req.destroy(new Error(`Download timeout after ${DOWNLOAD_TIMEOUT_MS}ms: ${url}`));
    });
    req.on("error", reject);
  });
}

function venvEnv(userDataPath) {
  return { ...process.env, VIRTUAL_ENV: getManagedVenvDir(userDataPath) };
}

async function runPython(pythonPath, args, { timeout = 900000, userDataPath = null } = {}) {
  await execFileAsync(pythonPath, args, {
    timeout,
    shell: false,
    env: userDataPath ? venvEnv(userDataPath) : process.env,
  });
}

function filterPipRequirementLines(lines) {
  return lines.filter((line) => !PIP_Package_BLOCKLIST.has(packageKey(line)));
}

async function runGit(args, cwd) {
  return execLocal("git", args, {
    cwd,
    timeout: 120000,
  });
}

function findFileRecursive(root, fileName, depth = 0) {
  if (depth > 6 || !fileExists(root)) return null;
  const direct = path.join(root, fileName);
  if (fileExists(direct)) return direct;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const found = findFileRecursive(path.join(root, entry.name), fileName, depth + 1);
    if (found) return found;
  }
  return null;
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

async function extractTarArchive(archivePath, destDir, flags) {
  fs.mkdirSync(destDir, { recursive: true });
  await execLocal("tar", [...flags, archivePath, "-C", destDir], {
    timeout: 300000,
  });
}

async function extractArchive(archivePath, destDir, archiveType) {
  const kind = String(archiveType || "zip").toLowerCase();
  if (kind === "zip") return extractZip(archivePath, destDir);
  if (kind === "tar.gz" || kind === "tgz") return extractTarArchive(archivePath, destDir, ["-xzf"]);
  if (kind === "tar.xz") return extractTarArchive(archivePath, destDir, ["-xJf"]);
  throw new Error(`Unsupported archive type: ${archiveType}`);
}

function resolveEmbedExecutable(destRoot, embed) {
  if (embed.executable.includes("/") || embed.executable.includes("\\")) {
    const direct = path.join(destRoot, embed.executable);
    if (fileExists(direct)) return direct;
  }
  return findFileRecursive(destRoot, path.basename(embed.executable));
}

function readRequirementsLines(filePath) {
  if (!fileExists(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function packageKey(line) {
  return line
    .split(";")[0]
    .trim()
    .split(/[<>=![\[]/)[0]
    .trim()
    .toLowerCase();
}

function mergeRequirementLines(...sources) {
  const seen = new Set();
  const merged = [];
  for (const lines of sources) {
    for (const line of lines) {
      const key = packageKey(line);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(line);
    }
  }
  return merged;
}

function hashRequirements(lines) {
  return crypto.createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 16);
}

/**
 * Merge bundled template + Open-Sora requirements → userData/addons/requirements.txt
 */
function syncAddonRequirements(userDataPath, { openSoraPath } = {}) {
  const templatePath = getBundledRequirementsTemplatePath();
  const openSoraReq = openSoraPath
    ? path.join(openSoraPath, "requirements.txt")
    : path.join(getManagedOpenSoraDir(userDataPath), "requirements.txt");

  const templateLines = filterPipRequirementLines(readRequirementsLines(templatePath));
  const openSoraLines = filterPipRequirementLines(readRequirementsLines(openSoraReq));
  const merged = mergeRequirementLines(templateLines, openSoraLines);
  const dest = getManagedRequirementsPath(userDataPath);
  const metaPath = getManagedRequirementsMetaPath(userDataPath);

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const header = [
    "# Auto-generated by AI Video Creator — do not edit manually",
    `# Synced: ${new Date().toISOString()}`,
    `# Sources: ${path.basename(templatePath)}${openSoraLines.length ? " + Open-Sora/requirements.txt" : ""}`,
    "",
  ];
  fs.writeFileSync(dest, `${header.join("\n")}${merged.join("\n")}\n`, "utf8");

  const meta = {
    syncedAt: new Date().toISOString(),
    hash: hashRequirements(merged),
    sources: {
      bundled: templatePath,
      openSora: fileExists(openSoraReq) ? openSoraReq : null,
    },
    lineCount: merged.length,
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");

  return { ok: true, path: dest, meta, message: `Synced ${merged.length} requirement lines` };
}

function readRequirementsMeta(userDataPath) {
  const metaPath = getManagedRequirementsMetaPath(userDataPath);
  if (!fileExists(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch {
    return null;
  }
}

function requirementsNeedsSync(userDataPath) {
  const dest = getManagedRequirementsPath(userDataPath);
  if (!fileExists(dest)) return true;

  const templateLines = readRequirementsLines(getBundledRequirementsTemplatePath());
  const openSoraLines = readRequirementsLines(
    path.join(getManagedOpenSoraDir(userDataPath), "requirements.txt"),
  );
  const expectedHash = hashRequirements(mergeRequirementLines(templateLines, openSoraLines));
  const meta = readRequirementsMeta(userDataPath);
  return !meta || meta.hash !== expectedHash;
}

async function probePythonModule(pythonPath, moduleName) {
  try {
    await execLocal(pythonPath, ["-c", `import ${moduleName}`], { timeout: 15000 });
    return true;
  } catch {
    return false;
  }
}

async function probePipAvailable(pythonPath) {
  try {
    await execLocal(pythonPath, ["-m", "pip", "--version"], { timeout: 60000 });
    return true;
  } catch {
    return false;
  }
}

async function probePythonExecutable(pythonPath) {
  const target = String(pythonPath || "").trim();
  if (!target) return { ok: false, error: "Python path empty" };
  try {
    const { stdout } = await execLocal(target, ["--version"], { timeout: 8000 });
    const raw = String(stdout || "").trim();
    return {
      ok: true,
      path: target,
      version: raw.replace(/^Python\s+/i, "") || raw,
    };
  } catch (e) {
    return { ok: false, path: target, error: e?.message || "Python not found" };
  }
}

async function getOpenSoraGitState(installPath) {
  const target = String(installPath || "").trim();
  if (!target) return { installed: false };
  const gitDir = path.join(target, ".git");
  if (!fileExists(gitDir)) {
    return { installed: fileExists(target), isGit: false, path: target };
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

function configureEmbedPythonPath(pythonDir) {
  const pthName = fs.readdirSync(pythonDir).find((name) => /^python\d+\._pth$/i.test(name));
  if (!pthName) return;
  const pthPath = path.join(pythonDir, pthName);
  let content = fs.readFileSync(pthPath, "utf8");
  if (!/^import site/m.test(content)) {
    content = content.replace(/\r?\n?$/, "\nimport site\n");
  }
  if (!/\.\/Lib\/site-packages/m.test(content)) {
    content = content.replace(/\r?\n?$/, "\n./Lib/site-packages\n");
  }
  fs.writeFileSync(pthPath, content, "utf8");
}

function readWslBootstrapScriptContent() {
  const candidates = [
    getWslBootstrapScriptPath(),
    path.join(process.resourcesPath || "", "app.asar.unpacked", "scripts", "wsl-addon-bootstrap.sh"),
    path.join(__dirname, "..", "wsl-addon-bootstrap.sh"),
  ].filter(Boolean);

  for (const src of candidates) {
    if (fileExists(src)) {
      return normalizeUnixScript(fs.readFileSync(src, "utf8"));
    }
  }
  throw new Error("wsl-addon-bootstrap.sh not found in app bundle");
}

function materializeWslBootstrapScript(userDataPath, scriptContent) {
  const dest = getManagedWslBootstrapCopyPath(userDataPath);
  const content = normalizeUnixScript(scriptContent ?? readWslBootstrapScriptContent());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content, "utf8");
  return dest;
}

async function installTorchInVenv(userDataPath) {
  const venvPy = requireManagedVenvPython(userDataPath, true);
  const args = ["-m", "pip", "install", "torch", "torchvision", "torchaudio"];
  if (process.platform === "win32") {
    try {
      await runPython(
        venvPy,
        [...args, "--index-url", "https://download.pytorch.org/whl/cu121"],
        { userDataPath },
      );
      return { ok: true, message: "torch (CUDA cu121 index)" };
    } catch {
      /* CPU fallback */
    }
  }
  await runPython(venvPy, args, { userDataPath });
  return { ok: true, message: "torch (default index)" };
}

async function pipInstallOpenSoraEditable(userDataPath) {
  const venvPy = requireManagedVenvPython(userDataPath, true);
  const target = getManagedOpenSoraDir(userDataPath);
  if (!fileExists(target)) {
    return { ok: true, skipped: true, message: "Open-Sora clone missing — skip editable install" };
  }
  const hasProject =
    fileExists(path.join(target, "setup.py")) ||
    fileExists(path.join(target, "pyproject.toml")) ||
    fileExists(path.join(target, "opensora"));
  if (!hasProject) {
    return { ok: true, skipped: true, message: "Open-Sora project files not found — skip editable install" };
  }
  await runPython(venvPy, ["-m", "pip", "install", "-e", target], { userDataPath, timeout: 900000 });
  return { ok: true, message: `pip install -e ${target}` };
}

async function pipInstallOptionalPackages(userDataPath) {
  const optionalPath = getBundledOptionalRequirementsPath();
  if (!fileExists(optionalPath)) return { ok: true, skipped: true };
  const venvPy = requireManagedVenvPython(userDataPath, true);
  const lines = filterPipRequirementLines(readRequirementsLines(optionalPath));
  const installed = [];
  const failed = [];
  for (const line of lines) {
    try {
      await runPython(venvPy, ["-m", "pip", "install", line], { userDataPath, timeout: 900000 });
      installed.push(packageKey(line));
    } catch {
      failed.push(packageKey(line));
    }
  }
  return { ok: true, installed, failed, message: `Optional pip: ${installed.length} ok, ${failed.length} skipped` };
}

async function runPipInstallPythonScript(userDataPath, reqPath) {
  const { resolveBundledScript } = require("./install-console.cjs");
  const scriptPath = resolveBundledScript("scripts/install-addons-pip.py");
  if (!fileExists(scriptPath)) {
    return { ok: false, error: `Missing pip install script: ${scriptPath}`, requirementsPath: reqPath };
  }

  const venvPy = requireManagedVenvPython(userDataPath, true);
  const optionalPath = getBundledOptionalRequirementsPath();
  const openSoraPath = getManagedOpenSoraDir(userDataPath);
  const args = [
    scriptPath,
    "--python",
    venvPy,
    "--requirements",
    reqPath,
    "--open-sora",
    openSoraPath,
  ];
  if (fileExists(optionalPath)) {
    args.push("--optional", optionalPath);
  }

  const code = await new Promise((resolve, reject) => {
    const child = spawn(venvPy, args, {
      stdio: "inherit",
      env: { ...process.env, VIRTUAL_ENV: getManagedVenvDir(userDataPath) },
    });
    child.on("error", reject);
    child.on("close", (exitCode) => resolve(exitCode ?? 1));
  });

  if (code !== 0) {
    return {
      ok: false,
      error: `pip install script exited ${code}`,
      requirementsPath: reqPath,
    };
  }

  return {
    ok: true,
    path: venvPy,
    message: "pip install via Python CMD (requirements.txt)",
    requirementsPath: reqPath,
  };
}

async function bootstrapEmbedPip(pythonExe, userDataPath, manifest) {
  const platformKey = manifestPlatformKey(process.platform);
  const embed = manifest.addons.python.embed?.[platformKey];
  if (!embed?.getPipUrl) {
    try {
      await execLocal(pythonExe, ["-m", "ensurepip", "--upgrade"], { timeout: 120000 });
      if (await probePipAvailable(pythonExe)) {
        return { ok: true, message: "ensurepip" };
      }
      return { ok: false, error: "ensurepip finished but pip is still unavailable" };
    } catch (e) {
      return { ok: false, error: e?.message || "ensurepip failed" };
    }
  }

  const cacheDir = getAddonsCacheDir(userDataPath);
  fs.mkdirSync(cacheDir, { recursive: true });
  const getPipPath = path.join(cacheDir, "get-pip.py");
  await downloadFile(embed.getPipUrl, getPipPath);
  await execLocal(pythonExe, [getPipPath], { timeout: 180000 });
  if (platformKey === "win32") {
    configureEmbedPythonPath(path.dirname(pythonExe));
  }
  if (!(await probePipAvailable(pythonExe))) {
    return { ok: false, error: "get-pip.py finished but pip is still unavailable" };
  }
  return { ok: true, message: "get-pip.py" };
}

async function ensureEmbedPip(pythonExe, userDataPath, manifest) {
  if (await probePipAvailable(pythonExe)) {
    return { ok: true, message: "pip already available" };
  }
  if (process.platform === "win32") {
    configureEmbedPythonPath(path.dirname(pythonExe));
  }
  return bootstrapEmbedPip(pythonExe, userDataPath, manifest);
}

async function pipInstallRequirements(userDataPath, requirementsPath, { forceVenv = true } = {}) {
  const manifest = loadAddonManifest();
  const useVenv = forceVenv || manifest.protocol?.forceVenvForPip !== false;
  const pythonPath = useVenv
    ? requireManagedVenvPython(userDataPath, true)
    : getVenvPythonPath(userDataPath);

  if (!fileExists(requirementsPath)) {
    return { ok: true, skipped: true, message: "No requirements file" };
  }
  await runPython(
    pythonPath,
    ["-m", "pip", "install", "-r", requirementsPath],
    { userDataPath, timeout: 900000 },
  );
  return { ok: true, message: `pip install -r ${path.basename(requirementsPath)} (managed venv)`, pythonPath };
}

/**
 * Accept host scan ({ python, ffmpeg, … }), IPC wrapper ({ scan }), or Setup Hub UI scan ({ modules, raw }).
 */
function normalizeHostScan(scan) {
  if (!scan || typeof scan !== "object") return scan;
  if (scan.raw && scan.modules) return scan.raw;
  if (scan.scan && typeof scan.scan === "object") {
    return normalizeHostScan(scan.scan);
  }
  return scan;
}

function resolveManagedOpenSoraPath(userDataPath, openSoraPath) {
  const managed = getManagedOpenSoraDir(userDataPath);
  const manifest = loadAddonManifest();
  if (manifest.forceManaged) return managed;
  return String(openSoraPath || "").trim() || managed;
}

function getManagedAddonPaths(userDataPath) {
  if (!userDataPath) return {};
  let manifest;
  try {
    manifest = loadAddonManifest();
  } catch {
    return {};
  }

  const platformKey = manifestPlatformKey(process.platform);

  const out = {
    addonsRoot: getAddonsRoot(userDataPath),
    openSoraPath: getManagedOpenSoraDir(userDataPath),
    venvPath: getManagedVenvDir(userDataPath),
    wslVenvPath: getManagedWslVenvDir(userDataPath),
    modelsPath: getManagedModelsDir(userDataPath),
    requirementsPath: getManagedRequirementsPath(userDataPath),
  };

  const py = manifest.addons?.python?.embed?.[platformKey];
  if (py?.version) {
    const dir = getManagedPythonDir(userDataPath, py.version);
    const exe = resolveEmbedExecutable(dir, { executable: py.executable || "python.exe" });
    if (exe) out.pythonPath = exe;
  }

  const venvPy = getVenvPythonPath(userDataPath);
  if (fileExists(venvPy)) out.venvPythonPath = venvPy;

  const wslPy = getWslVenvPythonPath(userDataPath);
  if (fileExists(wslPy)) out.wslPythonPath = wslPy;

  const node = manifest.addons?.nodejs?.builds?.[platformKey];
  if (node?.version) {
    const dir = getManagedNodeDir(userDataPath, node.version);
    const exe = resolveEmbedExecutable(dir, { executable: node.executable || "node.exe" });
    if (exe) out.nodePath = exe;
  }

  const ff = manifest.addons?.ffmpeg?.builds?.[platformKey];
  if (ff?.version) {
    const dir = getManagedFfmpegDir(userDataPath, ff.version);
    const exe = findFileRecursive(dir, ff.zipExecutable || "ffmpeg.exe");
    if (exe) out.ffmpegPath = exe;
  }

  return out;
}

async function checkAddonUpdates({ scan, userDataPath, openSoraPath }) {
  scan = normalizeHostScan(scan);
  const manifest = loadAddonManifest();
  const managed = getManagedAddonPaths(userDataPath);
  const oSoraPath = resolveManagedOpenSoraPath(userDataPath, openSoraPath);
  const platformKey = manifestPlatformKey(process.platform);
  const items = [];

  const hasGit = await gitAvailable();
  const gitCfg = manifest.addons.git || {};
  items.push({
    id: "git",
    label: gitCfg.label || "Git",
    installed: hasGit,
    currentVersion: hasGit ? "installed" : null,
    latestVersion: "required",
    updateAvailable: !hasGit,
    needsManualInstall: !hasGit,
    message: hasGit ? "Git available on PATH" : "Install Git — required for Open-Sora clone",
    installUrl: gitCfg.installUrl?.[platformKey] || gitCfg.installUrl?.win32 || null,
    managed: false,
  });

  const nodeCfg = manifest.addons.nodejs?.builds?.[platformKey];
  const nodeDir = nodeCfg ? getManagedNodeDir(userDataPath, nodeCfg.version) : null;
  const nodeExe = nodeDir && nodeCfg ? resolveEmbedExecutable(nodeDir, { executable: nodeCfg.executable }) : null;
  const hasNode = Boolean(nodeExe && fileExists(nodeExe));
  let nodeVersion = null;
  if (hasNode) {
    try {
      const { stdout } = await execLocal(nodeExe, ["--version"], { timeout: 5000 });
      nodeVersion = String(stdout || "").trim().replace(/^v/, "");
    } catch {
      /* ignore */
    }
  }
  items.push({
    id: "nodejs",
    label: manifest.addons.nodejs?.label || "Node.js",
    installed: hasNode,
    currentVersion: nodeVersion,
    latestVersion: nodeCfg?.version || manifest.addons.nodejs?.recommendedVersion,
    updateAvailable: Boolean(nodeCfg?.url) && !hasNode,
    message: hasNode
      ? `Managed Node ${nodeVersion || nodeCfg?.version}`
      : nodeCfg?.url
        ? "Managed Node.js not installed"
        : "Node auto-install not configured for this platform",
    path: nodeExe,
    managed: true,
  });

  const pyManifest = manifest.addons.python;
  const embed = pyManifest.embed?.[platformKey];
  const managedPyDir = embed ? getManagedPythonDir(userDataPath, embed.version) : null;
  const managedExe =
    managedPyDir && embed ? resolveEmbedExecutable(managedPyDir, { executable: embed.executable || "python.exe" }) : null;
  const hasManagedEmbed = Boolean(managedExe && fileExists(managedExe));
  const embedProbe = hasManagedEmbed ? await probePythonExecutable(managedExe) : { ok: false };
  const embedPipOk = embedProbe.ok ? await probePipAvailable(managedExe) : false;

  items.push({
    id: "python",
    label: pyManifest.label,
    installed: hasManagedEmbed && embedProbe.ok && embedPipOk,
    currentVersion: embedProbe.ok ? embedProbe.version : null,
    latestVersion: embed?.version || pyManifest.recommendedVersion,
    updateAvailable: !hasManagedEmbed || !embedProbe.ok || !embedPipOk,
    message: !hasManagedEmbed
      ? "Managed Python embed not installed — use Update all addons"
      : !embedProbe.ok
        ? embedProbe.error || "Managed embed broken"
        : !embedPipOk
          ? "Managed embed missing pip — run Install Addons to bootstrap get-pip"
          : `Managed embed ${embedProbe.version}`,
    path: managedExe || null,
    managed: true,
  });

  const venvPy = getVenvPythonPath(userDataPath);
  const venvProbe = fileExists(venvPy) ? await probePythonExecutable(venvPy) : { ok: false };
  items.push({
    id: "venv",
    label: manifest.addons.venv.label,
    installed: venvProbe.ok,
    currentVersion: venvProbe.ok ? venvProbe.version : null,
    latestVersion: embed?.version || pyManifest.recommendedVersion,
    updateAvailable: !venvProbe.ok || !hasManagedEmbed,
    message: !hasManagedEmbed
      ? "Install Python embed first"
      : venvProbe.ok
        ? `Managed venv — ${venvPy}`
        : "Managed venv missing — use Update all addons",
    path: venvProbe.ok ? venvPy : getManagedVenvDir(userDataPath),
    managed: true,
  });

  const gitState = await getOpenSoraGitState(oSoraPath);
  items.push({
    id: "open-sora",
    label: manifest.addons["open-sora"].label,
    installed: gitState.installed && gitState.isGit,
    currentVersion: gitState.localHead?.slice(0, 8) || null,
    latestVersion: gitState.remoteHead?.slice(0, 8) || manifest.addons["open-sora"].branch,
    updateAvailable: !gitState.installed || gitState.updateAvailable || !gitState.isGit,
    message: !gitState.installed
      ? "Not installed — clone to managed addons folder"
      : gitState.updateAvailable
        ? "Git update available (pull)"
        : gitState.isGit
          ? "Up to date (managed)"
          : "Not a git repo — re-clone recommended",
    path: oSoraPath,
    managed: true,
  });

  const reqStale = requirementsNeedsSync(userDataPath);
  const reqMeta = readRequirementsMeta(userDataPath);
  items.push({
    id: "requirements",
    label: manifest.addons.requirements.label,
    installed: fileExists(getManagedRequirementsPath(userDataPath)) && !reqStale,
    currentVersion: reqMeta?.hash?.slice(0, 8) || null,
    latestVersion: "synced",
    updateAvailable: reqStale,
    message: reqStale
      ? "requirements.txt out of date — sync from bundled template + Open-Sora"
      : `Synced ${reqMeta?.lineCount || 0} lines`,
    path: getManagedRequirementsPath(userDataPath),
    managed: true,
  });

  const probePy = venvProbe.ok ? venvPy : managedExe;
  const probeModule = manifest.addons["pip-deps"]?.probeModule || "torch";
  const depsOk = probePy ? await probePythonModule(probePy, probeModule) : false;
  items.push({
    id: "pip-deps",
    label: manifest.addons["pip-deps"].label,
    installed: depsOk,
    currentVersion: depsOk ? probeModule : null,
    latestVersion: probeModule,
    updateAvailable: !depsOk || reqStale || !venvProbe.ok,
    message: !venvProbe.ok
      ? "Create managed venv first"
      : depsOk
        ? `${probeModule} import OK in managed venv`
        : `${probeModule} missing — pip install required`,
    path: probePy || null,
    managed: true,
  });

  const ffManifest = manifest.addons.ffmpeg.builds?.[platformKey];
  const managedFf =
    ffManifest && managed.ffmpegPath ? managed.ffmpegPath : null;
  const hasManagedFf = Boolean(managedFf && fileExists(managedFf));
  items.push({
    id: "ffmpeg",
    label: manifest.addons.ffmpeg.label,
    installed: hasManagedFf,
    currentVersion: hasManagedFf ? ffManifest?.version : null,
    latestVersion: ffManifest?.version || null,
    updateAvailable: Boolean(ffManifest) && !hasManagedFf,
    message: hasManagedFf
      ? "Managed FFmpeg installed"
      : ffManifest
        ? "Managed FFmpeg not installed"
        : "Optional — manual install on this platform",
    path: managedFf,
    managed: true,
  });

  const modelsDir = getManagedModelsDir(userDataPath);
  const modelCount = countModelArtifacts(modelsDir);
  const minModels = manifest.addons.models?.minimumArtifacts ?? 1;
  const modelDownloads = manifest.addons.models?.downloads || [];
  const modelsPlaceholderOnly = modelDownloads.length === 0;
  const modelsReady = modelsPlaceholderOnly
    ? fileExists(modelsDir) && fileExists(path.join(modelsDir, "README.txt"))
    : modelCount >= minModels;
  items.push({
    id: "models",
    label: manifest.addons.models.label,
    installed: modelsReady,
    currentVersion: modelCount ? `${modelCount} artifact(s)` : modelsReady ? "folder ready" : null,
    latestVersion: modelDownloads.length ? `${modelDownloads.length} configured` : "placeholder folder",
    updateAvailable: !modelsReady,
    message: modelsReady
      ? modelCount
        ? `Models cache ready (${modelCount} items)`
        : "Models folder ready — add checkpoint weights when needed"
      : "Models folder empty — run Install Addons to initialize",
    path: modelsDir,
    managed: true,
  });

  if (process.platform === "win32" && manifest.addons.wsl) {
    const wslCfg = manifest.addons.wsl;
    const wslOk = await wslAvailable();
    const wslPy = getWslVenvPythonPath(userDataPath);
    const wslProbe = wslOk ? await wslVenvExists(userDataPath) : false;
    const wslTorch = wslProbe ? await probeWslPythonModule(userDataPath, wslCfg.probeModule || "torch") : false;
    items.push({
      id: "wsl",
      label: wslCfg.label || "WSL2 Linux stack",
      installed: wslOk && wslProbe && wslTorch,
      currentVersion: wslTorch ? wslCfg.probeModule : wslProbe ? "venv" : null,
      latestVersion: "torch+venv",
      updateAvailable: wslOk && (!wslProbe || !wslTorch),
      message: !wslOk
        ? "WSL2 not detected — optional for Linux-native torch/CUDA"
        : wslTorch
          ? `WSL venv OK — ${wslPy}`
          : wslProbe
            ? "WSL venv exists but torch missing — run Update"
            : "WSL available — bootstrap Linux venv in shared addons folder",
      path: wslProbe ? wslPy : getManagedWslVenvDir(userDataPath),
      managed: true,
    });
  }

  return { ok: true, checkedAt: new Date().toISOString(), forceManaged: Boolean(manifest.forceManaged), items };
}

async function updatePythonEmbed({ userDataPath, manifest }) {
  const platformKey = manifestPlatformKey(process.platform);
  const embed = manifest.addons.python.embed?.[platformKey];
  if (!embed?.url || !embed.executable) {
    return {
      ok: false,
      error: embed?.note || "Python auto-install not configured for this platform",
    };
  }

  const destRoot = getManagedPythonDir(userDataPath, embed.version);
  const ext = embed.archive === "tar.gz" ? "tar.gz" : embed.archive === "tar.xz" ? "tar.xz" : "zip";
  const cachePath = path.join(getAddonsCacheDir(userDataPath), `python-${embed.version}.${ext}`);
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });

  await downloadFile(embed.url, cachePath);
  if (fileExists(destRoot)) {
    fs.rmSync(destRoot, { recursive: true, force: true });
  }
  await extractArchive(cachePath, destRoot, embed.archive || "zip");

  const exePath = resolveEmbedExecutable(destRoot, embed);
  if (!exePath) {
    return { ok: false, error: `Python executable not found after extract in ${destRoot}` };
  }

  if (platformKey === "win32") {
    configureEmbedPythonPath(path.dirname(exePath));
  }

  let pipBootstrap = null;
  try {
    pipBootstrap = await bootstrapEmbedPip(exePath, userDataPath, manifest);
  } catch (e) {
    pipBootstrap = { ok: false, error: e?.message || "pip bootstrap failed" };
  }

  if (!pipBootstrap.ok || !(await probePipAvailable(exePath))) {
    return {
      ok: false,
      path: exePath,
      version: embed.version,
      error: pipBootstrap.error || "pip bootstrap failed — managed embed has no pip",
      pipBootstrap,
    };
  }

  return {
    ok: true,
    path: exePath,
    version: embed.version,
    message: `Python ${embed.version} installed (managed, ${platformKey})`,
    pipBootstrap,
  };
}

async function updateVenv({ userDataPath, pythonPath, manifest }) {
  const platformKey = manifestPlatformKey(process.platform);
  const embed = manifest.addons.python.embed?.[platformKey];
  const basePython =
    pythonPath ||
    (embed
      ? resolveEmbedExecutable(getManagedPythonDir(userDataPath, embed.version), embed)
      : null);

  if (!basePython || !fileExists(basePython)) {
    return { ok: false, error: "Managed Python embed required before creating venv" };
  }

  const pipReady = await ensureEmbedPip(basePython, userDataPath, manifest);
  if (!pipReady.ok) {
    return { ok: false, error: pipReady.error || "pip required before creating venv" };
  }

  const venvDir = getManagedVenvDir(userDataPath);
  if (fileExists(venvDir)) {
    fs.rmSync(venvDir, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(venvDir), { recursive: true });

  try {
    await execLocal(basePython, ["-m", "venv", venvDir], {
      timeout: 120000,
    });
  } catch (venvErr) {
    try {
      await execLocal(basePython, ["-m", "pip", "install", "virtualenv"], {
        timeout: 180000,
      });
      await execLocal(basePython, ["-m", "virtualenv", venvDir], {
        timeout: 120000,
      });
    } catch (fallbackErr) {
      return {
        ok: false,
        error: fallbackErr?.message || venvErr?.message || "Failed to create venv (venv + virtualenv)",
      };
    }
  }

  const venvPy = getVenvPythonPath(userDataPath);
  if (!fileExists(venvPy)) {
    return { ok: false, error: `venv python not found at ${venvPy}` };
  }

  await runPython(venvPy, ["-m", "pip", "install", "--upgrade", "pip", "wheel", "setuptools"], {
    userDataPath,
    timeout: 180000,
  });

  return {
    ok: true,
    path: venvPy,
    message: "Managed venv created",
  };
}

async function updateOpenSora({ installPath, userDataPath, manifest }) {
  const cfg = manifest.addons["open-sora"];
  const target = resolveManagedOpenSoraPath(userDataPath, installPath);

  if (!(await gitAvailable())) {
    return { ok: false, error: "Git is required to install Open-Sora — install Git for Windows" };
  }

  if (fileExists(path.join(target, ".git"))) {
    await runGit(["fetch", "origin"], target);
    await runGit(["pull", "--ff-only", "origin", cfg.branch], target);
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fileExists(target) && fs.readdirSync(target).length > 0) {
      fs.rmSync(target, { recursive: true, force: true });
    }
    await runGit(
      ["clone", "--depth", "1", "--branch", cfg.branch, cfg.repo, target],
      path.dirname(target) || ".",
    );
  }

  syncAddonRequirements(userDataPath, { openSoraPath: target });

  return {
    ok: true,
    path: target,
    message: "Open-Sora installed/updated (managed)",
  };
}

async function updateRequirements({ userDataPath }) {
  const openSoraPath = getManagedOpenSoraDir(userDataPath);
  const result = syncAddonRequirements(userDataPath, { openSoraPath });
  return { ok: true, ...result };
}

async function updatePipDeps({ userDataPath, pipViaPython = false } = {}) {
  requireManagedVenvPython(userDataPath, true);

  syncAddonRequirements(userDataPath, { openSoraPath: getManagedOpenSoraDir(userDataPath) });
  const reqPath = getManagedRequirementsPath(userDataPath);

  if (pipViaPython) {
    return runPipInstallPythonScript(userDataPath, reqPath);
  }

  try {
    const torchResult = await installTorchInVenv(userDataPath);
    const editableResult = await pipInstallOpenSoraEditable(userDataPath);
    const pipResult = await pipInstallRequirements(userDataPath, reqPath, { forceVenv: true });
    const optionalResult = await pipInstallOptionalPackages(userDataPath);
    return {
      ok: true,
      path: pipResult.pythonPath,
      message: [torchResult.message, editableResult.message, pipResult.message, optionalResult.message]
        .filter(Boolean)
        .join(" · "),
      requirementsPath: reqPath,
      steps: { torch: torchResult, editable: editableResult, requirements: pipResult, optional: optionalResult },
    };
  } catch (e) {
    return { ok: false, error: e?.message || "pip install failed", requirementsPath: reqPath };
  }
}

async function updateNodejs({ userDataPath, manifest }) {
  const platformKey = manifestPlatformKey(process.platform);
  const build = manifest.addons.nodejs?.builds?.[platformKey];
  if (!build?.url) {
    return { ok: false, error: "Node.js auto-install not configured for this platform" };
  }

  const destRoot = getManagedNodeDir(userDataPath, build.version);
  const ext = build.url.endsWith(".tar.xz") ? "tar.xz" : "zip";
  const cachePath = path.join(getAddonsCacheDir(userDataPath), `node-${build.version}.${ext}`);
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });

  await downloadFile(build.url, cachePath);
  if (fileExists(destRoot)) {
    fs.rmSync(destRoot, { recursive: true, force: true });
  }
  await extractArchive(cachePath, destRoot, ext === "tar.xz" ? "tar.xz" : "zip");

  const exePath = resolveEmbedExecutable(destRoot, { executable: build.executable });
  if (!exePath) {
    return { ok: false, error: `node not found after extract in ${destRoot}` };
  }

  return {
    ok: true,
    path: exePath,
    version: build.version,
    message: `Node.js ${build.version} installed (managed)`,
  };
}

async function updateGit({ manifest }) {
  const platformKey = manifestPlatformKey(process.platform);
  if (await gitAvailable()) {
    return { ok: true, skipped: true, message: "Git already on PATH" };
  }
  const url = manifest.addons.git?.installUrl?.[platformKey];
  return {
    ok: true,
    skipped: true,
    needsManualInstall: true,
    message: "Git must be installed manually — required before Open-Sora clone",
    installUrl: url,
  };
}

async function updateWsl({ userDataPath, manifest }) {
  if (process.platform !== "win32") {
    return { ok: true, skipped: true, message: "WSL addon only applies on Windows host" };
  }
  if (!(await wslAvailable())) {
    return { ok: false, error: "WSL2 not available — enable WSL or skip this addon" };
  }

  const probeModule = manifest.addons.wsl?.probeModule || "torch";
  const wslPy = getWslVenvPythonPath(userDataPath);
  if ((await wslVenvExists(userDataPath)) && (await probeWslPythonModule(userDataPath, probeModule))) {
    return {
      ok: true,
      skipped: true,
      path: wslPy,
      message: "WSL Linux venv already ready",
    };
  }

  syncAddonRequirements(userDataPath, { openSoraPath: getManagedOpenSoraDir(userDataPath) });

  const scriptContent = readWslBootstrapScriptContent();
  materializeWslBootstrapScript(userDataPath, scriptContent);

  let bootstrapError = null;
  try {
    await runWslBootstrap({
      userDataPath,
      scriptContent,
      openSoraPath: getManagedOpenSoraDir(userDataPath),
    });
  } catch (err) {
    bootstrapError = err?.message || "WSL bootstrap failed";
  }

  const wslReady = await wslVenvExists(userDataPath);
  const wslTorch = wslReady ? await probeWslPythonModule(userDataPath, probeModule) : false;
  return {
    ok: wslReady && wslTorch,
    path: wslPy,
    error: wslReady && wslTorch ? undefined : bootstrapError || undefined,
    message: wslTorch
      ? "WSL Linux venv + pip deps bootstrapped"
      : wslReady
        ? "WSL venv created but torch import failed"
        : bootstrapError || "WSL bootstrap finished but venv missing",
  };
}

async function updateFfmpeg({ userDataPath, manifest }) {
  const platformKey = manifestPlatformKey(process.platform);
  const build = manifest.addons.ffmpeg.builds?.[platformKey];
  if (!build?.url) {
    return { ok: false, error: build?.note || "FFmpeg auto-install not configured for this platform" };
  }

  const destRoot = getManagedFfmpegDir(userDataPath, build.version);
  const archive = build.archive || (build.url.endsWith(".tar.xz") ? "tar.xz" : "zip");
  const ext = archive === "tar.xz" ? "tar.xz" : "zip";
  const cachePath = path.join(getAddonsCacheDir(userDataPath), `ffmpeg-${build.version}.${ext}`);
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });

  await downloadFile(build.url, cachePath);
  if (fileExists(destRoot)) {
    fs.rmSync(destRoot, { recursive: true, force: true });
  }
  await extractArchive(cachePath, destRoot, archive);

  const exePath = findFileRecursive(destRoot, build.zipExecutable || "ffmpeg.exe");
  if (!exePath) {
    return { ok: false, error: `ffmpeg not found after extract in ${destRoot}` };
  }

  return {
    ok: true,
    path: exePath,
    version: build.version,
    message: `FFmpeg ${build.version} installed (managed)`,
  };
}

async function updateModels({ userDataPath, manifest }) {
  const modelsDir = getManagedModelsDir(userDataPath);
  fs.mkdirSync(modelsDir, { recursive: true });

  const downloads = manifest.addons.models?.downloads || [];
  const results = [];

  for (const item of downloads) {
    if (!item?.url || !item?.dest) continue;
    const destPath = path.join(modelsDir, item.dest);
    if (fileExists(destPath)) {
      results.push({ name: item.name || item.dest, ok: true, skipped: true });
      continue;
    }
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const cachePath = path.join(getAddonsCacheDir(userDataPath), `model-${path.basename(destPath)}`);
    await downloadFile(item.url, cachePath);
    fs.copyFileSync(cachePath, destPath);
    results.push({ name: item.name || item.dest, ok: true, path: destPath });
  }

  if (!downloads.length) {
    const readme = path.join(modelsDir, "README.txt");
    if (!fileExists(readme)) {
      fs.writeFileSync(
        readme,
        [
          "AI Video Creator — managed models folder",
          "",
          "Place Open-Sora checkpoint files here or configure downloads in data/addon-updates-manifest.json.",
          "",
          "Typical layout:",
          "  Open-Sora-Plan-v1.3/",
          "  hunyuan_vae/",
          "",
        ].join("\n"),
        "utf8",
      );
    }
  }

  const count = countModelArtifacts(modelsDir);
  const min = manifest.addons.models?.minimumArtifacts ?? 1;
  const placeholderOnly = downloads.length === 0;

  return {
    ok: placeholderOnly ? true : count >= min,
    path: modelsDir,
    count,
    message:
      count >= min
        ? `Models folder ready (${count} items)`
        : "Models folder initialized — add checkpoint files or configure manifest downloads",
    downloads: results,
  };
}

async function updateAddon({ addonId, userDataPath, scan, openSoraPath, pythonPath, pipViaPython = false }) {
  scan = normalizeHostScan(scan);
  const manifest = loadAddonManifest();
  const id = String(addonId || "").trim();
  const managed = getManagedAddonPaths(userDataPath);

  if (id === "git") {
    return updateGit({ manifest });
  }
  if (id === "nodejs") {
    return updateNodejs({ userDataPath, manifest });
  }
  if (id === "python") {
    return updatePythonEmbed({ userDataPath, manifest });
  }
  if (id === "venv") {
    return updateVenv({
      userDataPath,
      pythonPath: pythonPath || managed.pythonPath || scan?.python?.path,
      manifest,
    });
  }
  if (id === "open-sora") {
    return updateOpenSora({
      installPath: resolveManagedOpenSoraPath(userDataPath, openSoraPath),
      userDataPath,
      manifest,
    });
  }
  if (id === "requirements") {
    return updateRequirements({ userDataPath });
  }
  if (id === "pip-deps") {
    return updatePipDeps({ userDataPath, pipViaPython });
  }
  if (id === "ffmpeg") {
    return updateFfmpeg({ userDataPath, manifest });
  }
  if (id === "models") {
    return updateModels({ userDataPath, manifest });
  }
  if (id === "wsl") {
    return updateWsl({ userDataPath, manifest });
  }
  return { ok: false, error: `Unknown addon: ${id}` };
}

async function updateAllAddons(params) {
  const manifest = loadAddonManifest();
  const forceReinstall = Boolean(params.forceReinstall);
  const order = manifest.installOrder || [
    "git",
    "nodejs",
    "python",
    "venv",
    "open-sora",
    "requirements",
    "pip-deps",
    "ffmpeg",
    "models",
    "wsl",
  ];

  const results = [];
  let lastPythonPath = params.pythonPath || null;

  for (const addonId of order) {
    const check = await checkAddonUpdates(params);
    const item = check.items.find((row) => row.id === addonId);
    if (!forceReinstall && !item?.updateAvailable) {
      results.push({ id: addonId, ok: true, skipped: true, message: item?.message || "Up to date" });
      continue;
    }

    if (params.onProgress) {
      params.onProgress({
        phase: "addon-start",
        addonId,
        label: item?.label || addonId,
        forceReinstall,
      });
    }

    if (addonId === "git" && !(await gitAvailable())) {
      const gitResult = await updateGit({ manifest });
      results.push({ id: addonId, ...gitResult });
      if (params.onProgress) {
        params.onProgress({ phase: "addon-done", addonId, item: { id: addonId, ...gitResult } });
      }
      continue;
    }

    if (addonId === "open-sora" && !(await gitAvailable())) {
      const skipped = {
        id: addonId,
        ok: true,
        skipped: true,
        message: "Install Git first — Open-Sora clone requires git on PATH",
      };
      results.push(skipped);
      if (params.onProgress) {
        params.onProgress({ phase: "addon-done", addonId, item: skipped });
      }
      continue;
    }

    const result = await updateAddon({
      ...params,
      addonId,
      pythonPath: lastPythonPath,
      pipViaPython: Boolean(params.pipViaPython),
    });
    results.push({ id: addonId, ...result });

    if (params.onProgress) {
      params.onProgress({
        phase: "addon-done",
        addonId,
        item: { id: addonId, ...result },
      });
    }

    if (addonId === "python" && result.ok && result.path) {
      lastPythonPath = result.path;
    }
    if (addonId === "pip-deps" && result.ok) {
      syncAddonRequirements(params.userDataPath, {
        openSoraPath: getManagedOpenSoraDir(params.userDataPath),
      });
    }
    if (!result.ok && !result.skipped) {
      break;
    }
  }

  return { ok: results.every((r) => r.ok || r.skipped), results };
}

module.exports = {
  checkAddonUpdates,
  compareSemver,
  getManagedAddonPaths,
  loadAddonManifest,
  mergeRequirementLines,
  normalizeHostScan,
  readRequirementsLines,
  requirementsNeedsSync,
  syncAddonRequirements,
  updateAddon,
  updateAllAddons,
  requireManagedVenvPython,
};
