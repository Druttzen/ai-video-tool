import os from "os";
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  countModelArtifacts,
  countModelWeightFiles,
  ensureModelsCkptsLink,
  getAddonsRoot,
  getManagedNodeDir,
  getManagedOpenSoraDir,
  getManagedRequirementsPath,
  getOpenSoraCkptsDir,
  getVenvPythonPath,
  getWslVenvPythonPath,
  isModelArtifactName,
  isModelWeightFile,
  resolveModelWeightsStatus,
} from "../scripts/lib/addon-paths.cjs";

describe("addon-paths", () => {
  const userData = "C:\\Users\\test\\AppData\\Roaming\\AI Video Creator";

  it("layouts managed addon directories under userData/addons", () => {
    expect(getAddonsRoot(userData)).toBe(path.join(userData, "addons"));
    expect(getManagedOpenSoraDir(userData)).toBe(path.join(userData, "addons", "open-sora"));
    expect(getManagedNodeDir(userData, "20.18.0")).toContain("nodejs");
    expect(getManagedRequirementsPath(userData)).toBe(path.join(userData, "addons", "requirements.txt"));
    expect(getWslVenvPythonPath(userData)).toContain("wsl-venv");
  });

  it("getVenvPythonPath is platform-aware", () => {
    const venvPy = getVenvPythonPath(userData);
    if (process.platform === "win32") {
      expect(venvPy).toMatch(/Scripts[\\/]python\.exe$/i);
    } else {
      expect(venvPy).toMatch(/bin[\\/]python3$/);
    }
  });

  it("isModelArtifactName excludes readme placeholders", () => {
    expect(isModelArtifactName("README.txt")).toBe(false);
    expect(isModelArtifactName("README.md")).toBe(false);
    expect(isModelArtifactName("model.safetensors")).toBe(true);
  });

  it("countModelArtifacts ignores readme files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-video-models-"));
    fs.writeFileSync(path.join(dir, "README.txt"), "placeholder", "utf8");
    fs.writeFileSync(path.join(dir, "weights.bin"), "x", "utf8");
    expect(countModelArtifacts(dir)).toBe(1);
  });

  it("countModelWeightFiles finds nested safetensors in open-sora ckpts layout", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-video-ckpts-"));
    const nested = path.join(root, "google", "t5-v1_1-xxl");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(root, "Open_Sora_v2.safetensors"), "x", "utf8");
    fs.writeFileSync(path.join(root, "hunyuan_vae.safetensors"), "x", "utf8");
    fs.writeFileSync(path.join(nested, "model.safetensors"), "x", "utf8");
    expect(countModelWeightFiles(root)).toBe(3);
    expect(isModelWeightFile("weights.ckpt")).toBe(true);
    expect(isModelWeightFile("README.txt")).toBe(false);
  });

  it("resolveModelWeightsStatus prefers open-sora ckpts over empty models folder", () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "ai-video-weights-"));
    const ckpts = getOpenSoraCkptsDir(userData);
    fs.mkdirSync(ckpts, { recursive: true });
    fs.writeFileSync(path.join(ckpts, "Open_Sora_v2.safetensors"), "x", "utf8");
    const status = resolveModelWeightsStatus(userData);
    expect(status.hasWeights).toBe(true);
    expect(status.weightCount).toBe(1);
    expect(status.source).toBe("open-sora-ckpts");
    expect(status.ckptsPath).toBe(ckpts);
  });

  it("ensureModelsCkptsLink creates junction from models/ckpts to open-sora/ckpts", () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "ai-video-link-"));
    const result = ensureModelsCkptsLink(userData);
    expect(result.ok).toBe(true);
    expect(result.linked).toBe(true);
    const ckpts = getOpenSoraCkptsDir(userData);
    const viaModels = path.join(userData, "addons", "models", "ckpts");
    fs.writeFileSync(path.join(ckpts, "probe.safetensors"), "x", "utf8");
    expect(fs.existsSync(path.join(viaModels, "probe.safetensors"))).toBe(true);
    const status = resolveModelWeightsStatus(userData);
    expect(status.hasWeights).toBe(true);
  });

  it("bundled addon requirements template includes gradio (torch installed separately)", () => {
    const template = path.join(process.cwd(), "data", "addon-requirements.txt");
    expect(fs.existsSync(template)).toBe(true);
    const text = fs.readFileSync(template, "utf8");
    expect(text).toMatch(/gradio/);
    expect(text).not.toMatch(/^torch/m);
  });
});
