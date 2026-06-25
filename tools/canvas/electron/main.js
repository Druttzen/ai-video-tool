/**
 * Standalone Electron entry for Canvas development.
 * Run: npm run canvas:electron (from repo root, with canvas:dev in another terminal)
 */
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");

const DEV_URL = process.env.CANVAS_DEV_URL || "http://localhost:5174";
const pkg = require("../../../package.json");

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    title: "AI Video Creator — Canvas (dev)",
    width: 1100,
    height: 800,
    backgroundColor: "#0b0d10",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const builtIndex = path.join(__dirname, "..", "build", "index.html");
  if (process.env.CANVAS_DEV_URL || !fs.existsSync(builtIndex)) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadFile(builtIndex);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  ipcMain.handle("canvas:get-payload", async () => null);
  ipcMain.handle("canvas:get-version", async () => ({ ok: true, version: pkg.version }));
  ipcMain.handle("canvas:reveal-path", async (_event, filePath) => {
    try {
      const target = String(filePath || "").trim();
      if (!target || !fs.existsSync(target)) {
        return { ok: false, error: "Path not found" };
      }
      shell.showItemInFolder(target);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e?.message || "reveal failed" };
    }
  });
  ipcMain.handle("canvas:request-refresh", async () => ({ ok: false, error: "Main app not available in dev mode" }));
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
