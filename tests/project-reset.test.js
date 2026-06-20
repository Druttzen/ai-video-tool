import { describe, expect, it } from "vitest";
import { BLANK_STATE } from "../app/lib/video-config.js";
import { buildBlankProjectSnapshot } from "../app/lib/project-reset.js";
import { DEFAULT_DIRECTOR_SETTINGS } from "../app/lib/director-settings.js";

describe("project reset helpers", () => {
  it("buildBlankProjectSnapshot clears prompts and analyzers", () => {
    const snap = buildBlankProjectSnapshot("1.0.4");
    expect(snap.appVersion).toBe("1.0.4");
    expect(snap.idea).toBe(BLANK_STATE.idea);
    expect(snap.selectedGenres).toEqual([]);
    expect(snap.audioAnalysis).toBeNull();
    expect(snap.imageAnalysis).toBeNull();
    expect(snap.guidedStep).toBe(0);
  });

  it("default director settings stay export-only after reset helper baseline", () => {
    expect(DEFAULT_DIRECTOR_SETTINGS.renderBackend).toBe("export");
    expect(DEFAULT_DIRECTOR_SETTINGS.localPipelinePath).toBe("");
  });
});
