import { describe, it, expect, vi } from "vitest";
import {
  HANDOFF_INTENTS,
  applyProjectHandoff,
  buildMusicToolHandoffBlock,
  normalizeProjectHandoff,
} from "../app/lib/project-handoff.js";

vi.mock("../app/lib/director-settings.js", () => ({
  saveDirectorSettingsToStorage: vi.fn(),
  loadDirectorSettingsFromStorage: () => ({ durationSeconds: "30", useI2vWhenImage: true }),
}));

vi.mock("../app/lib/music-video-workflows.js", () => ({
  scrollToDirectorPanelAfterApply: vi.fn(),
}));

describe("project-handoff", () => {
  it("normalizeProjectHandoff requires source", () => {
    expect(normalizeProjectHandoff(null)).toBeNull();
    expect(normalizeProjectHandoff({ intent: "x" })).toBeNull();
    const h = normalizeProjectHandoff({
      source: "ai-music-creator",
      intent: HANDOFF_INTENTS.MUSIC_VIDEO_PATH_E,
    });
    expect(h?.source).toBe("ai-music-creator");
  });

  it("buildMusicToolHandoffBlock sets defaults", () => {
    const block = buildMusicToolHandoffBlock({ musicAppVersion: "1.0" });
    expect(block.source).toBe("ai-music-creator");
    expect(block.intent).toBe(HANDOFF_INTENTS.MUSIC_VIDEO_PATH_E);
  });

  it("applyProjectHandoff runs Path E when analyses present", () => {
    const applyAnalyzerPatch = vi.fn();
    const setAudioAnalysis = vi.fn();
    const result = applyProjectHandoff(
      {
        source: "ai-music-creator",
        intent: HANDOFF_INTENTS.MUSIC_VIDEO_PATH_E,
        audioAnalysis: { bpm: 120, durationSec: 60 },
        imageAnalysis: { suggestedGenres: ["Pop"] },
      },
      {
        setAudioAnalysis,
        setImageAnalysis: vi.fn(),
        applyAnalyzerPatch,
        patch: vi.fn(),
        formatTime: (n) => String(n),
      },
    );
    expect(result.pathE).toBe(true);
    expect(setAudioAnalysis).toHaveBeenCalled();
    expect(applyAnalyzerPatch).toHaveBeenCalled();
  });
});
