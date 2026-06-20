import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  getAddonsRoot,
  getManagedNodeDir,
  getManagedOpenSoraDir,
  getManagedRequirementsPath,
  getVenvPythonPath,
  getWslVenvPythonPath,
} from "../scripts/lib/addon-paths.cjs";

describe("addon-paths", () => {
  const userData = "C:\\Users\\test\\AppData\\Roaming\\AI Video Creator";

  it("layouts managed addon directories under userData/addons", () => {
    expect(getAddonsRoot(userData)).toBe(path.join(userData, "addons"));
    expect(getManagedOpenSoraDir(userData)).toBe(path.join(userData, "addons", "open-sora"));
    expect(getManagedNodeDir(userData, "20.18.0")).toContain("nodejs");
    expect(getManagedRequirementsPath(userData)).toBe(path.join(userData, "addons", "requirements.txt"));
    expect(getVenvPythonPath(userData)).toMatch(/python(\.exe)?$/);
    expect(getWslVenvPythonPath(userData)).toContain("wsl-venv");
  });

  it("bundled addon requirements template includes torch and gradio", () => {
    const template = path.join(process.cwd(), "data", "addon-requirements.txt");
    expect(fs.existsSync(template)).toBe(true);
    const text = fs.readFileSync(template, "utf8");
    expect(text).toMatch(/torch/);
    expect(text).toMatch(/gradio/);
  });
});
