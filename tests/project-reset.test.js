import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { BLANK_STATE } from "../app/lib/video-config.js";
import { buildBlankProjectSnapshot, resetPersistedPanelSettings } from "../app/lib/project-reset.js";
import { DEFAULT_DIRECTOR_SETTINGS } from "../app/lib/director-settings.js";
import {
  DEFAULT_OPEN_SORA_SETTINGS,
  loadOpenSoraSettingsFromStorage,
  OPEN_SORA_SETTINGS_KEY,
} from "../app/lib/open-sora-settings.js";

describe("project reset helpers", () => {
  it("buildBlankProjectSnapshot clears prompts and analyzers", () => {
    const snap = buildBlankProjectSnapshot("1.0.7");
    expect(snap.appVersion).toBe("1.0.7");
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

  describe("resetPersistedPanelSettings", () => {
    beforeEach(() => {
      const store = new Map();
      vi.stubGlobal("window", {});
      vi.stubGlobal("localStorage", {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => {
          store.set(key, String(value));
        },
        removeItem: (key) => {
          store.delete(key);
        },
        clear: () => store.clear(),
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("clears Open-Sora settings", () => {
      localStorage.setItem(
        OPEN_SORA_SETTINGS_KEY,
        JSON.stringify({ ...DEFAULT_OPEN_SORA_SETTINGS, installPath: "D:\\custom" }),
      );
      resetPersistedPanelSettings();
      expect(loadOpenSoraSettingsFromStorage().installPath).toBe(DEFAULT_OPEN_SORA_SETTINGS.installPath);
    });
  });
});
