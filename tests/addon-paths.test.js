import os from "os";
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  countModelArtifacts,
  getAddonsRoot,
  getManagedNodeDir,
  getManagedOpenSoraDir,
  getManagedRequirementsPath,
  getVenvPythonPath,
  getWslVenvPythonPath,
  isModelArtifactName,
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

  it("bundled addon requirements template includes gradio (torch installed separately)", () => {
    const template = path.join(process.cwd(), "data", "addon-requirements.txt");
    expect(fs.existsSync(template)).toBe(true);
    const text = fs.readFileSync(template, "utf8");
    expect(text).toMatch(/gradio/);
    expect(text).not.toMatch(/^torch/m);
  });
});
