const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, execFile } = require("child_process");
const { promisify } = require("util");
const pkg = require("./package.json");

const execFileAsync = promisify(execFile);

let mainWindow = null;

function createWindow() {
  const iconPath = path.join(__dirname, "icon.ico");
  const windowOptions = {
    title: `AI Video Creator v${pkg.version}`,
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#0b0d10",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  };

  if (fs.existsSync(iconPath)) {
    windowOptions.icon = iconPath;
  }

  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.loadFile(path.join(__dirname, "out", "index.html"));

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  openReadmeOnce();
}

function bytesToGb(bytes) {
  if (!bytes || bytes <= 0) return null;
  const gb = bytes / 1024 ** 3;
  if (!Number.isFinite(gb)) return null;
  return Math.round(gb * 10) / 10;
}

function normalizeVramGb(rawBytes) {
  const gb = bytesToGb(rawBytes);
  if (!gb) return null;
  if (gb > 128) return null;
  return gb;
}

function pickPrimaryGpu(gpus) {
  if (!gpus?.length) return null;
  const discrete = gpus.filter((g) => g.discrete && g.vramGb);
  if (discrete.length) {
    return discrete.sort((a, b) => (b.vramGb || 0) - (a.vramGb || 0))[0];
  }
  return gpus.sort((a, b) => (b.vramGb || 0) - (a.vramGb || 0))[0];
}

async function queryWindowsGpus() {
  const ps = [
    "Get-CimInstance Win32_VideoController",
    "| Select-Object Name, AdapterRAM, DriverVersion",
    "| ConvertTo-Json -Compress",
  ].join(" ");
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-Command", ps],
      { timeout: 12000, maxBuffer: 1024 * 1024 },
    );
    const parsed = JSON.parse(stdout.trim() || "[]");
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows
      .filter((r) => r?.Name)
      .map((r) => {
        const name = String(r.Name);
        const vramGb = normalizeVramGb(Number(r.AdapterRAM));
        const discrete =
          /nvidia|geforce|rtx|gtx|radeon|rx |arc |quadro/i.test(name) &&
          !/microsoft basic|remote|virtual/i.test(name);
        return {
          name,
          vramGb,
          discrete,
          driverVersion: String(r.DriverVersion || ""),
        };
      });
  } catch {
    return [];
  }
}

async function queryLinuxGpus() {
  try {
    const { stdout } = await execFileAsync("nvidia-smi", [
      "--query-gpu=name,memory.total,driver_version",
      "--format=csv,noheader,nounits",
    ], { timeout: 8000 });
    return stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, mem, driverVersion] = line.split(",").map((s) => s.trim());
        const vramGb = mem ? Math.round(Number(mem) / 1024 * 10) / 10 : null;
        return { name, vramGb, discrete: true, driverVersion: driverVersion || "" };
      });
  } catch {
    return [];
  }
}

async function detectNativeGraphicsCapabilities(platform, primaryGpu) {
  const apis = new Set(["auto"]);
  const compute = new Set(["auto", "cpu"]);
  const name = primaryGpu?.name || "";

  if (platform === "win32") {
    ["directx12", "directx11", "vulkan", "opengl", "webgpu"].forEach((a) => apis.add(a));
    ["directml", "vulkan"].forEach((b) => compute.add(b));
    if (/nvidia|geforce|rtx|gtx/i.test(name)) compute.add("cuda");
    if (/amd|radeon|rx /i.test(name)) compute.add("rocm");
    if (/intel|arc /i.test(name)) compute.add("oneapi");
    try {
      await execFileAsync("vulkaninfo", ["--summary"], { timeout: 4000 });
      apis.add("vulkan");
    } catch {
      /* optional */
    }
  } else if (platform === "linux") {
    ["vulkan", "opengl"].forEach((a) => apis.add(a));
    compute.add("vulkan");
    if (/nvidia/i.test(name)) compute.add("cuda");
    if (/amd|radeon/i.test(name)) compute.add("rocm");
    if (/intel|arc /i.test(name)) compute.add("oneapi");
  } else if (platform === "darwin") {
    ["metal", "opengl", "webgpu"].forEach((a) => apis.add(a));
    compute.add("mps");
  }

  return {
    detectedApis: [...apis],
    detectedComputeBackends: [...compute],
  };
}

