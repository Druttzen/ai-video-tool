import { describe, expect, it, vi } from "vitest";
import {
  getMusicVideoWorkflowReadiness,
  MUSIC_VIDEO_WORKFLOWS,
  runMusicVideoWorkflow,
} from "../app/lib/music-video-workflows.js";

describe("music-video-workflows", () => {
  it("defines five workflows", () => {
    expect(MUSIC_VIDEO_WORKFLOWS).toHaveLength(5);
    expect(MUSIC_VIDEO_WORKFLOWS.map((w) => w.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("readiness for path 3 requires track and paste", () => {
    expect(getMusicVideoWorkflowReadiness(3, {}).ready).toBe(false);
    expect(
      getMusicVideoWorkflowReadiness(3, {
        audioAnalysis: { estimatedBpm: 120 },
        sunoPasteStyle: "Techno",
      }).ready,
    ).toBe(true);
  });

  it("runMusicVideoWorkflow path 2 calls apply paste", async () => {
    const applySunoPasteToMusicVideo = vi.fn();
    const result = await runMusicVideoWorkflow(2, {
      sunoPasteStyle: "House, 4/4",
      sunoPasteLyrics: "[Chorus]\nGo",
      captureSnapshot: vi.fn(),
      applySunoPasteToMusicVideo,
      setPromptEngine: vi.fn(),
      setStatusWithTime: vi.fn(),
    });
    expect(result.ok).toBe(true);
    expect(applySunoPasteToMusicVideo).toHaveBeenCalled();
  });

  it("readiness for path 5 requires track and image", () => {
    expect(getMusicVideoWorkflowReadiness(5, {}).ready).toBe(false);
    expect(
      getMusicVideoWorkflowReadiness(5, {
        audioAnalysis: { estimatedBpm: 120 },
        imageAnalysis: { visualMood: "noir" },
      }).ready,
    ).toBe(true);
  });

  it("runMusicVideoWorkflow path 5 calls apply audio visual", async () => {
    const applyAudioVisualMusicVideo = vi.fn();
    const result = await runMusicVideoWorkflow(5, {
      audioAnalysis: { estimatedBpm: 120 },
      imageAnalysis: { visualMood: "noir" },
      captureSnapshot: vi.fn(),
      applyAudioVisualMusicVideo,
      setPromptEngine: vi.fn(),
      setStatusWithTime: vi.fn(),
    });
    expect(result.ok).toBe(true);
    expect(applyAudioVisualMusicVideo).toHaveBeenCalledWith(undefined);
  });

  it("runMusicVideoWorkflow path 5 passes highlight duration mode", async () => {
    const applyAudioVisualMusicVideo = vi.fn();
    const { MV_DURATION_MODES } = await import("../app/lib/audio-visual-music-video.js");
    const result = await runMusicVideoWorkflow(5, {
      audioAnalysis: { estimatedBpm: 120, highlightStart: 10, highlightEnd: 42 },
      imageAnalysis: { visualMood: "noir" },
      captureSnapshot: vi.fn(),
      applyAudioVisualMusicVideo,
      setPromptEngine: vi.fn(),
      setStatusWithTime: vi.fn(),
      pathEDurationMode: MV_DURATION_MODES.HIGHLIGHT,
    });
    expect(result.ok).toBe(true);
    expect(applyAudioVisualMusicVideo).toHaveBeenCalledWith(MV_DURATION_MODES.HIGHLIGHT);
  });

  it("runMusicVideoWorkflow path 1 fails without track", async () => {
    const result = await runMusicVideoWorkflow(1, {
      applyAudioToMusicVideo: vi.fn(),
      setPromptEngine: vi.fn(),
      setStatusWithTime: vi.fn(),
    });
    expect(result.ok).toBe(false);
  });
});
