import { describe, expect, it } from "vitest";
import {
  buildSetupScanFromHost,
  getSetupHubModules,
  summarizeSetupScan,
} from "../app/lib/setup-hub.js";

describe("setup hub", () => {
  it("loads manifest modules", () => {
    const modules = getSetupHubModules();
    expect(modules.length).toBeGreaterThanOrEqual(10);
    expect(modules.some((m) => m.id === "director")).toBe(true);
    expect(modules.some((m) => m.id === "open-sora")).toBe(true);
  });

  it("buildSetupScanFromHost maps host scan to module rows", () => {
    const scan = buildSetupScanFromHost(
      {
        ok: true,
        scan: {
          scannedAt: "2026-06-03T12:00:00.000Z",
          electron: { packaged: true },
          python: { ok: true, path: "C:\\Python311\\python.exe", version: "3.11.0" },
          pipeline: { ok: true, path: "E:\\Open-Sora" },
          openSora: { ok: true, path: "E:\\Open-Sora" },
          ffmpeg: { ok: true, path: "ffmpeg", bundled: false },
          gpu: { primaryGpu: { name: "RTX 4090", vramGb: 24 } },
        },
      },
      { coProducerLlmSettings: { enabled: true, apiKey: "sk-test", apiUrl: "https://api.openai.com/v1/chat/completions" } },
    );

    expect(scan.modules.python.status).toBe("ready");
    expect(scan.modules.pipeline.status).toBe("ready");
    expect(scan.modules["open-sora"].status).toBe("ready");
    expect(scan.modules.gpu.status).toBe("ready");
    expect(scan.modules["co-producer"].status).toBe("ready");
  });

  it("summarizeSetupScan reports maxed profile when core modules ready", () => {
    const scan = buildSetupScanFromHost({
      ok: true,
      scan: {
        electron: { packaged: true },
        python: { ok: true, version: "3.11" },
        pipeline: { ok: true, path: "E:\\Open-Sora" },
        openSora: { ok: true, path: "E:\\Open-Sora" },
        ffmpeg: { ok: false },
        gpu: { primaryGpu: { name: "GPU" } },
      },
    });

    const summary = summarizeSetupScan(scan);
    expect(summary.ready).toBeGreaterThanOrEqual(6);
    expect(summary.label).toContain("local MP4 ready");
  });

  it("summarizeSetupScan does not claim maxed profile without python and pipeline", () => {
    const scan = buildSetupScanFromHost({
      ok: true,
      scan: {
        electron: { packaged: true },
        python: { ok: false },
        pipeline: { ok: false },
        openSora: { ok: false },
        ffmpeg: { ok: false },
        gpu: { primaryGpu: { name: "GPU" } },
      },
    });

    const summary = summarizeSetupScan(scan);
    expect(summary.localRenderReady).toBe(false);
    expect(summary.label).not.toContain("local MP4 ready");
  });

  it("summarizeSetupScan handles missing scan", () => {
    expect(summarizeSetupScan(null).label).toBe("Not scanned");
  });
});
