import { describe, expect, it, vi } from "vitest";

vi.mock("../app/lib/audio-cache.js", () => ({
  makeAudioCacheKey: () => "cache-key",
  makeAudioLookupKey: (name, dur) => `lookup:${name}:${dur}`,
  putAudioCacheEntries: vi.fn(async () => ({
    audioCacheKey: "cache-key",
    audioLookupKey: "lookup:track.wav:300",
  })),
}));

import { hydrateAudioSidecarAnalysis } from "../app/lib/audio-sidecar-import.js";

describe("audio sidecar import", () => {
  it("hydrates audioAnalysis with cache keys from sidecar buffer", async () => {
    const buffer = new Uint8Array([1, 2, 3, 4]).buffer;
    const analysis = {
      fileName: "old.wav",
      durationSec: 30,
      bpm: 120,
      beatSync: { clipPlan: [] },
    };
    const hydrated = await hydrateAudioSidecarAnalysis(analysis, buffer, "handoff-track.wav");
    expect(hydrated.fileName).toBe("handoff-track.wav");
    expect(hydrated.audioCacheKey).toBe("cache-key");
    expect(hydrated.sidecarImported).toBe(true);
    expect(hydrated.duration).toBe(30);
  });

  it("returns original analysis when buffer missing", async () => {
    const analysis = { fileName: "x.wav" };
    expect(await hydrateAudioSidecarAnalysis(analysis, null)).toBe(analysis);
  });
});
