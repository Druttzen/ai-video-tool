import { describe, expect, it } from "vitest";
import {
  applyBenchmarkSuggestion,
  autoApplyRecommendedBenchmark,
  buildBenchmarkAutoContextKey,
  scoreProjectDemand,
  shouldAutoApplyRecommendedBenchmark,
  suggestBenchmarkSettings,
} from "../app/lib/benchmark-settings.js";
import { DEFAULT_DIRECTOR_SETTINGS } from "../app/lib/director-settings.js";

const HIGH_END_STATS = {
  primaryGpu: { name: "RTX 4090", vramGb: 24, discrete: true },
  totalMemGb: 64,
  cpuCores: 16,
};

const HEAVY_PROJECT = {
  idea: "A".repeat(900),
  selectedGenres: ["Cinematic", "Synthwave", "Noir"],
  selectedSounds: ["Neon", "Fog"],
  selectedRhythms: ["Dolly", "Crane"],
  generatedLyrics: "[Verse]\nLine",
  imageAnalysis: { summary: "ref" },
};

describe("benchmark settings suggestions", () => {
  it("scores heavier projects higher demand", () => {
    const light = scoreProjectDemand({ idea: "short" }, DEFAULT_DIRECTOR_SETTINGS);
    const heavy = scoreProjectDemand(HEAVY_PROJECT, {
      ...DEFAULT_DIRECTOR_SETTINGS,
      qualityPreset: "PREMIUM",
      durationSeconds: "20",
      lightingSetup: "neon",
      cameraPreset: "orbit",
    });
    expect(heavy).toBeGreaterThan(light);
  });

  it("returns four benchmark suggestions", () => {
    const report = suggestBenchmarkSettings({
      settings: DEFAULT_DIRECTOR_SETTINGS,
      stats: HIGH_END_STATS,
      project: HEAVY_PROJECT,
      opts: { promptLength: 900, useI2v: true },
    });
    expect(report.suggestions).toHaveLength(4);
    expect(report.primaryId).toBe("recommended");
    expect(report.tierLabel).toBeTruthy();
  });

  it("recommended suggestion stays within reasonable load", () => {
    const report = suggestBenchmarkSettings({
      settings: DEFAULT_DIRECTOR_SETTINGS,
      stats: HIGH_END_STATS,
      project: { idea: "test scene" },
    });
    const rec = report.suggestions.find((s) => s.id === "recommended");
    expect(rec.loadPercent).toBeLessThanOrEqual(100);
    expect(rec.settings.numSteps).toBeGreaterThan(0);
    expect(rec.estimatedLabel).toMatch(/^~/);
  });

  it("quick smoke uses lower steps than max safe", () => {
    const report = suggestBenchmarkSettings({
      settings: DEFAULT_DIRECTOR_SETTINGS,
      stats: HIGH_END_STATS,
      project: {},
    });
    const quick = report.suggestions.find((s) => s.id === "quick-smoke");
    const max = report.suggestions.find((s) => s.id === "max-safe");
    expect(quick.settings.numSteps).toBeLessThan(max.settings.numSteps);
    expect(quick.settings.numFrames).toBeLessThan(max.settings.numFrames);
  });

  it("applyBenchmarkSuggestion merges settings", () => {
    const report = suggestBenchmarkSettings({
      settings: DEFAULT_DIRECTOR_SETTINGS,
      stats: HIGH_END_STATS,
      project: {},
    });
    const applied = applyBenchmarkSuggestion(DEFAULT_DIRECTOR_SETTINGS, report.primary);
    expect(applied.benchmarkProfile).toBe("recommended");
    expect(applied.hardwareTier).toBeTruthy();
  });

  it("auto-applies recommended on first context", () => {
    const report = suggestBenchmarkSettings({
      settings: DEFAULT_DIRECTOR_SETTINGS,
      stats: HIGH_END_STATS,
      project: {},
    });
    const applied = autoApplyRecommendedBenchmark({
      settings: DEFAULT_DIRECTOR_SETTINGS,
      report,
      opts: { useI2v: false, promptLength: 0 },
    });
    expect(applied).not.toBeNull();
    expect(applied.benchmarkProfile).toBe("recommended");
    expect(applied.benchmarkAutoApplied).toBe(true);
    expect(applied.benchmarkAutoContextKey).toBeTruthy();
  });

  it("skips auto-apply when context unchanged", () => {
    const report = suggestBenchmarkSettings({
      settings: DEFAULT_DIRECTOR_SETTINGS,
      stats: HIGH_END_STATS,
      project: {},
    });
    const first = autoApplyRecommendedBenchmark({
      settings: DEFAULT_DIRECTOR_SETTINGS,
      report,
      opts: { useI2v: false, promptLength: 0 },
    });
    const second = autoApplyRecommendedBenchmark({
      settings: first,
      report,
      opts: { useI2v: false, promptLength: 0 },
    });
    expect(second).toBeNull();
  });

  it("skips auto-apply when user chose another profile", () => {
    const report = suggestBenchmarkSettings({
      settings: DEFAULT_DIRECTOR_SETTINGS,
      stats: HIGH_END_STATS,
      project: {},
    });
    const manual = {
      ...DEFAULT_DIRECTOR_SETTINGS,
      benchmarkProfile: "max-safe",
    };
    expect(shouldAutoApplyRecommendedBenchmark(manual)).toBe(false);
    expect(
      autoApplyRecommendedBenchmark({
        settings: manual,
        report,
        opts: { useI2v: false, promptLength: 0 },
      }),
    ).toBeNull();
  });

  it("re-auto-applies when context key changes", () => {
    const report = suggestBenchmarkSettings({
      settings: DEFAULT_DIRECTOR_SETTINGS,
      stats: HIGH_END_STATS,
      project: {},
    });
    const first = autoApplyRecommendedBenchmark({
      settings: DEFAULT_DIRECTOR_SETTINGS,
      report,
      opts: { useI2v: false, promptLength: 0 },
    });
    const newKey = buildBenchmarkAutoContextKey({
      tier: report.tier,
      demand: report.demand,
      useI2v: true,
      promptLength: 600,
    });
    expect(newKey).not.toBe(first.benchmarkAutoContextKey);
    const again = autoApplyRecommendedBenchmark({
      settings: first,
      report,
      opts: { useI2v: true, promptLength: 600 },
    });
    expect(again).not.toBeNull();
    expect(again.benchmarkAutoContextKey).toBe(newKey);
  });
});
