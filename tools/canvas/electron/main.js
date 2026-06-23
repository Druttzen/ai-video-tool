/**
 * Standalone Electron entry for Canvas development.
 * Run: npm run canvas:electron (from repo root, with canvas:dev in another terminal)
 */
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

const DEV_URL = process.env.CANVAS_DEV_URL || "http://localhost:5174";

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
  if (process.env.CANVAS_DEV_URL || !require("fs").existsSync(builtIndex)) {
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
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
