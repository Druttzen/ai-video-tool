/**
 * GPU vendor selection for managed PyTorch installs (NVIDIA / AMD / Intel Arc).
 * Env: AI_VIDEO_GPU_VENDOR=nvidia|amd|intel|cpu|auto (default auto).
 */
const { execLocal } = require("./process-exec.cjs");

const GPU_VENDOR_ENV = "AI_VIDEO_GPU_VENDOR";
const VALID_VENDORS = new Set(["nvidia", "amd", "intel", "cpu", "auto"]);

const TORCH_CUDA_INDEX = "https://download.pytorch.org/whl/cu121";
const TORCH_ROCM_INDEX = "https://download.pytorch.org/whl/rocm6.2";
const TORCH_XPU_INDEX = "https://download.pytorch.org/whl/xpu";

function normalizeGpuVendorInput(value) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!raw || raw === "auto") return "auto";
  if (raw === "nvidia" || raw === "nvidia_gpu" || raw === "cuda") return "nvidia";
  if (raw === "amd" || raw === "radeon" || raw === "rocm") return "amd";
  if (raw === "intel" || raw === "arc" || raw === "xpu" || raw === "oneapi") return "intel";
  if (raw === "cpu" || raw === "none") return "cpu";
  return null;
}

function gpuVendorFromGpuName(name = "") {
  const n = String(name).toLowerCase();
  if (/nvidia|geforce|rtx|gtx|quadro/.test(n)) return "nvidia";
  if (/amd|radeon|rx /.test(n)) return "amd";
  if (/intel|arc |iris/.test(n)) return "intel";
  return null;
}

