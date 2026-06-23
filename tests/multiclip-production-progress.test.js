import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../app/lib/director-settings.js", () => ({
  loadDirectorSettingsFromStorage: () => ({
    renderBackend: "local-python",
    localRenderEngine: "diffusers-wan",
    localPythonPath: "python",
    numFrames: 65,
    fps: 24,
    seed: 42,
  }),
  saveDirectorSettingsToStorage: vi.fn(),
}));

vi.mock("../app/lib/director-launch.js", () => ({
  sendDirectorJob: vi.fn(async () => ({
    ok: true,
    logPath: "C:\\temp\\agent-render.log",
    pid: 4242,
    startedAt: Date.now(),
    estimatedMs: 50,
  })),
}));

let clipCounter = 0;

vi.mock("../app/lib/electron-bridge.js", () => ({
  isElectronApp: () => true,
  scanSetupEnvironmentFromHost: vi.fn(),
  getDirectorBuildStatus: vi.fn(async () => {
    clipCounter += 1;
    return {
      ok: true,
      status: "complete",
      outputVideoPath: `C:\\temp\\beat-clip-${clipCounter}.mp4`,
      message: `Clip ${clipCounter} complete`,
    };
  }),
  assembleMusicVideoFromHost: vi.fn(async () => ({
    ok: true,
    path: "C:\\temp\\music-video-with-audio.mp4",
    message: "Muxed",
  })),
  revealDirectorOutput: vi.fn(),
}));

vi.mock("../app/lib/setup-hub.js", () => ({
  buildSetupScanFromHost: vi.fn((host) => host?.scan || host),
  getMissingSetupChecklist: () => [],
  loadPersistedSetupScan: () => ({
    modules: {
      python: { status: "ready" },
      venv: { status: "ready" },
      "pip-deps": { status: "ready", cudaOk: true, diffusersOk: true, wanRenderReady: true },
      ffmpeg: { status: "ready" },
    },
    raw: {
      venv: { ok: true, path: "python" },
      pipDeps: { ok: true, cudaOk: true, diffusersOk: true, wanRenderReady: true },
    },
  }),
  summarizeSetupScan: () => ({ label: "Ready", localRenderReady: true }),
}));

vi.mock("../app/lib/system-stats.js", () => ({
  loadCachedSystemStats: () => null,
}));

import { runFullProduction, multiClipProgressPercent } from "../app/lib/video-production-pipeline.js";

const CLIP_PLAN = [
  { start: 0, end: 5, duration: 5, label: "intro" },
  { start: 5, end: 10, duration: 5, label: "verse" },
  { start: 10, end: 15, duration: 5, label: "chorus" },
  { start: 15, end: 20, duration: 5, label: "outro" },
];

describe("multiclip production progress simulation", () => {
  beforeEach(() => {
    clipCounter = 0;
  });

  it("runs 4 beat-sync clips and advances progress clip by clip", async () => {
    const progress = [];

    const result = await runFullProduction({
      project: {
        idea: "Neon highway beat-sync MV",
        mood: { darkness: 55, energy: 72 },
        selectedGenres: ["Synthwave"],
      },
      audioAnalysis: {
        fileName: "demo-track.wav",
        bpm: 128,
        durationSec: 20,
        beatSync: { clipPlan: CLIP_PLAN, beatCount: 40 },
      },
      audioBuffer: new Uint8Array([1, 2, 3, 4]).buffer,
      onProgress: (patch) => progress.push({ ...patch }),
      onPhase: () => {},
      onMessage: () => {},
    });

    expect(result.ok).toBe(true);
    expect(result.multiClip).toBe(true);
    expect(result.clipPaths).toHaveLength(4);

    const currents = progress.map((p) => p.clipCurrent).filter(Boolean);
    expect(currents).toContain(1);
    expect(currents).toContain(2);
    expect(currents).toContain(3);
    expect(currents).toContain(4);

    const renderedSteps = progress
      .filter((p) => typeof p.clipsRendered === "number")
      .map((p) => p.clipsRendered);
    expect(Math.max(...renderedSteps)).toBe(4);

    const percents = progress
      .filter((p) => p.multiClip && p.clipTotal === 4)
      .map((p) => multiClipProgressPercent(p));
    expect(Math.min(...percents)).toBeLessThan(Math.max(...percents));

    const assembling = progress.find((p) => p.clipStatus === "assembling");
    expect(assembling).toBeTruthy();
    expect(multiClipProgressPercent(assembling)).toBe(100);
  });
});
