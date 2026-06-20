import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("repo root layout", () => {
  const root = path.join(import.meta.dirname, "..");

  it("keeps only required Electron entry files at repo root", () => {
    const rootJs = fs.readdirSync(root).filter((name) => name.endsWith(".js") && !name.includes("config"));
    expect(rootJs.sort()).toEqual(["main.js", "preload.js"]);
  });

  it("does not ship deprecated standalone Setup Hub electron app at root", () => {
    expect(fs.existsSync(path.join(root, "setup-hub-main.js"))).toBe(false);
    expect(fs.existsSync(path.join(root, "setup-hub-preload.js"))).toBe(false);
    expect(fs.existsSync(path.join(root, "scripts", "build-setup-hub-exe.cjs"))).toBe(false);
  });

  it("moves dev launchers under scripts/", () => {
    expect(fs.existsSync(path.join(root, "scripts", "RUN.bat"))).toBe(true);
    expect(fs.existsSync(path.join(root, "scripts", "run_silent.vbs"))).toBe(true);
    const rootRun = fs.readFileSync(path.join(root, "RUN.bat"), "utf8");
    expect(rootRun).toMatch(/scripts\\RUN\.bat/);
  });
});
