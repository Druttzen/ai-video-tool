import { describe, expect, it } from "vitest";
import {
  GPU_VENDOR_ENV,
  TORCH_CUDA_INDEX,
  TORCH_ROCM_INDEX,
  TORCH_XPU_INDEX,
  detectGpuVendor,
  getTorchPipInstallArgs,
  gpuVendorFromGpuName,
  normalizeGpuVendorInput,
  pickGpuVendorFromGpus,
  resolveGpuVendor,
} from "../scripts/lib/gpu-vendor.cjs";

describe("gpu-vendor", () => {
  it("normalizeGpuVendorInput accepts aliases", () => {
    expect(normalizeGpuVendorInput("auto")).toBe("auto");
    expect(normalizeGpuVendorInput("CUDA")).toBe("nvidia");
    expect(normalizeGpuVendorInput("radeon")).toBe("amd");
    expect(normalizeGpuVendorInput("arc")).toBe("intel");
    expect(normalizeGpuVendorInput("bogus")).toBeNull();
  });

  it("gpuVendorFromGpuName classifies adapter names", () => {
    expect(gpuVendorFromGpuName("NVIDIA GeForce RTX 4090")).toBe("nvidia");
    expect(gpuVendorFromGpuName("AMD Radeon RX 7900 XTX")).toBe("amd");
    expect(gpuVendorFromGpuName("Intel(R) Arc A770 Graphics")).toBe("intel");
    expect(gpuVendorFromGpuName("Microsoft Basic Display Adapter")).toBeNull();
  });

  it("pickGpuVendorFromGpus prefers discrete NVIDIA", () => {
    const vendor = pickGpuVendorFromGpus([
      { name: "Intel UHD Graphics 630", discrete: false, vramGb: 1 },
      { name: "NVIDIA GeForce RTX 3080", discrete: true, vramGb: 10 },
    ]);
    expect(vendor).toBe("nvidia");
  });

  it("getTorchPipInstallArgs maps vendors to pip indexes", () => {
    expect(getTorchPipInstallArgs("nvidia", "win32").pipArgs).toContain(TORCH_CUDA_INDEX);
    expect(getTorchPipInstallArgs("amd", "linux").pipArgs).toContain(TORCH_ROCM_INDEX);
    expect(getTorchPipInstallArgs("amd", "win32").pipArgs).not.toContain(TORCH_ROCM_INDEX);
    expect(getTorchPipInstallArgs("intel", "linux").pipArgs).toContain(TORCH_XPU_INDEX);
    expect(getTorchPipInstallArgs("cpu", "win32").pipArgs).toEqual([
      "install",
      "torch",
      "torchvision",
      "torchaudio",
    ]);
  });

  it("resolveGpuVendor honors env override without detection", async () => {
    const vendor = await resolveGpuVendor({
      env: { [GPU_VENDOR_ENV]: "amd" },
      detect: async () => "nvidia",
    });
    expect(vendor).toBe("amd");
  });

  it("resolveGpuVendor auto-detects via injectable probe", async () => {
    const vendor = await resolveGpuVendor({
      env: { [GPU_VENDOR_ENV]: "auto" },
      detect: async () => "intel",
    });
    expect(vendor).toBe("intel");
  });

  it("detectGpuVendor uses nvidia-smi when available", async () => {
    const vendor = await detectGpuVendor({
      platform: "linux",
      execFile: async (cmd) => {
        if (cmd === "nvidia-smi") return { stdout: "GPU\n" };
        throw new Error("skip");
      },
    });
    expect(vendor).toBe("nvidia");
  });

  it("detectGpuVendor falls back to Windows adapter names", async () => {
    const vendor = await detectGpuVendor({
      platform: "win32",
      execFile: async (cmd, args) => {
        if (cmd === "nvidia-smi") throw new Error("no nvidia");
        if (cmd === "powershell.exe") {
          return {
            stdout: JSON.stringify([{ Name: "AMD Radeon RX 6800", AdapterRAM: 0 }]),
          };
        }
        throw new Error(`unexpected ${cmd} ${args?.join(" ")}`);
      },
    });
    expect(vendor).toBe("amd");
  });
});