function pickGpuVendorFromGpus(gpus = []) {
  const scored = (gpus || [])
    .map((gpu) => {
      const vendor = gpuVendorFromGpuName(gpu?.name || "");
      if (!vendor) return null;
      const discrete = gpu.discrete === true ? 1 : 0;
      const vram = Number(gpu.vramGb) || 0;
      const priority = vendor === "nvidia" ? 3 : vendor === "amd" ? 2 : 1;
      return { vendor, score: priority * 1000 + discrete * 100 + vram };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.vendor || "cpu";
}

async function probeNvidiaSmi(execFile = execLocal) {
  try {
    await execFile("nvidia-smi", ["--query-gpu=name", "--format=csv,noheader"], { timeout: 6000 });
    return true;
  } catch {
    return false;
  }
}

async function probeRocmSmi(execFile = execLocal) {
  try {
    await execFile("rocm-smi", ["--showproductname"], { timeout: 6000 });
    return true;
  } catch {
    return false;
  }
}

async function queryWindowsGpus(execFile = execLocal) {
  const ps = [
    "Get-CimInstance Win32_VideoController",
    "| Select-Object Name, AdapterRAM",
    "| ConvertTo-Json -Compress",
  ].join(" ");
  try {
    const { stdout } = await execFile(
      "powershell.exe",
      ["-NoProfile", "-Command", ps],
      { timeout: 12000, maxBuffer: 1024 * 1024 },
    );
    const parsed = JSON.parse(String(stdout || "").trim() || "[]");
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows
      .filter((r) => r?.Name)
      .map((r) => {
        const name = String(r.Name);
        const discrete =
          /nvidia|geforce|rtx|gtx|radeon|rx |arc |quadro/i.test(name) &&
          !/microsoft basic|remote|virtual/i.test(name);
        return { name, discrete, vramGb: null };
      });
  } catch {
    return [];
  }
}

async function queryLinuxGpusLspci(execFile = execLocal) {
  try {
    const { stdout } = await execFile("lspci", [], { timeout: 6000 });
    const lines = String(stdout || "")
      .split("\n")
      .filter((line) => /VGA|3D|Display/i.test(line));
    return lines.map((line) => {
      const name = line.replace(/^[^:]+:\s*/, "").trim();
      const discrete = /nvidia|amd|radeon|arc /i.test(name);
      return { name, discrete, vramGb: null };
    });
  } catch {
    return [];
  }
}

/**
 * @param {object} [options]
 * @param {typeof execLocal} [options.execFile]
 * @param {NodeJS.Platform} [options.platform]
 */
async function detectGpuVendor({ execFile = execLocal, platform = process.platform } = {}) {
  if (await probeNvidiaSmi(execFile)) return "nvidia";

  if (platform === "win32") {
    const gpus = await queryWindowsGpus(execFile);
    const vendor = pickGpuVendorFromGpus(gpus);
    return vendor === "cpu" ? "cpu" : vendor;
  }

  if (platform === "linux") {
    if (await probeRocmSmi(execFile)) return "amd";
    const gpus = await queryLinuxGpusLspci(execFile);
    const vendor = pickGpuVendorFromGpus(gpus);
    return vendor === "cpu" ? "cpu" : vendor;
  }

  return "cpu";
}

/**
 * @param {object} [options]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {typeof detectGpuVendor} [options.detect]
 * @param {NodeJS.Platform} [options.platform]
 */
async function resolveGpuVendor({
  env = process.env,
  detect = detectGpuVendor,
  platform = process.platform,
} = {}) {
  const configured = normalizeGpuVendorInput(env[GPU_VENDOR_ENV]);
  if (configured && configured !== "auto") return configured;
  return detect({ platform });
}

function platformKey(platform = process.platform, { wsl = false } = {}) {
  if (wsl) return "wsl";
  if (platform === "win32") return "win32";
  return "linux";
}

/**
 * @param {string} vendor
 * @param {NodeJS.Platform} [platform]
 * @param {{ wsl?: boolean }} [options]
 * @returns {{ pipArgs: string[], label: string, fallbackDefault: boolean, note?: string }}
 */
function getTorchPipInstallArgs(vendor, platform = process.platform, { wsl = false } = {}) {
  const key = platformKey(platform, { wsl });
  const base = ["install", "torch", "torchvision", "torchaudio"];

  if (vendor === "nvidia") {
    return {
      pipArgs: [...base, "--index-url", TORCH_CUDA_INDEX],
      label: "torch (CUDA cu121 index)",
      fallbackDefault: true,
    };
  }

  if (vendor === "amd") {
    if (key === "win32") {
      return {
        pipArgs: base,
        label: "torch (CPU — AMD ROCm needs WSL/Linux)",
        fallbackDefault: false,
        note: "Native Windows PyTorch has no ROCm wheels; use WSL2 + AI_VIDEO_GPU_VENDOR=amd for GPU render.",
      };
    }
    return {
      pipArgs: [...base, "--index-url", TORCH_ROCM_INDEX],
      label: "torch (ROCm 6.2 index)",
      fallbackDefault: true,
    };
  }

  if (vendor === "intel") {
    if (key === "win32") {
      return {
        pipArgs: [...base, "--index-url", TORCH_XPU_INDEX],
        label: "torch (Intel XPU index)",
        fallbackDefault: true,
        note: "Intel Arc on Windows may need Intel GPU drivers; fallback to CPU PyPI if XPU wheels fail.",
      };
    }
    return {
      pipArgs: [...base, "--index-url", TORCH_XPU_INDEX],
      label: "torch (Intel XPU index)",
      fallbackDefault: true,
    };
  }

  return {
    pipArgs: base,
    label: "torch (CPU / default PyPI)",
    fallbackDefault: false,
  };
}

module.exports = {
  GPU_VENDOR_ENV,
  TORCH_CUDA_INDEX,
  TORCH_ROCM_INDEX,
  TORCH_XPU_INDEX,
  VALID_VENDORS,
  detectGpuVendor,
  getTorchPipInstallArgs,
  gpuVendorFromGpuName,
  normalizeGpuVendorInput,
  pickGpuVendorFromGpus,
  resolveGpuVendor,
};
