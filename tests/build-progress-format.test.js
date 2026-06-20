import { describe, expect, it } from "vitest";
import {
  computeFinishAtMs,
  formatBuildCountdown,
  formatFinishTime,
} from "../app/lib/build-progress-format.js";

describe("build-progress-format", () => {
  it("formats countdown for seconds and minutes", () => {
    expect(formatBuildCountdown(45)).toBe("45s");
    expect(formatBuildCountdown(125)).toBe("2:05");
    expect(formatBuildCountdown(3665)).toBe("1:01:05");
  });

  it("computes finish time from remaining seconds", () => {
    const now = Date.now();
    const finish = computeFinishAtMs(30);
    expect(finish).toBeGreaterThanOrEqual(now + 29000);
    expect(finish).toBeLessThanOrEqual(now + 31000);
  });

  it("formats finish clock time", () => {
    const label = formatFinishTime(Date.UTC(2026, 5, 3, 14, 30, 0));
    expect(label).toMatch(/\d/);
  });
});
