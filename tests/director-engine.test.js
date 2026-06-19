import { describe, expect, it } from "vitest";
import {
  buildDirectorJobPayload,
  buildDirectorPrompt,
  buildDirectorSceneList,
} from "../app/lib/director-prompt-builder.js";
import { DEFAULT_STATE } from "../app/lib/video-config.js";
import { DEFAULT_DIRECTOR_SETTINGS } from "../app/lib/director-settings.js";
import { randomDirectorInspiration } from "../app/lib/director-inspire.js";
import { advanceDirectorWizard, createDirectorWizard } from "../app/lib/director-prompt-wizard.js";

const SETTINGS = { ...DEFAULT_DIRECTOR_SETTINGS };

describe("Director Engine", () => {
  it("builds native prompt from project fields", () => {
    const out = buildDirectorPrompt(DEFAULT_STATE, SETTINGS);
    expect(out).toContain("neon alley");
    expect(out.endsWith(".")).toBe(true);
  });

  it("exports director job payload", () => {
    const job = buildDirectorJobPayload(DEFAULT_STATE, SETTINGS);
    expect(job.kind).toBe("director_video_job");
    expect(job.engine).toBe("Director");
    expect(job.renderBackend).toBe("export");
  });

  it("random inspiration returns usable bundle", () => {
    const bundle = randomDirectorInspiration("cinematic");
    expect(bundle.topic).toBeTruthy();
    expect(bundle.ratio).toBeTruthy();
  });

  it("wizard produces a final prompt", () => {
    let session = createDirectorWizard();
    let prompt = null;
    for (const answer of ["Courier in rain", "wet city", "tracking", "tense", "8", "24", "16:9"]) {
      const result = advanceDirectorWizard({ ...session, styleName: "cinematic" }, answer);
      session = result.session;
      if (result.prompt) prompt = result.prompt;
    }
    expect(prompt).toContain("16:9");
  });

  it("builds scene list beats", () => {
    const out = buildDirectorSceneList({
      lyricTheme: "hope",
      structure: "open → rise → hold",
      generatedLyrics: "",
      vocal: "Voiceover",
    });
    expect(out).toContain("[Theme: hope]");
  });
});
