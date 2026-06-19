import { describe, expect, it } from "vitest";
import { computeBuildLoadReport } from "../app/lib/video-build-load.js";
import {
  computeBuildPlan,
  estimateBuildDurationSeconds,
  estimateCoreBuildDurationSeconds,
  formatBuildDuration,
  formatCountdown,
} from "../app/lib/video-build-estimate.js";
import { DEFAULT_DIRECTOR_SETTINGS } from "../app/lib/director-settings.js";

describe("video build load & estimate", () => {
  const highEndStats = {
    primaryGpu: { name: "RTX 4090", vramGb: 24, discrete: true },
    totalMemGb: 64,
    cpuCores: 16,
  };

  it("reports over limit when frames exceed tier", () => {
    const report = computeBuildLoadReport(
      {
        ...DEFAULT_DIRECTOR_SETTINGS,
        hardwareTier: "low",
        numFrames: 200,
        numSteps: 50,
        resolution: "1024px",
      },
      null,
    );
    expect(report.overLimit).toBe(true);
    expect(report.metrics.find((m) => m.key === "length")?.percent).toBeGreaterThan(100);
  });

  it("increases load when scaling FX and advanced settings", () => {
    const base = computeBuildLoadReport({ ...DEFAULT_DIRECTOR_SETTINGS, hardwareTier: "medium" }, null);
    const heavy = computeBuildLoadReport(
      {
        ...DEFAULT_DIRECTOR_SETTINGS,
        hardwareTier: "medium",
        qualityPreset: "PREMIUM",
        numSteps: 60,
        motionScore: 8,
        cfg: 9,
        lightingSetup: "neon",
        cameraPreset: "orbit",
        colorGrade: "teal",
        useI2vWhenImage: true,
        refinePrompt: true,
      },
      null,
    );
    expect(heavy.overallPercent).toBeGreaterThan(base.overallPercent);
  });

  it("estimates longer builds for larger resolution and more frames", () => {
    const short = estimateBuildDurationSeconds(
      { ...DEFAULT_DIRECTOR_SETTINGS, resolution: "256px", numFrames: 65, numSteps: 20, durationSeconds: "10" },
      highEndStats,
    );
    const long = estimateBuildDurationSeconds(
      { ...DEFAULT_DIRECTOR_SETTINGS, resolution: "1024px", numFrames: 193, numSteps: 60, durationSeconds: "10" },
      highEndStats,
    );
    expect(long).toBeGreaterThan(short);
  });

  it("longer output duration increases estimate beyond core pipeline cost", () => {
    const settings = { ...DEFAULT_DIRECTOR_SETTINGS, hardwareTier: "medium", durationSeconds: "10" };
    const short = estimateBuildDurationSeconds(settings, highEndStats);
    const long = estimateBuildDurationSeconds({ ...settings, durationSeconds: "30" }, highEndStats);
    const core = estimateCoreBuildDurationSeconds({ ...settings, durationSeconds: "30" }, highEndStats);
    expect(long).toBeGreaterThan(short);
    expect(long).toBeGreaterThan(core);
  });

  it("build plan includes estimated label", () => {
    const plan = computeBuildPlan(DEFAULT_DIRECTOR_SETTINGS, highEndStats);
    expect(plan.estimatedSeconds).toBeGreaterThan(0);
    expect(plan.estimatedLabel).toMatch(/^~/);
    expect(plan.metrics.length).toBeGreaterThan(0);
  });

  it("formats duration and countdown", () => {
    expect(formatBuildDuration(45)).toBe("~45s");
    expect(formatBuildDuration(125)).toBe("~2m 5s");
    expect(formatCountdown(125)).toBe("2:05");
    expect(formatCountdown(8)).toBe("8s");
  });
});
