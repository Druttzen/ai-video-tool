import { describe, expect, it } from "vitest";
import { getDefaultOpenSoraInstallPath } from "../app/lib/open-sora-paths.js";
import { defaultOpenSoraPath } from "../scripts/lib/open-sora-paths.cjs";
import {
  hasLyricsVocal,
  isSilentVocal,
  LEGACY_INSTRUMENTAL_VOCAL,
  SILENT_VOCAL,
} from "../app/lib/vocal-mode.js";

describe("vocal-mode", () => {
  it("treats Silent visual and legacy Instrumental as silent", () => {
    expect(isSilentVocal(SILENT_VOCAL)).toBe(true);
    expect(isSilentVocal(LEGACY_INSTRUMENTAL_VOCAL)).toBe(true);
    expect(isSilentVocal("Voiceover")).toBe(false);
    expect(hasLyricsVocal("Voiceover")).toBe(true);
    expect(hasLyricsVocal(SILENT_VOCAL)).toBe(false);
  });
});

describe("open-sora-paths", () => {
  it("browser default is platform-aware or home-relative", () => {
    const path = getDefaultOpenSoraInstallPath();
    expect(path).toMatch(/Open-Sora$/);
  });

  it("node default matches environment-scan helper", () => {
    expect(defaultOpenSoraPath()).toMatch(/Open-Sora$/);
  });
});
