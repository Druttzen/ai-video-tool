import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { resolveBundledScript } from "../scripts/lib/install-console.cjs";

describe("install-addons packaging", () => {
  const root = path.join(import.meta.dirname, "..");

  it("resolveBundledScript finds pip script at repo root", () => {
    const resolved = resolveBundledScript("scripts/install-addons-pip.py");
    expect(resolved).toBe(path.join(root, "scripts", "install-addons-pip.py"));
    expect(fs.existsSync(resolved)).toBe(true);
  });

  it("install-addons.cmd targets app.asar runner not broken unpacked copy", () => {
    const cmd = fs.readFileSync(path.join(root, "scripts/install-addons.cmd"), "utf8");
    expect(cmd).toContain("resources\\app.asar\\scripts\\install-addons-runner.cjs");
    expect(cmd).not.toContain("app.asar.unpacked\\scripts\\install-addons-runner");
  });
});
