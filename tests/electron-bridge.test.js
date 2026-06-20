import { describe, expect, it, afterEach, vi } from "vitest";
import {
  checkForAppUpdates,
  isElectronApp,
  quitAndInstallUpdate,
  subscribeToUpdateStatus,
} from "../app/lib/electron-bridge.js";

describe("electron-bridge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("isElectronApp is false in the browser", () => {
    vi.stubGlobal("window", {});
    expect(isElectronApp()).toBe(false);
  });

  it("checkForAppUpdates returns a helpful error outside Electron", async () => {
    vi.stubGlobal("window", {});
    await expect(checkForAppUpdates()).resolves.toEqual({
      ok: false,
      error: "Updates are only available in the desktop app",
    });
  });

  it("wires update IPC when electronAPI is present", async () => {
    const handlers = [];
    vi.stubGlobal("window", {
      electronAPI: {
        checkForUpdates: async () => ({ ok: true, version: "1.0.1" }),
        quitAndInstall: async () => {},
        onUpdateStatus: (callback) => {
          handlers.push(callback);
          return () => {};
        },
      },
    });

    expect(isElectronApp()).toBe(true);
    await expect(checkForAppUpdates()).resolves.toEqual({ ok: true, version: "1.0.1" });
    await expect(quitAndInstallUpdate()).resolves.toBeUndefined();

    const unsubscribe = subscribeToUpdateStatus((payload) => {
      expect(payload).toEqual({ status: "available" });
    });
    handlers[0]({ status: "available" });
    unsubscribe();
  });
});
