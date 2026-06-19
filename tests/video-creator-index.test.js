import { describe, expect, it } from "vitest";
import {
  buildIndexBrowseSections,
  getIndexCameraMovement,
  getIndexSceneTemplates,
  getIndexWorkflows,
  VIDEO_CREATOR_INDEX,
} from "../app/lib/video-creator-index.js";

describe("video-creator-index", () => {
  it("loads master index with sources", () => {
    expect(VIDEO_CREATOR_INDEX.version).toBeTruthy();
    expect(VIDEO_CREATOR_INDEX.sources.length).toBeGreaterThan(3);
  });

  it("includes workflows 1–8", () => {
    expect(getIndexWorkflows().length).toBeGreaterThanOrEqual(8);
  });

  it("merges scene templates for Director", () => {
    expect(getIndexSceneTemplates()["Synthwave highway"]).toBeTruthy();
  });

  it("includes expanded camera vocabulary", () => {
    expect(getIndexCameraMovement()).toContain("Rack focus");
    expect(getIndexCameraMovement()).toContain("Truck left");
  });

  it("builds browse sections", () => {
    const sections = buildIndexBrowseSections();
    expect(sections.some((s) => s.id === "camera")).toBe(true);
    expect(sections.some((s) => s.id === "rules")).toBe(true);
  });
});
