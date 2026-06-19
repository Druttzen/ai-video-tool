import { describe, expect, it } from "vitest";
import {
  applyGpuFunctionsToSettings,
  applyGpuWorkflowPreset,
  getGpuWorkflowFunctions,
  getGpuWorkflowPresets,
  toggleGpuWorkflowFunction,
} from "../app/lib/gpu-workflow-functions.js";
import { DEFAULT_DIRECTOR_SETTINGS } from "../app/lib/director-settings.js";

describe("GPU workflow functions", () => {
  it("loads function catalog", () => {
    const fns = getGpuWorkflowFunctions();
    expect(fns.length).toBeGreaterThan(5);
    expect(fns.some((f) => f.id === "scan-hardware")).toBe(true);
  });

  it("loads presets with function ids", () => {
    const presets = getGpuWorkflowPresets();
    expect(presets.maxQuality.functionIds).toContain("max-resolution");
  });

  it("toggles functions on and off", () => {
    const base = { enabledIds: ["scan-hardware"], autoRunOnWorkflow: true };
    const off = toggleGpuWorkflowFunction(base, "scan-hardware", false);
    expect(off.enabledIds).not.toContain("scan-hardware");
    const on = toggleGpuWorkflowFunction(off, "auto-optimize", true);
    expect(on.enabledIds).toContain("auto-optimize");
  });

  it("applies max quality preset ids", () => {
    const next = applyGpuWorkflowPreset({ enabledIds: [] }, "maxQuality");
    expect(next.enabledIds).toContain("premium-quality");
    expect(next.activePreset).toBe("maxQuality");
  });

  it("applies GPU functions to director settings", () => {
    const stats = {
      primaryGpu: { name: "RTX 3080", vramGb: 10, discrete: true },
      totalMemGb: 32,
      cpuCores: 12,
    };
    const gpuSettings = {
      enabledIds: ["auto-optimize", "max-resolution", "motion-fx-boost"],
      vramGuardMode: "warn",
    };
    const { settings, applied } = applyGpuFunctionsToSettings(
      DEFAULT_DIRECTOR_SETTINGS,
      stats,
      gpuSettings,
      { hasPipeline: true },
    );
    expect(applied).toContain("auto-optimize");
    expect(settings.resolution).toBeTruthy();
    expect(settings.motionScore).toBeGreaterThan(3);
  });
});
