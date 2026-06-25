"use strict";
const path = require("path");
const { app, BrowserWindow } = require("electron");
const { resolveUserDataPath } = require("../open-sora-paths.cjs");
const { setAppRoot, state } = require("./state.cjs");
const runtime = require("./app-runtime.cjs");

function registerProcessHandlers() {
  const {
    extractBundlePathFromArgv,
    queueBundleImport,
    appendMainLog,
  } = runtime;

  if (process.env.E2E_ELECTRON !== "1" && !app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
  }

  app.on("second-instance", (_event, argv) => {
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      if (state.mainWindow.isMinimized()) state.mainWindow.restore();
      state.mainWindow.focus();
    }
    const bundlePath = extractBundlePathFromArgv(argv);
    if (bundlePath) queueBundleImport(bundlePath);
  });

  process.on("uncaughtException", (err) => {
    const message = err?.stack || err?.message || String(err);
    appendMainLog(`uncaughtException: ${message}`);
    console.error(err);
  });

  process.on("unhandledRejection", (reason) => {
    const message = reason?.stack || reason?.message || String(reason);
    appendMainLog(`unhandledRejection: ${message}`);
    console.error(reason);
  });
}

function registerIpcHandlers() {
  runtime.setupAppIpc();
  runtime.setupProjectImportIpc();
  runtime.setupSystemIpc();
  runtime.setupMusicVideoSyncIpc();
  runtime.setupSetupHubIpc();
  runtime.setupAgentSessionIpc();
  runtime.setupAddonUpdaterIpc();
  runtime.setupBuildProgressIpc();
  runtime.setupDirectorIpc();
  runtime.setupOpenSoraIpc();
  runtime.setupCanvasIpc();
}

function bootstrap(appRoot) {
  setAppRoot(appRoot);
  app.setPath("userData", resolveUserDataPath(appRoot));
  registerProcessHandlers();

  app.whenReady().then(() => {
    const startupBundle = runtime.extractBundlePathFromArgv(process.argv);
    if (startupBundle) {
      state.pendingBundleImportPath = startupBundle;
      state.bundlePathGuard.register(startupBundle);
    }

    if (!app.isPackaged && process.defaultApp) {
      app.setAsDefaultProtocolClient("aivideo", process.execPath, [path.resolve(process.argv[1])]);
    } else {
      app.setAsDefaultProtocolClient("aivideo");
    }

    registerIpcHandlers();
    runtime.createWindow();
    runtime.setupAutoUpdater();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) runtime.createWindow();
  });
}

module.exports = { bootstrap };
