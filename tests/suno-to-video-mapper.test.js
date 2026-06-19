import { describe, expect, it } from "vitest";
import {
  mapAudioAnalysisToMusicVideo,
  mapSunoGenresToVisual,
  mapSunoLyricsToVideoStructure,
  mapSunoPasteToMusicVideo,
  mapSunoRhythmsToCamera,
  mapSunoSoundsToLighting,
  parseSunoStyleField,
} from "../app/lib/suno-to-video-mapper.js";
import { buildMusicVideoPatchFromSunoPaste } from "../app/lib/music-video-bridge.js";

describe("suno-to-video-mapper", () => {
  it("maps techno genre to cinematic/noir visual styles", () => {
    expect(mapSunoGenresToVisual(["Techno"])).toEqual(
      expect.arrayContaining(["Cinematic", "Noir"]),
    );
  });

  it("maps 808 bass to neon lighting", () => {
    expect(mapSunoSoundsToLighting(["808 bass"])).toEqual(
      expect.arrayContaining(["Neon night"]),
    );
  });

  it("maps breakbeat to whip pan / handheld", () => {
    expect(mapSunoRhythmsToCamera(["Breakbeat"])).toEqual(
      expect.arrayContaining(["Whip pan"]),
    );
  });

  it("parses Suno style comma field", () => {
    const parsed = parseSunoStyleField("Techno, Heavy sub bass, 4/4, 128 BPM");
    expect(parsed.genres.some((g) => /techno/i.test(g))).toBe(true);
    expect(parsed.rhythms).toContain("4/4");
    expect(parsed.tempo).toMatch(/128/i);
  });

  it("maps lyric brackets to video structure beats", () => {
    const lyrics = `[Intro]\nFade in\n[Verse 1]\nLine one\n[Chorus]\nHook line`;
    const mapped = mapSunoLyricsToVideoStructure(lyrics);
    expect(mapped.structure).toMatch(/establishing wide/i);
    expect(mapped.structure).toMatch(/chorus energy/i);
  });

  it("maps audio analysis to music video fields", () => {
    const patch = mapAudioAnalysisToMusicVideo({
      suggestedGenres: ["Trap"],
      suggestedSounds: ["808 bass"],
      suggestedRhythms: ["Halftime"],
      estimatedBpm: 140,
      vocals: "Vocals likely",
      suggestedMoods: ["dark", "aggressive"],
    });
    expect(patch.selectedGenres).toContain("Music video");
    expect(patch.selectedSounds).toEqual(expect.arrayContaining(["Neon night"]));
    expect(patch.vocal).toBe("Music-driven");
    expect(patch.tempo).toBe("15s");
  });

  it("maps Suno paste to full video patch", () => {
    const patch = mapSunoPasteToMusicVideo(
      "Synthwave, Analog synths, 4/4, 110 BPM",
      "[Verse 1]\nNeon streets\n[Chorus]\nRide the night",
    );
    expect(patch.selectedGenres).toEqual(expect.arrayContaining(["Noir"]));
    expect(patch.generatedLyrics).toMatch(/Neon streets/);
    expect(patch.vocal).toBe("Music-driven");
  });
});

describe("music-video-bridge", () => {
  it("builds project patch from Suno paste", () => {
    const patch = buildMusicVideoPatchFromSunoPaste("House, 4/4", "[Chorus]\nDance");
    expect(patch.promptEngine).toBe("Director");
    expect(patch.selectedGenres).toContain("Commercial");
    expect(patch.idea).toMatch(/Music video/i);
  });
});
