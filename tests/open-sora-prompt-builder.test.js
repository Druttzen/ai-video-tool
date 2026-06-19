import { describe, expect, it } from "vitest";
import {
  buildOpenSoraJobPayload,
  buildOpenSoraPrompt,
  buildOpenSoraSceneList,
} from "../app/lib/open-sora-prompt-builder.js";
import { DEFAULT_STATE } from "../app/lib/video-config.js";

describe("open-sora-prompt-builder", () => {
  it("builds natural-language prompt from project fields", () => {
    const out = buildOpenSoraPrompt(DEFAULT_STATE);
    expect(out).toContain("neon alley");
    expect(out).toContain("Tracking shot");
    expect(out.endsWith(".")).toBe(true);
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

  it("exports job payload with install path and CLI hint", () => {
    const job = buildOpenSoraJobPayload(DEFAULT_STATE, {
      installPath: "E:\\Open-Sora",
      steps: 16,
      cfg: 7.5,
      resolution: "768x432",
      fps: 16,
      seed: 42,
      motionScore: 4,
    });
    expect(job.kind).toBe("open_sora_job");
    expect(job.installPath).toBe("E:\\Open-Sora");
    expect(job.prompt.length).toBeGreaterThan(40);
    expect(job.cli_hint).toContain("Open-Sora");
  });

  it("enables i2v when image payload is provided", () => {
    const job = buildOpenSoraJobPayload(
      DEFAULT_STATE,
      { installPath: "E:\\Open-Sora", useI2vWhenImage: true },
      { imagePayload: { base64: "abc123", name: "ref.png" } },
    );
    expect(job.i2v).toBe(true);
    expect(job.cond_type).toBe("i2v_head");
    expect(job.ref_image_name).toBe("ref.png");
    expect(job.cli_hint).toContain("i2v_head");
  });

  it("uses image analysis in prompt when idea is empty", () => {
    const out = buildOpenSoraPrompt({
      ...DEFAULT_STATE,
      idea: "",
      imageAnalysis: { summary: "Rain-soaked neon street at night.", visualMood: "melancholic" },
    });
    expect(out).toContain("Rain-soaked neon street");
  });
});
