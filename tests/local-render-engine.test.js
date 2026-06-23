import { describe, it, expect } from "vitest";
import {
  DEFAULT_LOCAL_RENDER_ENGINE,
  isWinNativeRenderReady,
  productionRequiredModulesForEngine,
} from "../app/lib/local-render-engine.js";

describe("local-render-engine", () => {
  it("diffusers-wan production modules skip open-sora pipeline", () => {
    expect(productionRequiredModulesForEngine("diffusers-wan")).toEqual([
      "python",
      "venv",
      "pip-deps",
    ]);
    expect(productionRequiredModulesForEngine("open-sora")).toContain("pipeline");
  });

  it("isWinNativeRenderReady uses wan path without colossalai", () => {
    const raw = {
      pipDeps: { ok: true, cudaOk: true, diffusersOk: true, colossalaiOk: false },
    };
    expect(isWinNativeRenderReady(raw, "diffusers-wan")).toBe(true);
    expect(isWinNativeRenderReady(raw, "open-sora")).toBe(false);
    expect(DEFAULT_LOCAL_RENDER_ENGINE).toBe("diffusers-wan");
  });
});
