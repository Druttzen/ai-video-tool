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
    expect(payload.appVersion).toBeTruthy();
  });

  it("omits handoff when no analyzers", () => {
    const payload = buildCanvasPayloadFromWorkspace({ idea: "Solo prompt" });
    expect(payload.handoff).toBeUndefined();
    expect(payload.project.idea).toBe("Solo prompt");
  });

  it("includes expanded production fields and agent/co-producer summaries", () => {
    const payload = buildCanvasPayloadFromWorkspace({
      idea: "Full render",
      appVersion: "2.5.0",
      agentPhase: "rendering",
      agentMessages: [{ role: "user" }, { role: "assistant" }],
      coProducerLlmSettings: {
        apiUrl: "https://api.openai.com/v1/chat/completions",
        model: "gpt-4o-mini",
      },
      production: {
        phase: "rendering",
        multiClip: true,
        clipTotal: 4,
        clipCurrent: 2,
        clipsRendered: 1,
        clipPlannedTotal: 4,
        clipIndex: 2,
        clipStart: 6,
        clipEnd: 12,
        clipDuration: 6,
        assembledOutputPath: "C:/out/final.mp4",
        logPath: "C:/out/render.log",
        updatedAt: 1_700_000_000_000,
        renderPythonSource: "wsl",
        lastOutputPath: "C:/out/clip1.mp4",
      },
    });

    expect(payload.appVersion).toBe("2.5.0");
    expect(payload.production).toMatchObject({
      clipPlannedTotal: 4,
      clipIndex: 2,
      clipStart: 6,
      clipEnd: 12,
      clipDuration: 6,
      assembledOutputPath: "C:/out/final.mp4",
      logPath: "C:/out/render.log",
      renderPythonSource: "wsl",
    });
    expect(payload.agentSummary).toEqual({ phase: "rendering", messageCount: 2 });
    expect(payload.coProducer).toEqual({ provider: "openai", model: "gpt-4o-mini" });
  });

  it("includes buildIntent when audio, image, and user request are present", () => {
    const payload = buildCanvasPayloadFromWorkspace({
      idea: "Neon chase music video with dashboard",
      audioAnalysis: {
        fileName: "track.wav",
        bpm: 120,
        durationSec: 90,
        beatSync: { clipPlan: [{ start: 0, end: 6 }] },
      },
      imageAnalysis: {
        fileName: "cover.jpg",
        dominantColors: ["#ff00aa"],
        aspectRatio: 1.78,
      },
      agentMessages: [{ role: "user", content: "Open canvas dashboard for beat-sync preview" }],
    });

    expect(payload.buildIntent).toBeTruthy();
    expect(payload.buildIntent.buildTarget).toBe("canvas");
    expect(payload.buildIntent.userRequest).toMatch(/canvas/i);
  });
});
