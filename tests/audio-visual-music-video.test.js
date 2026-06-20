import { describe, expect, it } from "vitest";
import {
  buildAudioVisualMusicVideoPlan,
  buildBeatSyncMarkers,
  buildBeatSyncStructure,
  buildLipSyncRules,
  buildMusicVideoPatchFromAudioAndImage,
  hasVocalsLikely,
  songDurationSec,
  syncDirectorSettingsToSong,
} from "../app/lib/audio-visual-music-video.js";
import { buildDirectorJobPayload } from "../app/lib/director-prompt-builder.js";
import { DEFAULT_DIRECTOR_SETTINGS } from "../app/lib/director-settings.js";

const formatTime = (sec) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

const sampleAudio = {
  fileName: "demo-track.wav",
  duration: 185.4,
  bpm: 128,
  estimatedBpm: "128 BPM",
  highlightStart: 62,
  highlightEnd: 94,
  vocals: "Vocals likely",
  suggestedGenres: ["Techno"],
  suggestedMoods: ["Dark", "Driving"],
  suggestedRhythms: ["4/4"],
  suggestedSounds: ["Heavy sub bass"],
  moodSuggestion: { energy: 72, aggression: 55, darkness: 60, complexity: 40 },
};

const sampleImage = {
  visualMood: "Neon noir alley, rain-slick reflections",
  suggestedGenres: ["Noir", "Cinematic"],
  suggestedSounds: ["Neon night"],
  suggestedRhythms: ["Tracking shot"],
  moodSuggestion: { energy: 50, aggression: 40, darkness: 70, complexity: 35 },
  summary: "Cool palette, high contrast, wet pavement.",
};

describe("audio-visual-music-video", () => {
  it("caps song duration at 120 seconds for director sync", () => {
    expect(songDurationSec(sampleAudio)).toBe(120);
  });

  it("builds beat markers from BPM and duration", () => {
    const audio = { ...sampleAudio, duration: 60, bpm: 120 };
    const beatSync = buildBeatSyncMarkers(audio);
    expect(beatSync.bpm).toBe(120);
    expect(beatSync.beatInterval).toBeCloseTo(0.5, 2);
    expect(beatSync.beatCount).toBeGreaterThan(100);
    expect(beatSync.markers[0]).toBe(0);
  });

  it("builds timestamped beat-sync structure", () => {
    const structure = buildBeatSyncStructure({ ...sampleAudio, duration: 90 }, formatTime);
    expect(structure).toContain("0:00 establishing wide");
    expect(structure).toContain("→");
    expect(structure).toContain("chorus lift on downbeat");
  });

  it("adds lip-sync rules when vocals are likely", () => {
    expect(hasVocalsLikely(sampleAudio)).toBe(true);
    expect(buildLipSyncRules(sampleAudio)).toContain("lip-sync");
    expect(buildLipSyncRules({ ...sampleAudio, vocals: "Instrumental likely" })).toContain(
      "no lip-sync",
    );
  });

  it("syncs director duration and tempo to full song length", () => {
    const audio = { ...sampleAudio, duration: 45.5 };
    const plan = buildAudioVisualMusicVideoPlan(audio, sampleImage, formatTime);
    expect(plan.durationSec).toBe(45.5);
    expect(plan.tempo).toBe("45.5s");
    expect(plan.directorSettings.durationSeconds).toBe("45.5");
    expect(plan.directorSettings.useI2vWhenImage).toBe(true);

    const synced = syncDirectorSettingsToSong(audio, DEFAULT_DIRECTOR_SETTINGS, { enableI2v: true });
    expect(synced.durationSeconds).toBe("45.5");
    expect(synced.numFrames).toBe(Math.max(17, Math.min(513, Math.round(45.5 * 24))));
    expect(synced.useI2vWhenImage).toBe(true);
  });

  it("buildMusicVideoPatchFromAudioAndImage merges audio, image, beat and lip sync", () => {
    const audio = { ...sampleAudio, duration: 48 };
    const patch = buildMusicVideoPatchFromAudioAndImage(audio, sampleImage, formatTime);
    expect(patch.tempo).toBe("48s");
    expect(patch.vocal).toBe("Voiceover");
    expect(patch.lyricMode).toBe("Multi-beat scene");
    expect(patch.promptEngine).toBe("Director");
    expect(String(patch.generatedLyrics)).toContain("Beat grid");
    expect(String(patch.generatedLyrics)).toContain("lip-sync");

    const genres = patch.selectedGenres([]);
    expect(genres).toContain("Music video");
    expect(genres.some((g) => g === "Noir" || g === "Cinematic")).toBe(true);

    const rules = patch.rules("");
    expect(rules).toContain("BEAT-SYNC");
    expect(rules).toContain("LIP-SYNC");

    const idea = patch.idea("");
    expect(idea).toContain("beat-sync");
    expect(idea).toContain("lip-sync");
  });

  it("buildDirectorJobPayload enables i2v when image payload is provided", () => {
    const audio = { ...sampleAudio, duration: 48 };
    const patch = buildMusicVideoPatchFromAudioAndImage(audio, sampleImage, formatTime);
    const project = {
      idea: patch.idea(""),
      generatedLyrics: patch.generatedLyrics,
      structure: patch.structure,
      vocal: patch.vocal,
      lyricTheme: patch.lyricTheme,
      selectedGenres: patch.selectedGenres([]),
      selectedSounds: patch.selectedSounds([]),
      selectedRhythms: patch.selectedRhythms([]),
      rules: patch.rules(""),
      mood: { energy: 50, aggression: 40, darkness: 50, complexity: 35 },
      imageAnalysis: sampleImage,
    };
    const settings = syncDirectorSettingsToSong(audio, DEFAULT_DIRECTOR_SETTINGS, { enableI2v: true });
    const job = buildDirectorJobPayload(project, settings, {
      imagePayload: { base64: "abc123", name: "e2e-analyzer-palette.png" },
    });
    expect(job.i2v).toBe(true);
    expect(job.ref_image_name).toBe("e2e-analyzer-palette.png");
  });
});
