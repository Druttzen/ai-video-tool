import { describe, expect, it } from "vitest";
import {
  compareSemver,
  checkAddonUpdates,
  loadAddonManifest,
  normalizeHostScan,
} from "../scripts/lib/addon-updater.cjs";

describe("addon-updater", () => {
  it("compareSemver orders versions", () => {
    expect(compareSemver("3.10.0", "3.11.9")).toBeLessThan(0);
    expect(compareSemver("3.11.9", "3.11.9")).toBe(0);
    expect(compareSemver("3.12.0", "3.11.9")).toBeGreaterThan(0);
  });

  it("checkAddonUpdates reports python below recommended", async () => {
    const report = await checkAddonUpdates({
      scan: {
        python: { ok: true, version: "3.9.0", path: "python" },
        ffmpeg: { ok: false },
        openSora: { ok: false },
      },
      userDataPath: "",
      openSoraPath: "",
    });
    expect(report.ok).toBe(true);
    const py = report.items.find((i) => i.id === "python");
    expect(py?.updateAvailable).toBe(true);
  });

  it("checkAddonUpdates skips python update when version exceeds minimum", async () => {
    const report = await checkAddonUpdates({
      scan: {
        python: { ok: true, version: "3.14.4", path: "python" },
        ffmpeg: { ok: true, path: "ffmpeg" },
        openSora: { ok: true, path: "C:\\Open-Sora" },
      },
      userDataPath: "",
      openSoraPath: "C:\\Open-Sora",
    });
    const py = report.items.find((i) => i.id === "python");
    expect(py?.updateAvailable).toBe(false);
  });

  it("checkAddonUpdates marks ffmpeg update on windows when missing", async () => {
    const report = await checkAddonUpdates({
      scan: { python: { ok: true, version: "3.11.9" }, ffmpeg: { ok: false }, openSora: { ok: true, path: "C:\\Open-Sora" } },
      userDataPath: "",
      openSoraPath: "C:\\Open-Sora",
    });
    const ff = report.items.find((i) => i.id === "ffmpeg");
    if (process.platform === "win32") {
      expect(ff?.updateAvailable).toBe(true);
      expect(ff?.latestVersion).toBe("latest");
    }
  });

  it("normalizeHostScan unwraps Setup Hub UI scan shape", () => {
    const host = {
      python: { ok: true, version: "3.11.9", path: "python" },
      ffmpeg: { ok: true, bundled: true, path: "ffmpeg.exe" },
      openSora: { ok: true, path: "C:\\Open-Sora" },
    };
    const uiScan = {
      scannedAt: "2026-01-01T00:00:00.000Z",
      modules: { python: { status: "ready" } },
      raw: host,
    };
    expect(normalizeHostScan(uiScan)).toEqual(host);
    expect(normalizeHostScan({ scan: host })).toEqual(host);
    expect(normalizeHostScan(host)).toEqual(host);
  });

  it("checkAddonUpdates accepts Setup Hub UI scan without false python missing", async () => {
    const host = {
      python: { ok: true, version: "3.14.4", path: "python" },
      ffmpeg: { ok: true, path: "ffmpeg" },
      openSora: { ok: true, path: "C:\\Open-Sora" },
    };
    const report = await checkAddonUpdates({
      scan: { modules: { python: { status: "ready" } }, raw: host },
      userDataPath: "",
      openSoraPath: "C:\\Open-Sora",
    });
    const py = report.items.find((i) => i.id === "python");
    expect(py?.installed).toBe(true);
    expect(py?.updateAvailable).toBe(false);
    expect(py?.message).not.toMatch(/not detected/i);
  });

  it("ffmpeg manifest uses live BtbN latest release URL", () => {
    const manifest = loadAddonManifest();
    const url = manifest.addons.ffmpeg.builds.win32.url;
    expect(url).toContain("/releases/download/latest/");
    expect(url).not.toContain("/releases/download/v6.1.1/");
  });
});
