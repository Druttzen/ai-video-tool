const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("canvasAPI", {
  getInitialPayload: () => ipcRenderer.invoke("canvas:get-payload"),
  onPayload: (callback) => {
    if (typeof callback !== "function") return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("canvas:payload", handler);
    return () => ipcRenderer.removeListener("canvas:payload", handler);
  },
  getAppVersion: () => ipcRenderer.invoke("canvas:get-version"),
  revealPath: (filePath) => ipcRenderer.invoke("canvas:reveal-path", filePath),
  requestRefresh: () => ipcRenderer.invoke("canvas:request-refresh"),
});
