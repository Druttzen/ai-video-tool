import { describe, expect, it } from "vitest";
import {
  buildClipSegmentPrompt,
  DEFAULT_PRODUCTION_MAX_CLIPS,
  resolveProductionClipPlan,
} from "../app/lib/production-clip-plan.js";

describe("production clip plan", () => {
  it("resolveProductionClipPlan returns empty for single or missing plan", () => {
    expect(resolveProductionClipPlan(null)).toEqual([]);
    expect(resolveProductionClipPlan({ beatSync: { clipPlan: [{ start: 0, end: 4, duration: 4 }] } })).toEqual(
      [],
    );
  });

  it("resolveProductionClipPlan caps multi-segment plans", () => {
    const clipPlan = Array.from({ length: 12 }, (_, i) => ({
      start: i * 4,
      end: (i + 1) * 4,
      duration: 4,
    }));
    const resolved = resolveProductionClipPlan({ beatSync: { clipPlan } }, 3);
    expect(resolved).toHaveLength(3);
    expect(resolved[0].start).toBe(0);
  });

  it("buildClipSegmentPrompt prefixes beat-sync segment header", () => {
    const prompt = buildClipSegmentPrompt("cinematic neon city", { start: 8, end: 14, duration: 6, label: "verse" }, 1, 4);
    expect(prompt).toContain("MV segment 2/4");
    expect(prompt).toContain("8.0s–14.0s");
    expect(prompt).toContain("verse");
    expect(prompt).toContain("cinematic neon city");
  });

  it("DEFAULT_PRODUCTION_MAX_CLIPS is reasonable", () => {
    expect(DEFAULT_PRODUCTION_MAX_CLIPS).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_PRODUCTION_MAX_CLIPS).toBeLessThanOrEqual(24);
  });
});
