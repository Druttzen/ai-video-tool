const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("setupHubAPI", {
  onProgress: (callback) => {
    if (typeof callback !== "function") return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("setup-hub:progress", handler);
    return () => ipcRenderer.removeListener("setup-hub:progress", handler);
  },
  runAutoSetup: () => ipcRenderer.invoke("setup-hub:run-auto"),
  getVersion: () => ipcRenderer.invoke("setup-hub:version"),
  openExternal: (url) => ipcRenderer.invoke("setup-hub:open-external", url),
  openMainApp: () => ipcRenderer.invoke("setup-hub:open-main"),
});
