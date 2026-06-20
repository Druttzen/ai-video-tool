import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/** Scripts required for Setup Hub / tool installer in packaged Electron app. */
const SETUP_HUB_MAIN_SCRIPTS = [
  "scripts/lib/environment-scan.cjs",
  "scripts/lib/open-sora-paths.cjs",
  "scripts/lib/addon-paths.cjs",
  "scripts/lib/addon-platform.cjs",
  "scripts/lib/addon-updater.cjs",
  "scripts/lib/tool-installer.cjs",
  "scripts/tool-installer.cjs",
  "scripts/wsl-addon-bootstrap.sh",
];

const SETUP_HUB_DATA_FILES = [
  "data/addon-updates-manifest.json",
  "data/addon-requirements.txt",
  "data/addon-requirements-optional.txt",
  "data/setup-hub-manifest.json",
];

const STANDALONE_SETUP_HUB_FILES = [
  "setup-hub-main.js",
  "setup-hub-preload.js",
  "setup-hub/index.html",
  "setup-hub/renderer.js",
  "scripts/build-setup-hub-exe.cjs",
  "build/installer.nsh",
];

describe("electron packaging files", () => {
  it("includes every main-process script required at startup", () => {
    const root = path.join(import.meta.dirname, "..");
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const files = new Set(pkg.build?.files || []);
    const mainSrc = fs.readFileSync(path.join(root, "main.js"), "utf8");
    const requires = [...mainSrc.matchAll(/require\("\.\/([^"]+)"\)/g)].map((m) => m[1]);

    for (const rel of requires) {
      if (rel === "package.json") continue;
      expect(files.has(rel), `missing from build.files: ${rel}`).toBe(true);
    }
  });

  it("includes Setup Hub tool installer scripts and manifests", () => {
    const root = path.join(import.meta.dirname, "..");
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const files = new Set(pkg.build?.files || []);

    for (const rel of [...SETUP_HUB_MAIN_SCRIPTS, ...SETUP_HUB_DATA_FILES]) {
      expect(files.has(rel), `Setup Hub packaging missing: ${rel}`).toBe(true);
      expect(fs.existsSync(path.join(root, rel)), `repo file missing: ${rel}`).toBe(true);
    }
  });

  it("includes standalone Setup Hub exe bundling config", () => {
    const root = path.join(import.meta.dirname, "..");
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

    for (const rel of STANDALONE_SETUP_HUB_FILES) {
      expect(fs.existsSync(path.join(root, rel)), `repo file missing: ${rel}`).toBe(true);
    }

    const extraFiles = pkg.build?.extraFiles || [];
    expect(extraFiles.some((entry) => String(entry.from || entry).includes("setup-hub.exe"))).toBe(true);
    expect(pkg.build?.nsis?.include).toBe("build/installer.nsh");
    expect(pkg.build?.nsis?.runAfterFinish).toBe(false);
  });

  it("ships version 1.0.13 with Setup Hub manifest v2 and WSL script unpack", () => {
    const root = path.join(import.meta.dirname, "..");
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    expect(pkg.version).toBe("1.0.13");
    expect((pkg.build?.asarUnpack || []).some((entry) => entry.includes("wsl-addon-bootstrap"))).toBe(true);
    const hub = JSON.parse(fs.readFileSync(path.join(root, "data/setup-hub-manifest.json"), "utf8"));
    expect(hub.version).toBe("2.0.0");
    expect(hub.modules.some((m) => m.id === "git")).toBe(true);
  });
});
