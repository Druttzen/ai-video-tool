/**
 * Gather system stats — browser heuristics + Electron native scan via IPC.
 */
import { isElectronApp } from "./electron-bridge";

export const SYSTEM_STATS_STORAGE_KEY = "ai_video_creator_system_stats_v1";

function getWebGLRenderer() {
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return gl.getParameter(gl.RENDERER);
    return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
  } catch {
    return null;
  }
}

/** @returns {import('./system-stats-types').SystemStats} */
export function gatherBrowserSystemStats() {
  const nav = typeof navigator !== "undefined" ? navigator : {};
  const renderer = getWebGLRenderer();
  const discrete =
    renderer &&
    /nvidia|geforce|rtx|gtx|radeon|rx |arc |apple m[0-9]/i.test(renderer) &&
    !/microsoft basic|swiftshader|llvmpipe/i.test(renderer);

  let vramGb = null;
  if (renderer) {
    if (/rtx 4090|a6000|6000 ada/i.test(renderer)) vramGb = 24;
    else if (/rtx 4080|3090/i.test(renderer)) vramGb = 16;
    else if (/rtx 4070|3080|4080|rx 7900|rx 6900/i.test(renderer)) vramGb = 12;
    else if (/rtx 4060|3070|3060|rx 6700|rx 6800/i.test(renderer)) vramGb = 8;
    else if (/gtx 1660|1650|rx 580|arc a750/i.test(renderer)) vramGb = 6;
    else if (discrete) vramGb = 4;
    else vramGb = 2;
  }

  return {
    source: "browser",
    platform: nav.platform || "unknown",
    scannedAt: new Date().toISOString(),
    cpuCores: nav.hardwareConcurrency || 4,
    cpuModel: "Browser estimate",
    totalMemGb: nav.deviceMemory || null,
    freeMemGb: null,
    deviceMemoryGb: nav.deviceMemory || null,
    gpus: renderer
      ? [{ name: renderer, vramGb, discrete: !!discrete, driverVersion: "" }]
      : [],
    primaryGpu: renderer
      ? { name: renderer, vramGb, discrete: !!discrete, driverVersion: "" }
      : null,
    detectedApis: detectBrowserGraphicsApis(nav.platform, renderer),
    detectedComputeBackends: detectBrowserComputeBackends(nav.platform, renderer),
  };
}

function detectBrowserGraphicsApis(platform, renderer) {
  const p = String(platform || "").toLowerCase();
  const apis = new Set(["auto", "webgpu"]);
  if (p.includes("win")) ["directx12", "directx11", "vulkan", "opengl"].forEach((a) => apis.add(a));
  else if (p.includes("mac")) ["metal", "opengl"].forEach((a) => apis.add(a));
  else ["vulkan", "opengl"].forEach((a) => apis.add(a));
  if (renderer && /vulkan/i.test(renderer)) apis.add("vulkan");
  return [...apis];
}

function detectBrowserComputeBackends(platform, renderer) {
  const p = String(platform || "").toLowerCase();
  const backends = new Set(["auto", "cpu"]);
  if (p.includes("win")) {
    backends.add("directml");
    backends.add("vulkan");
  } else if (p.includes("mac")) {
    backends.add("mps");
  } else {
    backends.add("vulkan");
  }
  if (renderer && /nvidia|geforce|rtx/i.test(renderer)) backends.add("cuda");
  if (renderer && /radeon|amd|rx /i.test(renderer)) backends.add("rocm");
  return [...backends];
}

export function loadCachedSystemStats() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SYSTEM_STATS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCachedSystemStats(stats) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SYSTEM_STATS_STORAGE_KEY, JSON.stringify(stats));
  } catch {
    /* ignore */
  }
}

/**
 * Full scan — Electron native when available, else browser estimate.
 * @returns {Promise<import('./system-stats-types').SystemStats>}
 */
export async function gatherSystemStats() {
  if (isElectronApp() && window.electronAPI?.getSystemStats) {
    try {
      const res = await window.electronAPI.getSystemStats();
      if (res?.ok && res.stats) {
        const stats = { ...res.stats, scannedAt: new Date().toISOString() };
        saveCachedSystemStats(stats);
        return stats;
      }
    } catch {
      /* fall through */
    }
  }
  const stats = gatherBrowserSystemStats();
  saveCachedSystemStats(stats);
  return stats;
}
