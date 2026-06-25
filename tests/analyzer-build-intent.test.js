import { describe, expect, it } from "vitest";
import {
  determineBuildFromAnalyzersAndRequest,
  resolveAnalyzerUserRequest,
  slimBuildIntent,
} from "../app/lib/analyzer-build-intent.js";
import { MV_DURATION_MODES } from "../app/lib/audio-visual-music-video.js";

describe("analyzer-build-intent", () => {
  const audio = {
    fileName: "track.wav",
    duration: 200,
    bpm: 128,
    estimatedBpm: "128 BPM",
    vocals: "vocals likely",
    beatSync: {
      clipPlan: [
        { start: 0, end: 6 },
        { start: 6, end: 12 },
        { start: 12, end: 18 },
      ],
      source: "librosa",
    },
  };

  const image = {
    fileName: "ref.jpg",
    visualMood: "dark, vivid, warm",
    avgColor: "rgb(40, 120, 200)",
    suggestedGenres: ["Cinematic"],
  };

  it("resolves user request from agent draft then idea", () => {
    expect(resolveAnalyzerUserRequest({ agentDraft: "Neon alley chase" })).toBe("Neon alley chase");
    expect(resolveAnalyzerUserRequest({ idea: "City at night" })).toBe("City at night");
    expect(
      resolveAnalyzerUserRequest({
        agentMessages: [{ role: "user", content: "Make a beat-sync MV" }],
      }),
    ).toBe("Make a beat-sync MV");
  });

  it("chooses Path E music video when audio and image present", () => {
    const plan = determineBuildFromAnalyzersAndRequest({
      audioAnalysis: audio,
      imageAnalysis: image,
      userRequest: "Cinematic neon music video with lip sync",
    });
    expect(plan.ok).toBe(true);
    expect(plan.buildTarget).toBe("music-video");
    expect(plan.workflowPath).toBe(5);
    expect(plan.recommendedActionId).toBe("applyAudioVisualMusicVideo");
    expect(plan.multiClip).toBe(true);
    expect(plan.clipCount).toBe(3);
    expect(plan.lipSync).toBe(true);
    expect(plan.canvasIntent).toBe("music-video-path-e");
  });

  it("chooses canvas when user asks for dashboard", () => {
    const plan = determineBuildFromAnalyzersAndRequest({
      audioAnalysis: audio,
      imageAnalysis: image,
      userRequest: "Open canvas dashboard to inspect timeline",
    });
    expect(plan.buildTarget).toBe("canvas");
    expect(plan.recommendedActionId).toBe("openCanvas");
  });

  it("uses highlight duration when brief mentions chorus", () => {
    const plan = determineBuildFromAnalyzersAndRequest({
      audioAnalysis: audio,
      imageAnalysis: image,
      userRequest: "Highlight chorus only",
    });
    expect(plan.durationMode).toBe(MV_DURATION_MODES.HIGHLIGHT);
  });

  it("slims build intent for canvas payload", () => {
    const plan = determineBuildFromAnalyzersAndRequest({
      audioAnalysis: audio,
      imageAnalysis: image,
      idea: "Neon pursuit",
    });
    const slim = slimBuildIntent(plan);
    expect(slim?.workflowPath).toBe(5);
    expect(slim?.concept).toContain("Neon");
  });

  it("returns needs-input when nothing provided", () => {
    const plan = determineBuildFromAnalyzersAndRequest({});
    expect(plan.ok).toBe(false);
    expect(plan.buildTarget).toBe("none");
  });
});
