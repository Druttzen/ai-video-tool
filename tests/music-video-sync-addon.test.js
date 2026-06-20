import { describe, expect, it } from "vitest";
import { resolveMusicVideoSyncScript } from "../scripts/lib/music-video-sync.cjs";

describe("music-video-sync addon", () => {
  it("bundles run-music-video-sync.py", () => {
    const scriptPath = resolveMusicVideoSyncScript();
    expect(scriptPath).toBeTruthy();
    expect(String(scriptPath)).toMatch(/run-music-video-sync\.py$/);
  });
});
