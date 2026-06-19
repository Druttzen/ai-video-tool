import { describe, expect, it } from "vitest";
import {
  applyOutputPreset,
  applyOutputResolution,
  filterResolutionsByAspect,
  formatOutputSettingsSummary,
  migrateOutputSettings,
} from "../app/lib/director-output-settings.js";
import { DEFAULT_DIRECTOR_SETTINGS } from "../app/lib/director-settings.js";

describe("director output settings", () => {
  it("applies fixed px resolution", () => {
    const next = applyOutputResolution(DEFAULT_DIRECTOR_SETTINGS, "1280x720");
    expect(next.outputWidth).toBe(1280);
    expect(next.outputHeight).toBe(720);
    expect(next.outputResolution).toBe("1280×720");
    expect(next.resolution).toBe("768px");
    expect(next.aspectRatio).toBe("16:9");
  });

  it("applies youtube preset", () => {
    const next = applyOutputPreset(DEFAULT_DIRECTOR_SETTINGS, "youtube-1080");
    expect(next.outputWidth).toBe(1920);
    expect(next.fps).toBe(30);
    expect(next.bitrateMbps).toBe(12);
    expect(next.outputPreset).toBe("youtube-1080");
  });

  it("filters resolutions by aspect", () => {
    const vertical = filterResolutionsByAspect("9:16");
    expect(vertical.every((r) => r.aspectRatio === "9:16")).toBe(true);
  });

  it("migrates legacy tier to px", () => {
    const next = migrateOutputSettings({ ...DEFAULT_DIRECTOR_SETTINGS, resolution: "768px", outputWidth: null });
    expect(next.outputWidth).toBe(1280);
  });

  it("formats summary string", () => {
    const s = formatOutputSettingsSummary({
      outputWidth: 1920,
      outputHeight: 1080,
      fps: 30,
      bitrateMbps: 12,
      videoCodec: "h264",
      container: "mp4",
    });
    expect(s).toContain("1920×1080");
    expect(s).toContain("12 Mbit/s");
  });
});
