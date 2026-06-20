import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { assembleMusicVideo } from "../scripts/lib/music-video-assemble.cjs";

describe("music-video-assemble", () => {
  it("returns error when no clips exist", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mv-assemble-test-"));
    try {
      const result = await assembleMusicVideo({
        clipPaths: [path.join(workDir, "missing.mp4")],
        audioPath: path.join(workDir, "track.wav"),
        outputPath: path.join(workDir, "out.mp4"),
        userDataPath: workDir,
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain("No clip");
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  it("returns error when audio track is missing", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mv-assemble-test-"));
    try {
      const clip = path.join(workDir, "a.mp4");
      fs.writeFileSync(clip, "clip");
      const result = await assembleMusicVideo({
        clipPaths: [clip],
        audioPath: path.join(workDir, "missing.wav"),
        outputPath: path.join(workDir, "out.mp4"),
        userDataPath: workDir,
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain("Audio track not found");
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });
});
