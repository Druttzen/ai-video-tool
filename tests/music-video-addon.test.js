import { describe, expect, it } from "vitest";
import {
  buildBeatSyncExport,
  labelClipPlan,
  MUSIC_VIDEO_ADDON_CAPABILITIES,
  summarizeAssemblyReadiness,
  summarizeBeatSync,
} from "../app/lib/music-video-addon.js";
import { MV_DURATION_MODES } from "../app/lib/audio-visual-music-video.js";

describe("music-video-addon", () => {
  const audioWithBeatSync = {
    fileName: "track.wav",
    bpm: 128,
    duration: 120,
    vocals: "vocals likely",
    beatSync: {
      source: "librosa",
      bpm: 128,
      beatCount: 40,
      onsetCount: 12,
      vocalsLikely: true,
      clipPlan: [
        { start: 0, end: 6, duration: 6, label: "Segment 1" },
        { start: 6, end: 12, duration: 6, label: "Segment 2" },
      ],
      beatTimes: [0, 0.5, 1],
      onsetTimes: [0.2, 0.8],
      analyzedAt: "2026-01-01T00:00:00.000Z",
    },
  };

  it("exposes ultimate addon capabilities", () => {
    expect(MUSIC_VIDEO_ADDON_CAPABILITIES).toContain("beat-analysis");
    expect(MUSIC_VIDEO_ADDON_CAPABILITIES).toContain("ffmpeg-assemble");
  });

  it("summarizes beat sync from librosa analysis", () => {
    const summary = summarizeBeatSync(audioWithBeatSync, MV_DURATION_MODES.FULL);
    expect(summary.ready).toBe(true);
    expect(summary.source).toBe("librosa");
    expect(summary.clipCount).toBe(2);
    expect(summary.onsetCount).toBe(12);
    expect(summary.vocalsLikely).toBe(true);
  });

  it("labels clip plan segments", () => {
    const labeled = labelClipPlan([{ start: 0, end: 5 }]);
    expect(labeled[0].label).toBe("Segment 1");
  });

  it("builds export payload with clip plan", () => {
    const payload = buildBeatSyncExport(audioWithBeatSync);
    expect(payload.capabilities).toEqual(MUSIC_VIDEO_ADDON_CAPABILITIES);
    expect(payload.clipPlan).toHaveLength(2);
    expect(payload.summary.clipCount).toBe(2);
  });

  it("summarizes assembly readiness", () => {
    const readiness = summarizeAssemblyReadiness(audioWithBeatSync, ["a.mp4", "b.mp4"]);
    expect(readiness.planned).toBe(2);
    expect(readiness.rendered).toBe(2);
    expect(readiness.ready).toBe(true);
  });

  it("returns hint when no audio analysis", () => {
    const summary = summarizeBeatSync(null);
    expect(summary.ready).toBe(false);
    expect(summary.hint).toContain("Analyzers");
  });
});
