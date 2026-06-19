import { describe, expect, it } from "vitest";
import {
  classifyHardwareTier,
  getHardwareTierLimits,
  optimizeDirectorSettingsForHardware,
  clampSettingsToTierCeiling,
} from "../app/lib/director-hardware-optimize.js";
import { gatherBrowserSystemStats } from "../app/lib/system-stats.js";
import {
  buildDirectorJobPayload,
  resolveDirectorConfigPath,
  resolveDirectorResolutionTier,
} from "../app/lib/director-prompt-builder.js";
import { DEFAULT_DIRECTOR_SETTINGS } from "../app/lib/director-settings.js";
import { DEFAULT_STATE } from "../app/lib/video-config.js";

describe("system stats & hardware optimizer", () => {
  it("classifies enthusiast tier for 16GB VRAM", () => {
    const tier = classifyHardwareTier({
      primaryGpu: { name: "NVIDIA RTX 4080", vramGb: 16, discrete: true },
      totalMemGb: 32,
      cpuCores: 16,
    });
    expect(tier).toBe("enthusiast");
  });

  it("classifies unlimited tier for 24GB+ VRAM and 32GB RAM", () => {
    const tier = classifyHardwareTier({
      primaryGpu: { name: "NVIDIA RTX 4090", vramGb: 24, discrete: true },
      totalMemGb: 64,
      cpuCores: 24,
    });
    expect(tier).toBe("unlimited");
  });

  it("optimizes settings to tier maximums", () => {
    const stats = {
      primaryGpu: { name: "RTX 3070", vramGb: 8, discrete: true },
      totalMemGb: 16,
      cpuCores: 8,
    };
    const { settings, tier } = optimizeDirectorSettingsForHardware(
      { ...DEFAULT_DIRECTOR_SETTINGS, autoOptimizeFromHardware: true },
      stats,
      { force: true },
    );
    const limits = getHardwareTierLimits(tier);
    expect(settings.numSteps).toBe(limits.numSteps);
    expect(settings.numFrames).toBe(limits.numFrames);
    expect(settings.resolution).toBe(limits.resolution);
    expect(settings.hardwareTier).toBe(tier);
  });

  it("does not change settings when auto optimize is off", () => {
    const { changed, settings } = optimizeDirectorSettingsForHardware(
      { ...DEFAULT_DIRECTOR_SETTINGS, autoOptimizeFromHardware: false, numSteps: 22 },
      { primaryGpu: { vramGb: 24, discrete: true }, totalMemGb: 64, cpuCores: 16 },
    );
    expect(changed).toBe(false);
    expect(settings.numSteps).toBe(22);
  });

  it("clamps manual values to tier ceiling", () => {
    const clamped = clampSettingsToTierCeiling(
      { ...DEFAULT_DIRECTOR_SETTINGS, numSteps: 999, numFrames: 999, motionScore: 99 },
      "medium",
    );
    const limits = getHardwareTierLimits("medium");
    expect(clamped.numSteps).toBe(limits.numSteps);
    expect(clamped.numFrames).toBe(limits.numFrames);
  });

  it("gathers browser stats shape", () => {
    const stats = gatherBrowserSystemStats();
    expect(stats.cpuCores).toBeGreaterThan(0);
    expect(stats.source).toBe("browser");
  });

  it("job payload includes resolution and config path", () => {
    const settings = {
      ...DEFAULT_DIRECTOR_SETTINGS,
      resolution: "768px",
      hardwareTier: "high",
    };
    const job = buildDirectorJobPayload(DEFAULT_STATE, settings);
    expect(job.resolutionTier).toBe("768px");
    expect(job.configPath).toBe(resolveDirectorConfigPath("768px"));
    expect(job.hardwareTier).toBe("high");
  });

  it("resolveDirectorResolutionTier falls back to 512px", () => {
    expect(resolveDirectorResolutionTier({})).toBe("512px");
  });
});
