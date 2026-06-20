import { describe, expect, it } from "vitest";
import {
  compareSemver,
  checkAddonUpdates,
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
    }
  });
});
