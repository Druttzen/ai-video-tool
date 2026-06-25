import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("installer scope and hardware support", () => {
  it("offers per-user and per-machine install with elevation", () => {
    const root = path.join(import.meta.dirname, "..");
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const nsis = pkg.build?.nsis || {};

    expect(nsis.oneClick).toBe(false);
    expect(nsis.allowElevation).toBe(true);
    expect(nsis.perMachine).toBe(false);
    expect(nsis.selectPerMachineByDefault).toBe(true);
    expect(nsis.allowToChangeInstallationDirectory).toBe(true);
  });

  it("builds NSIS for x64 and arm64 Windows", () => {
    const root = path.join(import.meta.dirname, "..");
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const winTarget = pkg.build?.win?.target;
    const nsisTarget = Array.isArray(winTarget)
      ? winTarget.find((t) => t.target === "nsis")
      : winTarget === "nsis"
        ? { arch: ["x64"] }
        : null;

    expect(nsisTarget?.arch).toEqual(expect.arrayContaining(["x64", "arm64"]));
    expect(pkg.build?.win?.requestedExecutionLevel).toBe("asInvoker");
  });

  it("installer.nsh sets shell context for all-users shortcuts", () => {
    const root = path.join(import.meta.dirname, "..");
    const nsh = fs.readFileSync(path.join(root, "build/installer.nsh"), "utf8");
    expect(nsh).toMatch(/SetShellVarContext all/);
    expect(nsh).toMatch(/SetShellVarContext current/);
    expect(nsh).toMatch(/PROGRAMFILES64/);
  });
});
