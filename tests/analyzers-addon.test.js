import { describe, expect, it } from "vitest";
import {
  ANALYZERS_ADDON_CAPABILITIES,
  buildAnalyzersExport,
  summarizeAnalyzersPair,
  summarizeAudioAnalysis,
  summarizeImageAnalysis,
} from "../app/lib/analyzers-addon.js";
import { analyzeImagePixelData } from "../app/lib/image-analyzer.js";

describe("analyzers-addon", () => {
  const rgba = new Uint8ClampedArray(160 * 120 * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 40;
    rgba[i + 1] = 120;
    rgba[i + 2] = 200;
    rgba[i + 3] = 255;
  }

  it("exposes analyzer capabilities", () => {
    expect(ANALYZERS_ADDON_CAPABILITIES).toContain("browser-audio-dsp");
    expect(ANALYZERS_ADDON_CAPABILITIES).toContain("build-intent-synthesis");
  });

  it("summarizes audio analysis with beat sync hints", () => {
    const summary = summarizeAudioAnalysis({
      fileName: "track.wav",
      duration: 180,
      bpm: 128,
      estimatedKey: "A minor",
      energy: 72,
      highlightStart: 30,
      highlightEnd: 60,
      highlightLabel: "Peak energy section",
      beatSync: { clipPlan: [{ start: 0, end: 6 }, { start: 6, end: 12 }], source: "librosa" },
    });
    expect(summary.ready).toBe(true);
    expect(summary.clipCount).toBe(2);
    expect(summary.beatSyncReady).toBe(true);
  });

  it("summarizes image analysis with hue and aspect", () => {
    const analysis = analyzeImagePixelData(rgba, "ref.jpg", { width: 1920, height: 1080 });
    const summary = summarizeImageAnalysis(analysis);
    expect(summary.ready).toBe(true);
    expect(summary.aspectLabel).toBe("landscape");
    expect(summary.hueLabel).toBeTruthy();
    expect(summary.source).toBe("browser-canvas");
  });

  it("detects Path E readiness when both analyzers present", () => {
    const pair = summarizeAnalyzersPair({ fileName: "a.wav", duration: 60 }, { fileName: "b.jpg" });
    expect(pair.pathEReady).toBe(true);
    expect(pair.hint).toContain("Path E");
  });

  it("builds export payload with pair summary", () => {
    const analysis = analyzeImagePixelData(rgba, "ref.jpg", { width: 800, height: 800 });
    const payload = buildAnalyzersExport(
      { fileName: "track.wav", duration: 120, energy: 50 },
      analysis,
      { userRequest: "Beat-sync neon MV" },
    );
    expect(payload.capabilities).toEqual(ANALYZERS_ADDON_CAPABILITIES);
    expect(payload.buildIntent?.ok).toBe(true);
    expect(payload.audio?.summary.ready).toBe(true);
    expect(payload.image?.summary.aspectLabel).toBe("square");
    expect(payload.pair.bothReady).toBe(true);
  });
});
