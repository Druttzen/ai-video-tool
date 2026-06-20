import { describe, expect, it } from "vitest";
import {
  buildRenderHonestyNote,
  buildRenderHonestyNoteFromDirectorSettings,
  resolveHonestRenderNumFrames,
  segmentDurationFromFrames,
} from "../app/lib/render-segment-hints.js";

describe("render-segment-hints", () => {
  it("segmentDurationFromFrames converts frames to seconds", () => {
    expect(segmentDurationFromFrames(129, 24)).toBe(5.4);
  });

  it("buildRenderHonestyNote warns when song exceeds render segment", () => {
    const note = buildRenderHonestyNote({ songDurationSec: 180, numFrames: 129, fps: 24 });
    expect(note).toContain("180s");
    expect(note).toContain("FFmpeg assemble");
  });

  it("resolveHonestRenderNumFrames caps inflated song frame budgets", () => {
    expect(resolveHonestRenderNumFrames({ numFrames: 11520 })).toBe(257);
    expect(resolveHonestRenderNumFrames({ numFrames: 129, hardwareTier: "medium" })).toBe(129);
    expect(resolveHonestRenderNumFrames({ numFrames: 500, hardwareTier: "low" })).toBe(97);
  });

  it("buildRenderHonestyNoteFromDirectorSettings uses capped frames", () => {
    const note = buildRenderHonestyNoteFromDirectorSettings(
      { numFrames: 5000, fps: 24, hardwareTier: "medium" },
      210,
    );
    expect(note).toContain("210s");
    expect(note).toContain("129");
  });
});
