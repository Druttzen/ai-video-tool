import { describe, expect, it, vi } from "vitest";

vi.mock("../app/lib/electron-bridge.js", () => ({
  isElectronApp: () => true,
  scanSetupEnvironmentFromHost: vi.fn(),
  getDirectorBuildStatus: vi.fn(),
  assembleMusicVideoFromHost: vi.fn(),
  revealDirectorOutput: vi.fn(),
}));

vi.mock("../app/lib/director-settings.js", () => ({
  loadDirectorSettingsFromStorage: () => ({ localRenderEngine: "open-sora" }),
  saveDirectorSettingsToStorage: vi.fn(),
}));

import {
  assessMusicVideoAssembly,
  buildProductionJob,
  evaluateProductionReadiness,
  formatMultiClipProgressLabel,
  multiClipProgressPercent,
  resolveRenderPythonFromScan,
  shouldPreferWslRender,
} from "../app/lib/video-production-pipeline.js";

describe("video production pipeline", () => {
  it("shouldPreferWslRender true for diffusers-wan on Windows when WSL Wan stack ready", () => {
    const raw = {
      platform: "win32",
      pipDeps: {
        ok: true,
        cudaOk: true,
        diffusersOk: true,
        wanPipelineOk: true,
        colossalaiOk: false,
        wanRenderReady: true,
      },
      wsl: { ok: true, wanReady: true, path: "F:\\AppData\\addons\\wsl-venv\\bin\\python3" },
    };
    expect(shouldPreferWslRender(raw, "diffusers-wan")).toBe(true);
  });

  it("shouldPreferWslRender false for diffusers-wan when only native Wan ready", () => {
    const raw = {
      platform: "win32",
      pipDeps: {
        ok: true,
        cudaOk: true,
        diffusersOk: true,
        wanPipelineOk: true,
        colossalaiOk: false,
        wanRenderReady: true,
      },
      wsl: { ok: true, wanReady: false, path: "F:\\AppData\\addons\\wsl-venv\\bin\\python3" },
    };
    expect(shouldPreferWslRender(raw, "diffusers-wan")).toBe(false);
  });

  it("shouldPreferWslRender when WSL stack ready and Windows venv lacks colossalai (open-sora)", () => {
    const raw = {
      platform: "win32",
      pipDeps: { ok: true, cudaOk: true, colossalaiOk: false, winRenderReady: false },
      wsl: { ok: true, path: "/mnt/c/AppData/addons/wsl-venv/bin/python3" },
    };
    expect(shouldPreferWslRender(raw, "open-sora")).toBe(true);
  });

  it("resolveRenderPythonFromScan picks WSL path on Windows without colossalai", () => {
    const result = resolveRenderPythonFromScan(
      {
        platform: "win32",
        pipDeps: { ok: true, cudaOk: false, colossalaiOk: false, winRenderReady: false },
        wsl: { ok: true, path: "/mnt/c/AppData/addons/wsl-venv/bin/python3" },
      },
      { localRenderEngine: "open-sora" },
    );
    expect(result.source).toBe("wsl");
    expect(result.preferWslRender).toBe(true);
    expect(result.localPythonPath).toContain("wsl-venv");
  });

  it("resolveRenderPythonFromScan keeps Windows venv when fully render-ready", () => {
    const result = resolveRenderPythonFromScan({
      platform: "win32",
      pipDeps: { ok: true, cudaOk: true, colossalaiOk: true, winRenderReady: true },
      wsl: { ok: true, path: "/mnt/c/AppData/addons/wsl-venv/bin/python3" },
      venv: { ok: true, path: "C:\\AppData\\venv\\Scripts\\python.exe" },
    });
    expect(result.source).toBe("venv");
    expect(result.preferWslRender).toBe(false);
  });

  it("evaluateProductionReadiness accepts WSL when pip-deps not ready", () => {
    const scan = {
      modules: {
        python: { status: "ready" },
        pipeline: { status: "ready" },
        models: { status: "ready" },
        venv: { status: "ready" },
        "pip-deps": { status: "optional" },
        wsl: { status: "ready" },
        ffmpeg: { status: "optional" },
      },
      raw: { forceManaged: true },
    };
    const result = evaluateProductionReadiness(scan);
    expect(result.ready).toBe(true);
  });

  it("assessMusicVideoAssembly allows multi-clip beat-sync plans", () => {
    const clipPlan = [
      { start: 0, end: 6, duration: 6 },
      { start: 6, end: 12, duration: 6 },
      { start: 12, end: 18, duration: 6 },
    ];
    const mv = assessMusicVideoAssembly({ beatSync: { clipPlan } });
    expect(mv.canAssemble).toBe(true);
    expect(mv.multiClip).toBe(true);
    expect(mv.segmentCount).toBe(3);
  });

  it("buildProductionJob varies prompt and frames per clip segment", () => {
    const { job, settings, segmentProject } = buildProductionJob({
      project: { idea: "base prompt", mood: { darkness: 50, energy: 50 } },
      productionClip: { start: 0, end: 5, duration: 5 },
      clipIndex: 2,
      clipTotal: 4,
      scan: { raw: { venv: { ok: true, path: "python" } } },
    });
    expect(segmentProject.idea).toContain("MV segment 3/4");
    expect(job.prompt).toContain("base prompt");
    expect(settings.seed).toBe(44);
    expect(settings.numFrames).toBeGreaterThan(17);
  });

  it("formatMultiClipProgressLabel and percent track clip assembly", () => {
    const state = {
      multiClip: true,
      clipTotal: 4,
      clipCurrent: 2,
      clipsRendered: 1,
      clipStatus: "rendering",
      clipLabel: "Clip 2/4: 6s (12s–18s)",
    };
    expect(formatMultiClipProgressLabel(state)).toContain("Clip 2/4");
    expect(multiClipProgressPercent(state)).toBeGreaterThan(20);
    expect(multiClipProgressPercent({ multiClip: true, clipTotal: 3, clipStatus: "assembling", clipsRendered: 3 })).toBe(
      100,
    );
    expect(formatMultiClipProgressLabel({ multiClip: true, clipTotal: 3, clipStatus: "assembling", clipsRendered: 3 })).toContain(
      "Assembling",
    );
  });
});
