import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createBundlePathGuard,
  isAllowedExternalUrl,
  resolveSafeExecutable,
  validateMusicVideoAssemblePaths,
  validateMusicVideoAudioBuffer,
  validateRevealPath,
} from "../scripts/lib/ipc-security.cjs";

describe("ipc-security", () => {
  describe("isAllowedExternalUrl", () => {
    it("allows http, https, and mailto", () => {
      expect(isAllowedExternalUrl("https://example.com")).toBe(true);
      expect(isAllowedExternalUrl("http://localhost:3000")).toBe(true);
      expect(isAllowedExternalUrl("mailto:dj@example.com")).toBe(true);
    });

    it("rejects file and javascript URLs", () => {
      expect(isAllowedExternalUrl("file:///etc/passwd")).toBe(false);
      expect(isAllowedExternalUrl("javascript:alert(1)")).toBe(false);
      expect(isAllowedExternalUrl("")).toBe(false);
    });
  });

  describe("resolveSafeExecutable", () => {
    it("allows bare python command names", () => {
      expect(resolveSafeExecutable("python").ok).toBe(true);
      expect(resolveSafeExecutable("py").executable).toBe("py");
    });

    it("rejects shell metacharacters", () => {
      expect(resolveSafeExecutable("python & calc").ok).toBe(false);
      expect(resolveSafeExecutable("cmd;whoami").ok).toBe(false);
    });

    it("resolves existing absolute executable paths", () => {
      const nodePath = process.execPath;
      const res = resolveSafeExecutable(nodePath);
      expect(res.ok).toBe(true);
      expect(res.executable).toBe(nodePath);
    });
  });

  describe("createBundlePathGuard", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ipc-bundle-"));
    const bundlePath = path.join(tmpDir, "handoff.aivbundle.json");

    afterEach(() => {
      try {
        fs.unlinkSync(bundlePath);
      } catch {
        /* ignore */
      }
    });

    it("rejects unregistered bundle paths", () => {
      fs.writeFileSync(bundlePath, "{}", "utf8");
      const guard = createBundlePathGuard();
      const res = guard.validate(bundlePath);
      expect(res.ok).toBe(false);
    });

    it("allows registered bundle paths", () => {
      fs.writeFileSync(bundlePath, "{}", "utf8");
      const guard = createBundlePathGuard();
      guard.register(bundlePath);
      expect(guard.validate(bundlePath).ok).toBe(true);
    });

    it("allows pending bundle path without explicit register", () => {
      fs.writeFileSync(bundlePath, "{}", "utf8");
      const guard = createBundlePathGuard();
      expect(guard.validate(bundlePath, { pendingPath: bundlePath }).ok).toBe(true);
    });
  });

  describe("validateMusicVideoAssemblePaths", () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "ipc-mv-"));
    const clipPath = path.join(userData, "clip.mp4");
    const audioPath = path.join(os.tmpdir(), "mv-audio-test.wav");
    const outputPath = path.join(userData, "out.mp4");

    afterEach(() => {
      for (const file of [clipPath, audioPath, outputPath]) {
        try {
          fs.unlinkSync(file);
        } catch {
          /* ignore */
        }
      }
    });

    it("rejects paths outside allowed roots", () => {
      const res = validateMusicVideoAssemblePaths({
        clipPaths: ["C:/Windows/System32/not-a-video.mp4"],
        audioPath,
        outputPath,
        userDataPath: userData,
      });
      expect(res.ok).toBe(false);
    });

    it("accepts clips, audio, and output under allowed roots", () => {
      fs.writeFileSync(clipPath, "video");
      fs.writeFileSync(audioPath, "audio");
      const res = validateMusicVideoAssemblePaths({
        clipPaths: [clipPath],
        audioPath,
        outputPath,
        userDataPath: userData,
      });
      expect(res.ok).toBe(true);
    });
  });

  describe("validateRevealPath", () => {
    it("rejects paths outside user data roots", () => {
      const res = validateRevealPath("C:/Windows/win.ini", {
        userDataPath: os.tmpdir(),
      });
      expect(res.ok).toBe(false);
    });
  });

  describe("validateMusicVideoAudioBuffer", () => {
    it("rejects oversized audio buffers", () => {
      const big = new Uint8Array(49 * 1024 * 1024);
      expect(validateMusicVideoAudioBuffer(big).ok).toBe(false);
      expect(validateMusicVideoAudioBuffer(new Uint8Array(1024)).ok).toBe(true);
    });
  });
});
