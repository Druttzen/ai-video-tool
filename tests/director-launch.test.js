import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { sendDirectorJob } from "../app/lib/director-launch.js";
import { DEFAULT_STATE } from "../app/lib/video-config.js";
import { DEFAULT_DIRECTOR_SETTINGS } from "../app/lib/director-settings.js";

function makeProject() {
  return { ...DEFAULT_STATE, idea: "neon alley at night" };
}

describe("sendDirectorJob", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal("Blob", class MockBlob {
      constructor(parts, opts) {
        this.parts = parts;
        this.type = opts?.type;
      }
    });
    const anchor = { href: "", download: "", click: vi.fn() };
    vi.stubGlobal("document", {
      createElement: vi.fn(() => anchor),
    });
    return anchor;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("downloads JSON in export mode", async () => {
    const anchor = document.createElement("a");
    vi.stubGlobal("window", { electronAPI: undefined });

    const result = await sendDirectorJob({
      project: makeProject(),
      settings: { ...DEFAULT_DIRECTOR_SETTINGS, renderBackend: "export" },
    });

    expect(result.ok).toBe(true);
    expect(result.exportOnly).toBe(true);
    expect(anchor.click).toHaveBeenCalled();
  });

  it("blocks open-sora local render without a pipeline folder", async () => {
    vi.stubGlobal("window", {
      electronAPI: {
        launchDirectorJob: vi.fn(),
      },
    });

    const result = await sendDirectorJob({
      project: makeProject(),
      settings: {
        ...DEFAULT_DIRECTOR_SETTINGS,
        renderBackend: "local-python",
        localRenderEngine: "open-sora",
        localPipelinePath: "",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/pipeline|Open-Sora|Wan/i);
    expect(window.electronAPI.launchDirectorJob).not.toHaveBeenCalled();
  });

  it("allows diffusers-wan local render without pipeline folder", async () => {
    const launchDirectorJob = vi.fn().mockResolvedValue({ ok: true, pid: 1 });
    vi.stubGlobal("window", { electronAPI: { launchDirectorJob } });

    const result = await sendDirectorJob({
      project: makeProject(),
      settings: {
        ...DEFAULT_DIRECTOR_SETTINGS,
        renderBackend: "local-python",
        localRenderEngine: "diffusers-wan",
        localPipelinePath: "",
      },
    });

    expect(result.ok).toBe(true);
    expect(launchDirectorJob).toHaveBeenCalled();
  });
});