async function gatherNativeSystemStats() {
  const cpus = os.cpus() || [];
  const totalMemGb = bytesToGb(os.totalmem());
  const freeMemGb = bytesToGb(os.freemem());
  let gpus = [];
  if (process.platform === "win32") gpus = await queryWindowsGpus();
  else if (process.platform === "linux") gpus = await queryLinuxGpus();
  const primaryGpu = pickPrimaryGpu(gpus);
  const caps = await detectNativeGraphicsCapabilities(process.platform, primaryGpu);
  return {
    source: "electron",
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    scannedAt: new Date().toISOString(),
    cpuCores: cpus.length || 4,
    cpuModel: cpus[0]?.model || "Unknown CPU",
    totalMemGb,
    freeMemGb,
    gpus,
    primaryGpu,
    detectedApis: caps.detectedApis,
    detectedComputeBackends: caps.detectedComputeBackends,
  };
}

const activeBuilds = new Map();

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function parseLogProgress(logText) {
  const markers = logText.match(/\[BUILD_PROGRESS\]\s+([\d.]+)/g);
  if (!markers?.length) return null;
  const last = markers[markers.length - 1];
  const n = parseFloat(last.match(/[\d.]+/)?.[0] || "0");
  return Number.isFinite(n) ? Math.min(100, n) : null;
}

function getBuildStatusFromLog({ logPath, pid, startedAt, estimatedMs }) {
  let progress = 0;
  let status = "running";
  let message = "Rendering…";
  let logTail = "";

  if (logPath && fs.existsSync(logPath)) {
    logTail = fs.readFileSync(logPath, "utf8").slice(-800);
    const parsed = parseLogProgress(logTail);
    if (parsed != null) progress = parsed;

    if (logTail.includes("--- exit cancelled ---")) {
      progress = Math.min(progress || 0, 99);
      status = "cancelled";
      message = "Build cancelled";
    } else if (logTail.includes("--- exit 0 ---")) {
      progress = 100;
      status = "complete";
      message = "Render finished";
    } else if (/--- exit [1-9]\d* ---/.test(logTail)) {
      status = "failed";
      message = "Render exited with error — see log";
    } else if (logTail.includes("No local pipeline configured")) {
      progress = 100;
      status = "complete";
      message = "Job exported";
    }
  }

  const elapsed = Date.now() - (startedAt || Date.now());
  const alive = isProcessAlive(pid);

  if (status === "running" && progress <= 0) {
    progress = Math.min(95, (elapsed / Math.max(estimatedMs || 60000, 1)) * 100);
  } else if (status === "running" && progress > 0 && progress < 100) {
    progress = Math.max(progress, Math.min(95, (elapsed / Math.max(estimatedMs || 60000, 1)) * 100));
  }

  if (status === "running" && !alive && progress < 100 && !logTail.includes("--- exit")) {
    if (elapsed > (estimatedMs || 60000) * 1.5) {
      status = "failed";
      message = "Process stopped unexpectedly";
    }
  }

  const remainingSec = Math.max(
    0,
    Math.ceil(((estimatedMs || 60000) - elapsed) / 1000),
  );

  return { progress, status, remainingSec, message, logTail, processAlive: alive };
}

function killBuildProcess(pid, logPath) {
  if (!pid) return { ok: false, error: "No build process" };

  const entry = logPath ? activeBuilds.get(logPath) : null;
  const targetPid = entry?.pid || pid;

  try {
    if (entry?.child && !entry.child.killed) {
      entry.child.kill("SIGTERM");
    }
  } catch {
    /* fall through to platform kill */
  }

  try {
    if (process.platform === "win32") {
      const { execSync } = require("child_process");
      execSync(`taskkill /PID ${targetPid} /T /F`, { stdio: "ignore" });
    } else {
      try {
        process.kill(-targetPid, "SIGTERM");
      } catch {
        process.kill(targetPid, "SIGTERM");
      }
    }
  } catch {
    if (!isProcessAlive(targetPid)) {
      /* already stopped */
    } else {
      return { ok: false, error: "Could not stop render process" };
    }
  }

  if (logPath) {
    try {
      if (!fs.existsSync(logPath) || !fs.readFileSync(logPath, "utf8").includes("--- exit cancelled ---")) {
        fs.appendFileSync(
          logPath,
          "\n[BUILD_PROGRESS] cancelled\n--- exit cancelled ---\nUser cancelled build\n",
        );
      }
    } catch {
      /* ignore log write errors */
    }
    activeBuilds.delete(logPath);
  }

  return { ok: true, message: "Build cancelled" };
}

