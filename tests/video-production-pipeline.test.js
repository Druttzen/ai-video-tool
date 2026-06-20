import { describe, expect, it, vi } from "vitest";

vi.mock("../app/lib/electron-bridge.js", () => ({
  isElectronApp: () => true,
  scanSetupEnvironmentFromHost: vi.fn(),
  getDirectorBuildStatus: vi.fn(),
  assembleMusicVideoFromHost: vi.fn(),
  revealDirectorOutput: vi.fn(),
}));

import {
  evaluateProductionReadiness,
  resolveRenderPythonFromScan,
  shouldPreferWslRender,
} from "../app/lib/video-production-pipeline.js";

describe("video production pipeline", () => {
  it("shouldPreferWslRender when WSL stack ready and Windows venv lacks colossalai", () => {
    const raw = {
      platform: "win32",
      pipDeps: { ok: true, cudaOk: true, colossalaiOk: false, winRenderReady: false },
      wsl: { ok: true, path: "/mnt/c/AppData/addons/wsl-venv/bin/python3" },
    };
    expect(shouldPreferWslRender(raw)).toBe(true);
  });

  it("resolveRenderPythonFromScan picks WSL path on Windows without colossalai", () => {
    const result = resolveRenderPythonFromScan({
      platform: "win32",
      pipDeps: { ok: true, cudaOk: false, colossalaiOk: false, winRenderReady: false },
      wsl: { ok: true, path: "/mnt/c/AppData/addons/wsl-venv/bin/python3" },
    });
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
});
