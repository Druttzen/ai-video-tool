import { describe, expect, it, vi } from "vitest";
import {
  getMusicVideoWorkflowReadiness,
  MUSIC_VIDEO_WORKFLOWS,
  runMusicVideoWorkflow,
} from "../app/lib/music-video-workflows.js";

describe("music-video-workflows", () => {
  it("defines four workflows", () => {
    expect(MUSIC_VIDEO_WORKFLOWS).toHaveLength(4);
    expect(MUSIC_VIDEO_WORKFLOWS.map((w) => w.id)).toEqual([1, 2, 3, 4]);
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

  it("runMusicVideoWorkflow path 1 fails without track", async () => {
    const result = await runMusicVideoWorkflow(1, {
      applyAudioToMusicVideo: vi.fn(),
      setPromptEngine: vi.fn(),
      setStatusWithTime: vi.fn(),
    });
    expect(result.ok).toBe(false);
  });
});
