import { describe, expect, it } from "vitest";
import {
  buildOpenSoraJobPayload,
  buildOpenSoraPrompt,
  buildOpenSoraSceneList,
} from "../app/lib/open-sora-prompt-builder.js";
import { DEFAULT_STATE } from "../app/lib/video-config.js";
import { DEFAULT_OPEN_SORA_SETTINGS } from "../app/lib/open-sora-settings.js";
import { randomOpenSoraInspiration } from "../app/lib/open-sora-inspire.js";
import { advanceWizard, createWizardSession } from "../app/lib/open-sora-prompt-wizard.js";

const SETTINGS = { ...DEFAULT_OPEN_SORA_SETTINGS, installPath: "E:\\Open-Sora" };

describe("open-sora-prompt-builder", () => {
  it("builds natural-language prompt from project fields", () => {
    const out = buildOpenSoraPrompt(DEFAULT_STATE, SETTINGS);
    expect(out).toContain("neon alley");
    expect(out).toContain("Tracking shot");
    expect(out.endsWith(".")).toBe(true);
  });

  it("includes craft fragments from settings", () => {
    const out = buildOpenSoraPrompt(DEFAULT_STATE, {
      ...SETTINGS,
      shotType: "Medium shot",
      colorGrade: "Kodak 2383",
    });
    expect(out.toLowerCase()).toContain("medium shot");
    expect(out).toContain("Kodak 2383");
  });

  it("builds scene list from structure beats", () => {
    const out = buildOpenSoraSceneList({
      vocal: "Voiceover",
      lyricTheme: "isolation",
      lyricStructure: "setup → reveal → hold",
      generatedLyrics: "",
    });
    expect(out).toContain("[Theme: isolation]");
    expect(out).toContain("[setup]");
  });

  it("exports job payload with Open-Sora 2.0 fields", () => {
    const job = buildOpenSoraJobPayload(DEFAULT_STATE, SETTINGS);
    expect(job.kind).toBe("open_sora_job");
    expect(job.configPath).toContain("t2i2v_256px");
    expect(job.aspectRatio).toBe("16:9");
    expect(job.numSteps).toBeGreaterThan(0);
    expect(job.numFrames).toBeGreaterThan(0);
    expect(job.cli_hint).toContain("inference.py");
  });

  it("enables i2v when image payload is provided", () => {
    const job = buildOpenSoraJobPayload(DEFAULT_STATE, SETTINGS, {
      imagePayload: { base64: "abc123", name: "ref.png" },
    });
    expect(job.i2v).toBe(true);
    expect(job.cond_type).toBe("i2v_head");
    expect(job.cli_hint).toContain("i2v_head");
  });
});

describe("open-sora-inspire", () => {
  it("returns random inspiration bundle", () => {
    const bundle = randomOpenSoraInspiration("cinematic");
    expect(bundle.topic).toBeTruthy();
    expect(bundle.ratio).toBeTruthy();
    expect(bundle.suggestions).toBeTruthy();
  });
});

describe("open-sora-prompt-wizard", () => {
  it("walks wizard to final prompt", () => {
    let session = createWizardSession();
    let prompt = null;
    const steps = [
      "A truck in rain",
      "industrial night",
      "tracking shot",
      "dramatic",
      "8",
      "24",
      "16:9",
    ];
    for (const answer of steps) {
      const result = advanceWizard({ ...session, styleName: "cinematic" }, answer);
      session = result.session;
      if (result.prompt) prompt = result.prompt;
    }
    expect(prompt).toContain("industrial night");
    expect(prompt).toContain("16:9");
  });
});
