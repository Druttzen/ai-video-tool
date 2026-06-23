import path from "path";
import { describe, expect, it, afterEach } from "vitest";
import {
  findRepoRoot,
  LOCAL_USERDATA_DIR,
  resolveUserDataPath,
} from "../scripts/lib/open-sora-paths.cjs";

describe("resolveUserDataPath", () => {
  const envKeys = ["ADDON_USER_DATA", "AI_VIDEO_CREATOR_USER_DATA", "AI_VIDEO_USE_APPDATA"];

  afterEach(() => {
    for (const key of envKeys) delete process.env[key];
  });

  it("finds the ai-video-tool repo root from cwd", () => {
    const repo = findRepoRoot(process.cwd());
    expect(repo).toBeTruthy();
    expect(path.basename(repo)).not.toBe("scripts");
  });

  it("defaults to repo .userdata for checkout dev installs", () => {
    const repo = findRepoRoot(process.cwd());
    const userData = resolveUserDataPath(repo);
    expect(userData).toBe(path.join(repo, LOCAL_USERDATA_DIR));
    expect(userData).toMatch(/\.userdata$/);
  });

  it("honors ADDON_USER_DATA override", () => {
    const custom = path.join(process.cwd(), "custom-userdata");
    process.env.ADDON_USER_DATA = custom;
    expect(resolveUserDataPath()).toBe(path.resolve(custom));
  });

  it("falls back to AppData when AI_VIDEO_USE_APPDATA=1", () => {
    process.env.AI_VIDEO_USE_APPDATA = "1";
    const userData = resolveUserDataPath(process.cwd());
    expect(userData).not.toMatch(/\.userdata$/);
    expect(userData).toMatch(/AI Video Creator$/);
  });
});
