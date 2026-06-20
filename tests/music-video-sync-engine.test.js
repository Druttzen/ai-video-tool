import { describe, expect, it } from "vitest";
import {
  buildClipPlanFromBeatTimes,
  enrichAudioAnalysisWithBeatSync,
  resolveBeatTimesForRange,
} from "../app/lib/music-video-sync-engine.js";

describe("music-video-sync-engine", () => {
  it("enrichAudioAnalysisWithBeatSync merges librosa beat map", () => {
    const audio = { fileName: "demo.wav", duration: 120, estimatedBpm: "110 BPM" };
    const result = enrichAudioAnalysisWithBeatSync(audio, {
      ok: true,
      source: "librosa",
      bpm: 128,
      beatTimes: [0, 0.5, 1, 1.5],
      clipPlan: [{ start: 0, end: 4, duration: 4 }],
    });
    expect(result.bpm).toBe(128);
    expect(result.beatSync.source).toBe("librosa");
    expect(result.beatSync.beatTimes).toHaveLength(4);
  });

  it("buildClipPlanFromBeatTimes groups beats into 4–8s segments", () => {
    const beats = [];
    for (let t = 0; t <= 32; t += 0.5) beats.push(t);
    const clips = buildClipPlanFromBeatTimes(beats, 0, 32);
    expect(clips.length).toBeGreaterThan(0);
    expect(clips[0].duration).toBeGreaterThanOrEqual(3);
    expect(clips[0].duration).toBeLessThanOrEqual(8.5);
  });

  it("resolveBeatTimesForRange filters librosa beats to window", () => {
    const audio = {
      beatSync: { beatTimes: [10, 20, 30, 40, 50] },
    };
    expect(resolveBeatTimesForRange(audio, 18, 42)).toEqual([20, 30, 40]);
  });
});
