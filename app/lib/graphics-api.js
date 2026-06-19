/**
 * Graphics API support — DirectX, Vulkan, OpenGL, Metal, compute backends.
 */
import catalog from "../../data/graphics-api-catalog.json";

export function getGraphicsApiCatalog() {
  return catalog;
}

export function getGraphicsApiOptions() {
  return catalog.graphicsApis || [];
}

export function getComputeBackendOptions() {
  return catalog.computeBackends || [];
}

export function getValidationModeOptions() {
  return catalog.validationModes || [];
}

function gpuVendor(gpuName = "") {
  const n = String(gpuName).toLowerCase();
  if (/nvidia|geforce|rtx|gtx|quadro/.test(n)) return "nvidia";
  if (/amd|radeon|rx /.test(n)) return "amd";
  if (/intel|arc |iris|uhd/.test(n)) return "intel";
  if (/apple|m[1-9]/.test(n)) return "apple";
  return "unknown";
}

function platformKey(stats) {
  if (typeof navigator !== "undefined" && !stats?.platform) {
    const p = navigator.platform?.toLowerCase() || "";
    if (p.includes("win")) return "win32";
    if (p.includes("mac")) return "darwin";
    if (p.includes("linux")) return "linux";
    return "win32";
  }
  return stats?.platform || "win32";
}

/**
 * Heuristic list of APIs available on this machine.
 * @param {import('./system-stats-types').SystemStats|null} stats
 */
export function detectAvailableGraphicsApis(stats = null) {
  const platform = platformKey(stats);
  const vendor = gpuVendor(stats?.primaryGpu?.name || "");
  const discrete = stats?.primaryGpu?.discrete === true;
  const detected = stats?.detectedApis;

  if (Array.isArray(detected) && detected.length) {
    return detected;
  }

  const apis = new Set(["auto"]);

  if (platform === "win32") {
    apis.add("directx12");
    apis.add("directx11");
    apis.add("vulkan");
    apis.add("opengl");
    apis.add("webgpu");
    if (vendor === "nvidia" || discrete) apis.add("cuda");
  } else if (platform === "linux") {
    apis.add("vulkan");
    apis.add("opengl");
    if (vendor === "nvidia") apis.add("cuda");
    if (vendor === "amd") apis.add("rocm");
  } else if (platform === "darwin") {
    apis.add("metal");
    apis.add("opengl");
    apis.add("webgpu");
  }

  return [...apis];
}

export function detectAvailableComputeBackends(stats = null) {
  const platform = platformKey(stats);
  const vendor = gpuVendor(stats?.primaryGpu?.name || "");
  const detected = stats?.detectedComputeBackends;

  if (Array.isArray(detected) && detected.length) {
    return detected;
  }

  const backends = new Set(["auto", "cpu"]);

  if (platform === "win32") {
    backends.add("directml");
    backends.add("vulkan");
    if (vendor === "nvidia") backends.add("cuda");
    if (vendor === "amd") backends.add("rocm");
    if (vendor === "intel") backends.add("oneapi");
  } else if (platform === "linux") {
    backends.add("vulkan");
    if (vendor === "nvidia") backends.add("cuda");
    if (vendor === "amd") backends.add("rocm");
    if (vendor === "intel") backends.add("oneapi");
  } else if (platform === "darwin") {
    backends.add("mps");
  }

  return [...backends];
}

export function isGraphicsApiAvailable(apiId, stats = null) {
  if (apiId === "auto") return true;
  const api = getGraphicsApiOptions().find((a) => a.id === apiId);
  if (!api) return false;
  const platform = platformKey(stats);
  if (api.platforms && !api.platforms.includes(platform)) return false;
  return detectAvailableGraphicsApis(stats).includes(apiId);
}

export function isComputeBackendAvailable(backendId, stats = null) {
  if (backendId === "auto") return true;
  const be = getComputeBackendOptions().find((b) => b.id === backendId);
  if (!be) return false;
  const platform = platformKey(stats);
  if (be.platforms && !be.platforms.includes(platform)) return false;
  const vendor = gpuVendor(stats?.primaryGpu?.name || "");
  if (be.vendors?.length && !be.vendors.includes(vendor)) return false;
  return detectAvailableComputeBackends(stats).includes(backendId);
}

/**
 * Recommend graphics + compute pair from hardware.
 * @param {import('./system-stats-types').SystemStats|null} stats
 */
