import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.join(process.cwd());
const LICENSE_PATH = path.join(ROOT, "build", "LICENSE.txt");

describe("generate-installer-license", () => {
  it("writes AI Video Creator license text for NSIS", () => {
    execSync("node scripts/generate-installer-license.cjs", { cwd: ROOT, stdio: "pipe" });
    const text = fs.readFileSync(LICENSE_PATH, "utf8");
    expect(text).toMatch(/^AI VIDEO CREATOR v[\d.]+/);
    expect(text).not.toContain("AI MUSIC CREATOR");
    expect(text).not.toContain("Prompt Control Room");
    expect(text).not.toContain("FEEL THE BASS");
    expect(text).toContain("Video Prompt Studio");
    expect(text).toContain("Director Engine");
    expect(text).toContain("FRAME THE SCENE.");
  });
});
