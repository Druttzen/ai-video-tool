import { describe, expect, it } from "vitest";
import {
  buildIntentBadges,
  formatTimestamp,
  hasCanvasOutputPath,
  progressPercent,
} from "../tools/canvas/src/canvas-display.ts";

describe("canvas display helpers", () => {
  describe("progressPercent", () => {
    it("returns 0 when not multi-clip", () => {
      expect(progressPercent({ multiClip: false, clipTotal: 4, clipsRendered: 2 })).toBe(0);
    });

    it("returns 100 when assembling or done", () => {
      expect(progressPercent({ multiClip: true, clipTotal: 4, clipStatus: "assembling" })).toBe(100);
      expect(progressPercent({ multiClip: true, clipTotal: 4, phase: "done" })).toBe(100);
    });

    it("caps rendering progress below 100", () => {
      expect(
        progressPercent({
          multiClip: true,
          clipTotal: 4,
          clipsRendered: 2,
          clipStatus: "rendering",
        }),
      ).toBe(61);
    });

    it("reports completed clip ratio when idle between clips", () => {
      expect(
        progressPercent({
          multiClip: true,
          clipTotal: 4,
          clipsRendered: 2,
        }),
      ).toBe(50);
    });
  });

  describe("formatTimestamp", () => {
    it("returns dash for empty values", () => {
      expect(formatTimestamp(null)).toBe("—");
    });

    it("formats epoch values", () => {
      expect(formatTimestamp(0)).toMatch(/\d/);
    });
  });

  describe("hasCanvasOutputPath", () => {
    it("detects assembled or last output paths", () => {
      expect(hasCanvasOutputPath({ assembledOutputPath: "C:/out/final.mp4" })).toBe(true);
      expect(hasCanvasOutputPath({ lastOutputPath: "C:/out/clip1.mp4" })).toBe(true);
      expect(hasCanvasOutputPath({})).toBe(false);
    });
  });

  describe("buildIntentBadges", () => {
    it("builds badges for canvas music-video intent", () => {
      expect(
        buildIntentBadges({
          buildTarget: "canvas",
          workflowPath: 4,
          multiClip: true,
          clipCount: 6,
          lipSync: true,
        }),
      ).toEqual(["canvas", "Path 4", "6 clips", "lip-sync"]);
    });
  });
});