export function recommendGraphicsStack(stats = null) {
  const platform = platformKey(stats);
  const vendor = gpuVendor(stats?.primaryGpu?.name || "");

  if (platform === "darwin") {
    return { graphicsApi: "metal", computeBackend: "mps", reason: "Apple — Metal + MPS" };
  }
  if (platform === "win32") {
    if (vendor === "nvidia") {
      return { graphicsApi: "directx12", computeBackend: "cuda", reason: "NVIDIA on Windows — DX12 + CUDA" };
    }
    if (vendor === "amd") {
      return { graphicsApi: "vulkan", computeBackend: "directml", reason: "AMD on Windows — Vulkan + DirectML" };
    }
    if (vendor === "intel") {
      return { graphicsApi: "directx12", computeBackend: "directml", reason: "Intel on Windows — DX12 + DirectML" };
    }
    return { graphicsApi: "directx12", computeBackend: "directml", reason: "Windows default — DX12 + DirectML" };
  }
  if (platform === "linux") {
    if (vendor === "nvidia") {
      return { graphicsApi: "vulkan", computeBackend: "cuda", reason: "NVIDIA on Linux — Vulkan + CUDA" };
    }
    if (vendor === "amd") {
      return { graphicsApi: "vulkan", computeBackend: "rocm", reason: "AMD on Linux — Vulkan + ROCm" };
    }
    return { graphicsApi: "vulkan", computeBackend: "vulkan", reason: "Linux default — Vulkan" };
  }
  return { graphicsApi: "auto", computeBackend: "auto", reason: "Auto-detect" };
}

export function resolveGraphicsApi(settings, stats = null) {
  if (settings?.graphicsApi && settings.graphicsApi !== "auto") {
    return settings.graphicsApi;
  }
  return recommendGraphicsStack(stats).graphicsApi;
}

export function resolveComputeBackend(settings, stats = null) {
  if (settings?.computeBackend && settings.computeBackend !== "auto") {
    return settings.computeBackend;
  }
  return recommendGraphicsStack(stats).computeBackend;
}

/**
 * Build environment variables for render subprocess.
 * @param {object} settings
 * @param {import('./system-stats-types').SystemStats|null} [stats]
 */
export function buildGraphicsApiEnv(settings, stats = null) {
  const graphicsApi = resolveGraphicsApi(settings, stats);
  const computeBackend = resolveComputeBackend(settings, stats);
  /** @type {Record<string, string>} */
  const env = {
    AI_VIDEO_GRAPHICS_API: graphicsApi,
    AI_VIDEO_COMPUTE_BACKEND: computeBackend,
  };

  const gfxEnv = catalog.graphicsEnv?.[graphicsApi];
  if (gfxEnv) Object.assign(env, gfxEnv);

  const computeDef = getComputeBackendOptions().find((b) => b.id === computeBackend);
  if (computeDef?.env) Object.assign(env, computeDef.env);

  if (settings?.vulkanValidation === "vulkan-layers") {
    env.VK_INSTANCE_LAYERS = "VK_LAYER_KHRONOS_validation";
    env.VK_LOADER_DEBUG = "error";
  }
  if (settings?.vulkanValidation === "d3d-debug") {
    env.D3D12_DEBUG_LAYER = "1";
    env.AI_VIDEO_GRAPHICS_API = "directx12";
  }

  if (settings?.gpuDeviceIndex != null && settings.gpuDeviceIndex >= 0) {
    env.CUDA_VISIBLE_DEVICES = String(settings.gpuDeviceIndex);
    env.GGML_VK_VISIBLE_DEVICES = String(settings.gpuDeviceIndex);
  }

  return env;
}

export function buildGraphicsStackPayload(settings, stats = null) {
  const graphicsApi = resolveGraphicsApi(settings, stats);
  const computeBackend = resolveComputeBackend(settings, stats);
  const rec = recommendGraphicsStack(stats);
  return {
    graphicsApi,
    computeBackend,
    validation: settings?.vulkanValidation || "off",
    gpuDeviceIndex: settings?.gpuDeviceIndex ?? 0,
    recommended: rec,
    env: buildGraphicsApiEnv(settings, stats),
  };
}

export function formatGraphicsStackSummary(settings, stats = null) {
  const g = resolveGraphicsApi(settings, stats);
  const c = resolveComputeBackend(settings, stats);
  const val = settings?.vulkanValidation && settings.vulkanValidation !== "off" ? ` · ${settings.vulkanValidation}` : "";
  return `Graphics: ${g.toUpperCase()} · Compute: ${c.toUpperCase()}${val}`;
}

export function applyRecommendedGraphicsStack(settings, stats = null) {
  const rec = recommendGraphicsStack(stats);
  return {
    ...settings,
    graphicsApi: rec.graphicsApi,
    computeBackend: rec.computeBackend,
    vulkanValidation: settings.vulkanValidation || "off",
  };
}
