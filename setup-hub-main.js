/**
 * Standalone All-in-One Setup Hub — scan + install all managed addons on launch.
 * Shares userData with the main AI Video Creator app (%APPDATA%/AI Video Creator).
 */
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { defaultUserDataPath } = require("./scripts/lib/open-sora-paths.cjs");
const { scanSetupEnvironment } = require("./scripts/lib/environment-scan.cjs");
const { installTools, scanMissingAddons } = require("./scripts/lib/tool-installer.cjs");
const { checkAddonUpdates } = require("./scripts/lib/addon-updater.cjs");

const pkg = require("./package.json");

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.setPath("userData", defaultUserDataPath());

let mainWindow = null;
let setupRunning = false;

function sendProgress(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("setup-hub:progress", payload);
  }
}

function resolveMainAppExecutable() {
  const installDir = path.dirname(process.execPath);
  const candidates = [
    path.join(installDir, "ai-video-tool.exe"),
    path.join(installDir, "AI Video Creator.exe"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

async function runAutoSetup() {
  if (setupRunning) return { ok: false, error: "Setup already running" };
  setupRunning = true;

  const userDataPath = app.getPath("userData");

  try {
    sendProgress({ phase: "scan", message: "Scanning environment and managed addons…" });

    const envScan = await scanSetupEnvironment({ userDataPath });
    const preScan = await scanMissingAddons({ userDataPath });

    sendProgress({
      phase: "scan-done",
      message: preScan.summary,
      envScan: { platform: envScan.platform, forceManaged: envScan.forceManaged },
      report: preScan,
    });

    if (preScan.missingCount === 0) {
      sendProgress({
        phase: "complete",
        ok: true,
        message: "All managed addons are already installed.",
        report: preScan,
        results: [],
      });
      return { ok: true, skipped: true, postScan: preScan };
    }

    sendProgress({
      phase: "install",
      message: `Installing ${preScan.missingCount} addon(s) — this may take a long time (Python, Open-Sora, torch)…`,
      missingIds: preScan.missingIds,
    });

    const batch = await installTools({ userDataPath, skipScan: true });

    for (const row of batch.results || []) {
      sendProgress({
        phase: "addon",
        item: row,
        message: row.message || row.error || row.id,
      });
    }

    const postScan = batch.postScan || (await scanMissingAddons({ userDataPath }));
    const check = await checkAddonUpdates({ scan: envScan, userDataPath });

    sendProgress({
      phase: "complete",
      ok: Boolean(batch.ok),
      message: batch.ok
        ? postScan.missingCount === 0
          ? "All managed addons installed successfully."
          : `${postScan.missingCount} item(s) still need attention (e.g. Git or model weights).`
        : "Some addon installs failed — review the log below and retry.",
      report: postScan,
      check,
      results: batch.results,
    });

    return batch;
  } catch (e) {
    const message = e?.message || String(e);
    sendProgress({ phase: "error", ok: false, error: message });
    return { ok: false, error: message };
  } finally {
    setupRunning = false;
  }
}

function createWindow() {
  const iconPath = path.join(__dirname, "icon.ico");
  const windowOptions = {
    title: `All-in-One Setup Hub v${pkg.version}`,
    width: 720,
    height: 640,
    minWidth: 520,
    minHeight: 480,
    backgroundColor: "#0b0d10",
    show: false,
    resizable: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "setup-hub-preload.js"),
    },
  };

  if (fs.existsSync(iconPath)) {
    windowOptions.icon = iconPath;
  }

  mainWindow = new BrowserWindow(windowOptions);

  const indexPath = path.join(__dirname, "setup-hub", "index.html");
  if (!fs.existsSync(indexPath)) {
    app.quit();
    return;
  }

  mainWindow.loadFile(indexPath);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    void runAutoSetup();
  });
}

function setupIpc() {
  ipcMain.handle("setup-hub:run-auto", () => runAutoSetup());
  ipcMain.handle("setup-hub:version", () => ({ version: pkg.version }));
  ipcMain.handle("setup-hub:open-external", async (_event, url) => {
    const target = String(url || "").trim();
    if (!target) return { ok: false, error: "URL required" };
    await shell.openExternal(target);
    return { ok: true };
  });
  ipcMain.handle("setup-hub:open-main", () => {
    const exe = resolveMainAppExecutable();
    if (!fs.existsSync(exe)) {
      return { ok: false, error: `Main app not found at ${exe}` };
    }
    spawn(exe, [], { detached: true, stdio: "ignore" }).unref();
    return { ok: true, path: exe };
  });
}

app.whenReady().then(() => {
  setupIpc();
  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("second-instance", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
