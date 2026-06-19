import { describe, expect, it } from "vitest";
import {
  buildGraphicsApiEnv,
  detectAvailableComputeBackends,
  detectAvailableGraphicsApis,
  recommendGraphicsStack,
  resolveComputeBackend,
  resolveGraphicsApi,
} from "../app/lib/graphics-api.js";
import { DEFAULT_DIRECTOR_SETTINGS } from "../app/lib/director-settings.js";

describe("graphics API support", () => {
  const nvidiaWin = {
    platform: "win32",
    primaryGpu: { name: "NVIDIA GeForce RTX 4070", vramGb: 12, discrete: true },
    detectedApis: ["auto", "directx12", "vulkan", "opengl"],
    detectedComputeBackends: ["auto", "cpu", "cuda", "directml"],
  };

  it("detects DirectX and Vulkan on Windows", () => {
    const apis = detectAvailableGraphicsApis(nvidiaWin);
    expect(apis).toContain("directx12");
    expect(apis).toContain("vulkan");
  });

  it("recommends CUDA on NVIDIA Windows", () => {
    const rec = recommendGraphicsStack(nvidiaWin);
    expect(rec.computeBackend).toBe("cuda");
    expect(rec.graphicsApi).toBe("directx12");
  });

  it("recommends Metal on macOS", () => {
    const rec = recommendGraphicsStack({
      platform: "darwin",
      primaryGpu: { name: "Apple M2", discrete: true },
    });
    expect(rec.graphicsApi).toBe("metal");
    expect(rec.computeBackend).toBe("mps");
  });

  it("builds env vars for Vulkan compute", () => {
    const env = buildGraphicsApiEnv(
      { ...DEFAULT_DIRECTOR_SETTINGS, graphicsApi: "vulkan", computeBackend: "vulkan" },
      nvidiaWin,
    );
    expect(env.AI_VIDEO_GRAPHICS_API).toBe("vulkan");
    expect(env.AI_VIDEO_COMPUTE_BACKEND).toBe("vulkan");
  });

  it("resolves auto to recommended stack", () => {
    expect(resolveGraphicsApi({ graphicsApi: "auto" }, nvidiaWin)).toBe("directx12");
    expect(resolveComputeBackend({ computeBackend: "auto" }, nvidiaWin)).toBe("cuda");
  });

  it("detects ROCm on AMD Linux", () => {
    const backends = detectAvailableComputeBackends({
      platform: "linux",
      primaryGpu: { name: "AMD Radeon RX 7900", discrete: true },
    });
    expect(backends).toContain("rocm");
  });
});
