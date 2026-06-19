import { describe, expect, it } from "vitest";
import { DEFAULT_DIRECTOR_SETTINGS } from "../app/lib/director-settings.js";
import {
  computeVideoLengthPunishment,
  durationPunishmentTimeMultiplier,
  parseDurationSeconds,
} from "../app/lib/video-length-punishment.js";
import {
  computeBuildPlan,
  estimateBuildDurationSeconds,
  estimateCoreBuildDurationSeconds,
} from "../app/lib/video-build-estimate.js";

const HIGH_END_STATS = {
  primaryGpu: { name: "RTX 4090", vramGb: 24, discrete: true },
  totalMemGb: 64,
  cpuCores: 16,
};

describe("video length punishment", () => {
  it("parses duration from settings", () => {
    expect(parseDurationSeconds({ durationSeconds: "15" })).toBe(15);
    expect(parseDurationSeconds({ durationSeconds: "bad" })).toBe(10);
  });

  it("adds zero punishment points within comfort zone", () => {
    const report = computeVideoLengthPunishment(
      { ...DEFAULT_DIRECTOR_SETTINGS, hardwareTier: "medium", durationSeconds: "10" },
      HIGH_END_STATS,
    );
    expect(report.punishmentPoints).toBe(0);
    expect(report.punishmentPercent).toBeLessThanOrEqual(28);
    expect(report.status).toBe("ok");
  });

  it("increases punishment for longer clips on weaker tiers", () => {
    const medium = computeVideoLengthPunishment(
      { ...DEFAULT_DIRECTOR_SETTINGS, hardwareTier: "medium", durationSeconds: "30" },
      null,
    );
    const low = computeVideoLengthPunishment(
      { ...DEFAULT_DIRECTOR_SETTINGS, hardwareTier: "low", durationSeconds: "30" },
      null,
    );
    expect(medium.punishmentPoints).toBeGreaterThan(0);
    expect(low.punishmentPoints).toBeGreaterThan(medium.punishmentPoints);
    expect(low.status).toBe("over");
  });

  it("time multiplier grows with duration over comfort", () => {
    const short = durationPunishmentTimeMultiplier(10, "medium");
    const long = durationPunishmentTimeMultiplier(30, "medium");
    expect(long).toBeGreaterThan(short);
  });

  it("build estimate includes duration punishment", () => {
    const base = estimateCoreBuildDurationSeconds(
      { ...DEFAULT_DIRECTOR_SETTINGS, hardwareTier: "medium", durationSeconds: "10" },
      HIGH_END_STATS,
    );
    const punished = estimateBuildDurationSeconds(
      { ...DEFAULT_DIRECTOR_SETTINGS, hardwareTier: "medium", durationSeconds: "30" },
      HIGH_END_STATS,
    );
    const coreLong = estimateCoreBuildDurationSeconds(
      { ...DEFAULT_DIRECTOR_SETTINGS, hardwareTier: "medium", durationSeconds: "30" },
      HIGH_END_STATS,
    );
    expect(punished).toBeGreaterThan(base);
    expect(punished).toBeGreaterThan(coreLong);
  });

  it("build plan includes duration punishment report and suggestions", () => {
    const plan = computeBuildPlan(
      { ...DEFAULT_DIRECTOR_SETTINGS, hardwareTier: "low", durationSeconds: "30" },
      HIGH_END_STATS,
    );
    expect(plan.durationPunishment).toBeTruthy();
    expect(plan.durationPunishment.punishmentPoints).toBeGreaterThan(0);
    expect(plan.durationPunishment.estimatedBuildLabel).toMatch(/^~/);
    expect(plan.durationPunishment.suggestedDurationSec).toBeLessThan(30);
    expect(plan.overallWithDurationPunishment).toBeGreaterThan(0);
  });
});
