import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  buildBundledScriptCandidates,
  resolveBundledScript,
} from "../scripts/lib/install-console.cjs";

describe("install-addons packaging", () => {
  const root = path.join(import.meta.dirname, "..");

  it("resolveBundledScript finds pip script at repo root", () => {
    const resolved = resolveBundledScript("scripts/install-addons-pip.py");
    expect(resolved).toBe(path.join(root, "scripts", "install-addons-pip.py"));
    expect(fs.existsSync(resolved)).toBe(true);
  });

  it("prefers app.asar.unpacked for Python scripts when both roots exist", () => {
    const packed = path.join(root, "tests", "fixtures", "asar-pack", "resources", "app.asar");
    const unpacked = `${packed}.unpacked`;
    const rel = "scripts/install-addons-pip.py";
    const unpackedScript = path.join(unpacked, rel);
    fs.mkdirSync(path.dirname(unpackedScript), { recursive: true });
    fs.writeFileSync(unpackedScript, "# fixture\n", "utf8");

    try {
      const candidates = buildBundledScriptCandidates(rel, {
        roots: [{ packed, unpacked }],
        cwd: root,
      });
      expect(candidates[0]).toBe(unpackedScript);
    } finally {
      fs.rmSync(path.join(root, "tests", "fixtures", "asar-pack"), { recursive: true, force: true });
    }
  });

  it("keeps app.asar first for Node runner scripts", () => {
    const packed = path.join(root, "tests", "fixtures", "asar-pack", "resources", "app.asar");
    const unpacked = `${packed}.unpacked`;
    const rel = "scripts/install-addons-runner.cjs";
    const candidates = buildBundledScriptCandidates(rel, {
      roots: [{ packed, unpacked }],
      cwd: root,
    });
    expect(candidates[0]).toBe(path.join(packed, rel));
    expect(candidates[1]).toBe(path.join(unpacked, rel));
  });

  it("install-addons.cmd targets app.asar runner not broken unpacked copy", () => {
    const cmd = fs.readFileSync(path.join(root, "scripts/install-addons.cmd"), "utf8");
    expect(cmd).toContain("resources\\app.asar\\scripts\\install-addons-runner.cjs");
    expect(cmd).not.toContain("app.asar.unpacked\\scripts\\install-addons-runner");
  });
});
