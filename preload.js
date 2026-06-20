const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  checkForUpdates: () => ipcRenderer.invoke("app-check-for-updates"),
  quitAndInstall: () => ipcRenderer.invoke("app-quit-and-install"),
  onUpdateStatus: (callback) => {
    if (typeof callback !== "function") return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("app-update-status", handler);
    return () => ipcRenderer.removeListener("app-update-status", handler);
  },
  launchDirectorJob: (payload) => ipcRenderer.invoke("director:launch-job", payload),
  launchOpenSoraJob: (payload) => ipcRenderer.invoke("open-sora:launch-job", payload),
  openOpenSoraUi: (payload) => ipcRenderer.invoke("open-sora:open-ui", payload),
  syncOpenSoraCatalog: (installPath) => ipcRenderer.invoke("open-sora:sync-catalog", installPath),
  getSystemStats: () => ipcRenderer.invoke("system:get-stats"),
  getDirectorBuildStatus: (payload) => ipcRenderer.invoke("director:get-build-status", payload),
  cancelDirectorBuild: (payload) => ipcRenderer.invoke("director:cancel-build", payload),
  revealDirectorOutput: (filePath) => ipcRenderer.invoke("director:reveal-output", filePath),
});
