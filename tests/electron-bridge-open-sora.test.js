import { describe, expect, it, vi } from "vitest";
import {
  launchOpenSoraJob,
  openOpenSoraUi,
  syncOpenSoraCatalog,
} from "../app/lib/electron-bridge.js";

describe("electron bridge open-sora", () => {
  it("returns error outside Electron", async () => {
    expect(await launchOpenSoraJob({ job: {} })).toMatchObject({ ok: false });
    expect(await openOpenSoraUi({ installPath: "E:\\Open-Sora" })).toMatchObject({ ok: false });
    expect(await syncOpenSoraCatalog("E:\\Open-Sora")).toMatchObject({ ok: false });
  });

  it("delegates to preload API in Electron", async () => {
    const launchOpenSoraJobMock = vi.fn(async () => ({ ok: true, message: "started" }));
    const openOpenSoraUiMock = vi.fn(async () => ({ ok: true, message: "ui" }));
    const syncOpenSoraCatalogMock = vi.fn(async () => ({ ok: true, message: "synced" }));

    vi.stubGlobal("window", {
      electronAPI: {
        launchOpenSoraJob: launchOpenSoraJobMock,
        openOpenSoraUi: openOpenSoraUiMock,
        syncOpenSoraCatalog: syncOpenSoraCatalogMock,
      },
    });

    await launchOpenSoraJob({ job: { installPath: "E:\\Open-Sora" } });
    await openOpenSoraUi({ installPath: "E:\\Open-Sora", pythonPath: "python" });
    await syncOpenSoraCatalog("E:\\Open-Sora");

    expect(launchOpenSoraJobMock).toHaveBeenCalledOnce();
    expect(openOpenSoraUiMock).toHaveBeenCalledOnce();
    expect(syncOpenSoraCatalogMock).toHaveBeenCalledWith("E:\\Open-Sora");

    vi.unstubAllGlobals();
  });
});
