import { describe, expect, it } from "vitest";
import {
  buildProjectPatchFromManuscript,
  manuscriptToVideoHeuristic,
} from "../app/lib/manuscript-video-chat.js";
import { buildMusicVideoPatchFromBoth } from "../app/lib/music-video-bridge.js";

describe("manuscript-video-chat", () => {
  it("heuristic maps noir manuscript to video fields", () => {
    const patch = manuscriptToVideoHeuristic(
      "A noir music video. Neon rain at night. A detective walks slow through alleys.",
    );
    expect(patch.selectedGenres).toContain("Noir");
    expect(patch.idea).toMatch(/noir|detective|neon/i);
    expect(patch.promptEngine).toBe("Director");
  });

  it("buildProjectPatchFromManuscript validates catalog tags", () => {
    const patch = buildProjectPatchFromManuscript({
      idea: "Courier in neon alley",
      selectedGenres: ["Cinematic", "Noir"],
      selectedSounds: ["Neon night", "Rain reflections"],
      selectedRhythms: ["Tracking shot"],
      vocal: "Silent visual",
      tempo: "12s",
    });
    expect(patch.selectedGenres).toEqual(["Cinematic", "Noir"]);
    expect(patch.selectedSounds).toContain("Neon night");
  });
});

describe("buildMusicVideoPatchFromBoth", () => {
  it("merges track and Suno paste", () => {
    const patch = buildMusicVideoPatchFromBoth(
      {
        suggestedGenres: ["Trap"],
        suggestedSounds: ["808 bass"],
        suggestedRhythms: ["Halftime"],
        estimatedBpm: 140,
        vocals: "Vocals likely",
      },
      "Synthwave, Analog synths",
      "[Chorus]\nRide the night",
      (s) => `${s}s`,
    );
    expect(patch.selectedGenres.length).toBeGreaterThan(0);
    expect(patch.generatedLyrics).toMatch(/Ride the night/);
    expect(patch.idea).toMatch(/Music video/i);
    expect(patch.promptEngine).toBe("Director");
  });
});
