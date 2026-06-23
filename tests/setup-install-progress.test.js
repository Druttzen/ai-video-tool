import { describe, expect, it } from "vitest";
import {
  appendSetupInstallLogLine,
  computeSetupInstallProgress,
  formatSetupInstallPhaseLabel,
} from "../app/lib/setup-install-progress.js";

describe("setup-install-progress", () => {
  it("formatSetupInstallPhaseLabel maps addon start", () => {
    expect(
      formatSetupInstallPhaseLabel({ phase: "addon-start", addonId: "python", label: "Python", forceReinstall: true }),
    ).toBe("Installing Python…");
    expect(
      formatSetupInstallPhaseLabel({ phase: "addon-start", addonId: "ffmpeg", label: "FFmpeg", forceReinstall: false }),
    ).toBe("Updating FFmpeg…");
  });

  it("computeSetupInstallProgress advances through addons", () => {
    const state = { completedAddons: 0, totalAddons: 4, pipelineStep: 2, lastPct: 1 };
    const startPct = computeSetupInstallProgress({ phase: "addon-start", addonId: "python" }, state);
    expect(startPct).toBeGreaterThan(0);
    const donePct = computeSetupInstallProgress({ phase: "addon-done", addonId: "python" }, state);
    expect(donePct).toBeGreaterThan(startPct);
    expect(computeSetupInstallProgress({ phase: "complete", ok: true, done: true }, state)).toBe(100);
  });

  it("appendSetupInstallLogLine caps line count", () => {
    let lines = [];
    for (let i = 0; i < 260; i += 1) lines = appendSetupInstallLogLine(lines, `line-${i}`, 250);
    expect(lines).toHaveLength(250);
    expect(lines[0]).toBe("line-10");
  });
});
