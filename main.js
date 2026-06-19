const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const pkg = require("./package.json");

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

function setupOpenSoraIpc() {
  ipcMain.handle("open-sora:launch-job", async (_event, payload) => {
    try {
      const job = payload?.job || {};
      const imagePayload = payload?.imagePayload;
      const pythonPath = payload?.pythonPath || job.pythonPath || "python";
      const mode = payload?.mode || "pipeline";

      const jobsDir = path.join(app.getPath("userData"), "open-sora-jobs");
      fs.mkdirSync(jobsDir, { recursive: true });
      const stamp = Date.now();
      const jobPath = path.join(jobsDir, `job-${stamp}.json`);
      const logPath = path.join(jobsDir, `job-${stamp}.log`);

      if (imagePayload?.base64 && imagePayload?.name) {
        const safeName = String(imagePayload.name).replace(/[^\w.\-]+/g, "_");
        const refPath = path.join(jobsDir, `ref-${stamp}-${safeName}`);
        fs.writeFileSync(refPath, Buffer.from(imagePayload.base64, "base64"));
        job.ref_image = refPath;
        job.cond_type = "i2v_head";
        job.i2v = true;
      }

      fs.writeFileSync(jobPath, JSON.stringify(job, null, 2));

      const installPath = job.installPath || "E:\\Open-Sora";
      if (mode === "ui") {
        const appPro = path.join(installPath, "app_pro.py");
        if (!fs.existsSync(appPro)) {
          return { ok: false, error: `app_pro.py not found: ${appPro}` };
        }
        const uiProc = spawn(pythonPath, [appPro], {
          cwd: installPath,
          detached: true,
          stdio: "ignore",
          shell: process.platform === "win32",
        });
        uiProc.unref();
        return { ok: true, jobPath, logPath, ui: true, message: "Open-Sora UI launched" };
      }

      const runnerScript = path.join(__dirname, "scripts", "run-open-sora-job.py");
      if (!fs.existsSync(runnerScript)) {
        return { ok: false, error: `Runner not found: ${runnerScript}` };
      }

      const logStream = fs.createWriteStream(logPath, { flags: "a" });
      const child = spawn(pythonPath, [runnerScript, jobPath], {
        cwd: installPath,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      });

      child.stdout.on("data", (d) => logStream.write(d));
      child.stderr.on("data", (d) => logStream.write(d));
      child.on("close", (code) => {
        logStream.write(`\n--- exit ${code} ---\n`);
        logStream.end();
      });
      child.unref();

      return {
        ok: true,
        jobPath,
        logPath,
        pid: child.pid,
        message: "Open-Sora pipeline started in background",
      };
    } catch (e) {
      return { ok: false, error: e?.message || "launch failed" };
    }
  });

  ipcMain.handle("open-sora:open-ui", async (_event, payload) => {
    try {
      const installPath = payload?.installPath || "E:\\Open-Sora";
      const pythonPath = payload?.pythonPath || "python";
      const appPro = path.join(installPath, "app_pro.py");
      if (!fs.existsSync(appPro)) {
        return { ok: false, error: `app_pro.py not found: ${appPro}` };
      }
      const uiProc = spawn(pythonPath, [appPro], {
        cwd: installPath,
        detached: true,
        stdio: "ignore",
        shell: process.platform === "win32",
      });
      uiProc.unref();
      return { ok: true, message: "Open-Sora UI launched" };
    } catch (e) {
      return { ok: false, error: e?.message || "ui launch failed" };
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
  setupOpenSoraIpc();
  createWindow();
  setupAutoUpdater();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
