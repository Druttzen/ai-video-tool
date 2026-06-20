/**
 * Standalone All-in-One Setup Hub — forced scan, reinstall, update, and safe verification.
 * Shares userData with the main AI Video Creator app (%APPDATA%/AI Video Creator).
 */
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { defaultUserDataPath } = require("./scripts/lib/open-sora-paths.cjs");
const { forceInstallPipeline } = require("./scripts/lib/tool-installer.cjs");

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

function launchMainApp() {
  const exe = resolveMainAppExecutable();
  if (!fs.existsSync(exe)) {
    return { ok: false, error: `Main app not found at ${exe}` };
  }
  spawn(exe, [], { detached: true, stdio: "ignore" }).unref();
  return { ok: true, path: exe };
}

async function runAutoSetup() {
  if (setupRunning) return { ok: false, error: "Setup already running" };
  setupRunning = true;

  const userDataPath = app.getPath("userData");

  try {
    const pipeline = await forceInstallPipeline({
      userDataPath,
      onProgress: (payload) => {
        sendProgress(payload);
        if (payload.phase === "addon-done" && payload.item) {
          sendProgress({
            phase: "addon",
            item: payload.item,
            message: payload.item.message || payload.item.error || payload.item.id,
          });
        }
      },
    });

    const safeOk = Boolean(pipeline.safe?.ok);
    let proceed = null;

    if (safeOk) {
      sendProgress({ phase: "proceed", message: "Safe scan passed — launching AI Video Creator…" });
      proceed = launchMainApp();
      if (!proceed.ok) {
        sendProgress({
          phase: "proceed-skipped",
          message: proceed.error || "Main app not found — open manually when ready",
        });
      }
    }

    sendProgress({
      phase: "complete",
      ok: safeOk && pipeline.ok,
      message: safeOk
        ? proceed?.ok
          ? "Setup complete — AI Video Creator is starting."
          : "Setup complete — safe scan passed. Open AI Video Creator when ready."
        : pipeline.safe?.summary || "Setup finished with critical issues — review and retry.",
      report: pipeline.safe,
      audit: pipeline.audit,
      safe: pipeline.safe,
      results: pipeline.results,
      proceed,
    });

    return pipeline;
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
  ipcMain.handle("setup-hub:open-main", () => launchMainApp());
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