function setupBuildProgressIpc() {
  ipcMain.handle("director:get-build-status", async (_event, payload) => {
    try {
      const result = getBuildStatusFromLog({
        logPath: payload?.logPath,
        pid: payload?.pid,
        startedAt: payload?.startedAt,
        estimatedMs: payload?.estimatedMs,
      });
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: e?.message || "status failed" };
    }
  });

  ipcMain.handle("director:cancel-build", async (_event, payload) => {
    try {
      return killBuildProcess(payload?.pid, payload?.logPath);
    } catch (e) {
      return { ok: false, error: e?.message || "cancel failed" };
    }
  });
}

function setupSystemIpc() {
  ipcMain.handle("system:get-stats", async () => {
    try {
      const stats = await gatherNativeSystemStats();
      return { ok: true, stats };
    } catch (e) {
      return { ok: false, error: e?.message || "system scan failed" };
    }
  });
}

function setupDirectorIpc() {
  const launchDirectorJobHandler = async (_event, payload) => {
    try {
      const job = payload?.job || {};
      const imagePayload = payload?.imagePayload;
      const pythonPath = payload?.settings?.localPythonPath || job.pythonPath || "python";

      const jobsDir = path.join(app.getPath("userData"), "video-jobs");
      fs.mkdirSync(jobsDir, { recursive: true });
      const stamp = Date.now();
      const jobPath = path.join(jobsDir, `director-${stamp}.json`);
      const logPath = path.join(jobsDir, `director-${stamp}.log`);

      if (imagePayload?.base64 && imagePayload?.name) {
        const safeName = String(imagePayload.name).replace(/[^\w.\-]+/g, "_");
        const refPath = path.join(jobsDir, `ref-${stamp}-${safeName}`);
        fs.writeFileSync(refPath, Buffer.from(imagePayload.base64, "base64"));
        job.ref_image = refPath;
        job.i2v = true;
      }

      fs.writeFileSync(jobPath, JSON.stringify(job, null, 2));
      fs.writeFileSync(logPath, `[BUILD_PROGRESS] 1 Starting job\n`);

      const pipelinePath = job.localPipelinePath || "";
      if (!pipelinePath || !fs.existsSync(pipelinePath)) {
        fs.appendFileSync(logPath, `[BUILD_PROGRESS] 100 Export-only job saved\n--- exit 0 ---\n`);
        return {
          ok: true,
          exportOnly: true,
          jobPath,
          logPath,
          message: "Job saved — configure Advanced → local pipeline for GPU render",
        };
      }

      const runnerScript = path.join(__dirname, "scripts", "run-director-job.py");
      if (!fs.existsSync(runnerScript)) {
        return { ok: false, error: `Runner not found: ${runnerScript}` };
      }

      const logStream = fs.createWriteStream(logPath, { flags: "a" });
      const seeds = Array.isArray(job.gpuSeeds) && job.gpuSeeds.length > 1 ? job.gpuSeeds : null;
      const estimatedMs = Math.max(
        30000,
        (job.estimatedBuildSeconds || 180) * 1000 * (seeds?.length || 1),
      );

      const spawnRender = (seedIndex) => {
        const seed = seeds ? seeds[seedIndex] : job.seed || 0;
        const runJobPath =
          seeds && seedIndex > 0
            ? path.join(jobsDir, `director-${stamp}-seed-${seedIndex}.json`)
            : jobPath;
        if (seeds) {
          fs.writeFileSync(runJobPath, JSON.stringify({ ...job, seed }, null, 2));
          logStream.write(
            `\n--- GPU seed batch ${seedIndex + 1}/${seeds.length} (seed ${seed}) ---\n`,
          );
        }

        const graphicsEnv = job.graphicsStack?.env || job.graphicsEnv || {};
        const child = spawn(pythonPath, [runnerScript, runJobPath], {
          cwd: pipelinePath,
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
          shell: process.platform === "win32",
          env: { ...process.env, ...graphicsEnv, PYTHONUNBUFFERED: "1" },
        });

        child.stdout.on("data", (d) => {
          logStream.write(d);
          const text = d.toString();
          const pctMatch = text.match(/(\d{1,3})%/);
          if (pctMatch && seeds) {
            const batchPct = Math.round(
              ((seedIndex + Number(pctMatch[1]) / 100) / seeds.length) * 100,
            );
            logStream.write(`[BUILD_PROGRESS] ${batchPct}\n`);
          } else if (pctMatch) {
            logStream.write(`[BUILD_PROGRESS] ${pctMatch[1]}\n`);
          }
        });
        child.stderr.on("data", (d) => logStream.write(d));
        child.on("close", (code) => {
          if (seeds && seedIndex + 1 < seeds.length && code === 0) {
            spawnRender(seedIndex + 1);
            return;
          }
          logStream.write(`\n[BUILD_PROGRESS] ${code === 0 ? 100 : 99}\n--- exit ${code} ---\n`);
          logStream.end();
          activeBuilds.delete(logPath);
        });
        child.unref();

        activeBuilds.set(logPath, {
          pid: child.pid,
          startedAt: stamp,
          logPath,
          child,
          logStream,
        });

        return child;
      };

      const child = spawnRender(0);

      return {
        ok: true,
        jobPath,
        logPath,
        pid: child.pid,
        startedAt: stamp,
        estimatedMs,
        seedBatch: seeds,
        message: seeds
          ? `Director render started — ${seeds.length} seed variants`
          : "Director local render started",
      };
    } catch (e) {
      return { ok: false, error: e?.message || "launch failed" };
    }
  };

  ipcMain.handle("director:launch-job", launchDirectorJobHandler);
  ipcMain.handle("open-sora:launch-job", launchDirectorJobHandler);

  ipcMain.handle("open-sora:open-ui", async () => ({
    ok: false,
    error: "Use Director Engine — export prompt or Advanced local pipeline",
  }));

  ipcMain.handle("open-sora:sync-catalog", async (_event, installPath) => {
    try {
      const script = path.join(__dirname, "scripts", "sync-open-sora-catalog.cjs");
      if (!fs.existsSync(script)) {
        return { ok: false, error: `Sync script not found: ${script}` };
      }
      const { execSync } = require("child_process");
      execSync(`node "${script}" "${installPath || "E:\\Open-Sora"}"`, {
        cwd: __dirname,
        encoding: "utf8",
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      });
      return { ok: true, message: "Catalog synced — reload app to refresh UI chips" };
    } catch (e) {
      return { ok: false, error: e?.message || "sync failed" };
    }
  });
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;

  try {
    const { autoUpdater } = require("electron-updater");
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on("update-available", () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("app-update-status", { status: "available" });
      }
    });

    autoUpdater.on("update-downloaded", () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("app-update-status", {
          status: "downloaded",
          message: "Update ready — will install on quit, or restart now.",
        });
      }
    });

    autoUpdater.on("error", (err) => {
      console.warn("autoUpdater:", err?.message || err);
    });

    ipcMain.handle("app-check-for-updates", async () => {
      try {
        const result = await autoUpdater.checkForUpdates();
        return { ok: true, version: result?.updateInfo?.version ?? null };
      } catch (e) {
        return { ok: false, error: e?.message || "check failed" };
      }
    });

    ipcMain.handle("app-quit-and-install", () => {
      autoUpdater.quitAndInstall(false, true);
    });

    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    }, 8000);
  } catch (e) {
    console.warn("electron-updater not available:", e?.message || e);
  }
}

function openReadmeOnce() {
  const flagPath = path.join(app.getPath("userData"), "readme-opened.flag");
  if (fs.existsSync(flagPath)) return;

  const possiblePaths = [
    path.join(process.resourcesPath, "AI_Video_Creator_README.pdf"),
    path.join(process.resourcesPath, "build", "AI_Video_Creator_README.pdf"),
    path.join(__dirname, "build", "AI_Video_Creator_README.pdf"),
    path.join(__dirname, "AI_Video_Creator_README.pdf"),
  ];

  const readmePath = possiblePaths.find((p) => fs.existsSync(p));
  if (!readmePath) return;

  setTimeout(() => {
    shell.openPath(readmePath);
    fs.writeFileSync(flagPath, "opened");
  }, 1500);
}

app.whenReady().then(() => {
  setupSystemIpc();
  setupBuildProgressIpc();
  setupDirectorIpc();
  createWindow();
  setupAutoUpdater();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
