import { describe, expect, it } from "vitest";
import {
  formatInstallPhase2Message,
  isOnlyPipStackMissing,
} from "../scripts/lib/tool-installer.cjs";

describe("tool-installer pip stack install shortcut", () => {
  it("detects when only pip-deps and music-video-sync need install", () => {
    expect(
      isOnlyPipStackMissing({ missingIds: ["pip-deps", "music-video-sync"], missingCount: 2 }),
    ).toBe(true);
    expect(isOnlyPipStackMissing({ missingIds: ["pip-deps"], missingCount: 1 })).toBe(true);
    expect(isOnlyPipStackMissing({ missingIds: ["python", "pip-deps"], missingCount: 2 })).toBe(false);
    expect(isOnlyPipStackMissing({ missingIds: [], missingCount: 0 })).toBe(false);
  });

  it("formats phase 2 message for pip-only installs", () => {
    const msg = formatInstallPhase2Message({
      missingIds: ["pip-deps", "music-video-sync"],
      missingCount: 2,
    });
    expect(msg).toMatch(/pip stack/);
    expect(msg).toMatch(/2–4 GB/);
  });
});
