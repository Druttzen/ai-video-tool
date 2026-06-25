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
  confirmAction: (payload) => ipcRenderer.invoke("app:confirm-action", payload),
  scanSetupEnvironment: (payload) => ipcRenderer.invoke("setup:scan-environment", payload),
  checkAddonUpdates: (payload) => ipcRenderer.invoke("setup:check-addon-updates", payload),
  updateAddon: (payload) => ipcRenderer.invoke("setup:update-addon", payload),
  updateAllAddons: (payload) => ipcRenderer.invoke("setup:update-all-addons", payload),
  scanMissingTools: (payload) => ipcRenderer.invoke("setup:scan-missing-tools", payload),
  installTools: (payload) => ipcRenderer.invoke("setup:install-tools", payload),
  onToolInstallProgress: (callback) => {
    if (typeof callback !== "function") return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("setup:tool-install-progress", handler);
    return () => ipcRenderer.removeListener("setup:tool-install-progress", handler);
  },
  getToolInstallProtocol: () => ipcRenderer.invoke("setup:tool-install-protocol"),
  analyzeMusicVideoBeats: (payload) => ipcRenderer.invoke("music-video:analyze-beats", payload),
  assembleMusicVideo: (payload) => ipcRenderer.invoke("music-video:assemble", payload),
  probeMusicVideoAddon: () => ipcRenderer.invoke("music-video:probe-ready"),
  loadAgentSession: () => ipcRenderer.invoke("agent:load-session"),
  saveAgentSession: (session) => ipcRenderer.invoke("agent:save-session", session),
  openExternal: (url) => ipcRenderer.invoke("app:open-external", url),
  readProjectBundleFile: (filePath) => ipcRenderer.invoke("project:read-bundle-file", filePath),
  consumePendingBundleImport: () => ipcRenderer.invoke("project:consume-pending-bundle"),
  onPendingBundleImport: (callback) => {
    if (typeof callback !== "function") return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("project:pending-bundle-import", handler);
    return () => ipcRenderer.removeListener("project:pending-bundle-import", handler);
  },
  openCanvas: (payload) => ipcRenderer.invoke("canvas:open", payload),
  pushCanvasUpdate: (payload) => ipcRenderer.invoke("canvas:update", payload),
  onCanvasRefreshRequest: (callback) => {
    if (typeof callback !== "function") return () => {};
    const handler = () => callback();
    ipcRenderer.on("canvas:refresh-requested", handler);
    return () => ipcRenderer.removeListener("canvas:refresh-requested", handler);
  },
});
