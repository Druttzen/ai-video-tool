import { describe, expect, it } from "vitest";
import { buildCanvasPayloadFromWorkspace } from "../app/lib/canvas-payload.js";

describe("canvas payload", () => {
  it("builds handoff when audio has beat-sync clip plan", () => {
    const payload = buildCanvasPayloadFromWorkspace({
      idea: "Neon city chase",
      selectedGenres: ["Synthwave"],
      audioAnalysis: {
        fileName: "track.wav",
        bpm: 128,
        durationSec: 180,
        sidecarImported: true,
        beatSync: {
          clipPlan: [
            { start: 0, end: 6 },
            { start: 6, end: 12 },
          ],
          beatCount: 40,
        },
      },
    });
    expect(payload.title).toBe("Neon city chase");
    expect(payload.handoff?.intent).toBe("music-video-path-e");
    expect(payload.handoff?.audioAnalysis?.beatSync?.clipPlan).toHaveLength(2);
  });

  it("omits handoff when no analyzers", () => {
    const payload = buildCanvasPayloadFromWorkspace({ idea: "Solo prompt" });
    expect(payload.handoff).toBeUndefined();
    expect(payload.project.idea).toBe("Solo prompt");
  });
});
