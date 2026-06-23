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
  "scripts/lib/setup-install-progress-bridge.cjs",
  "scripts/lib/setup-hub-console.cjs",
  "scripts/lib/install-console.cjs",
  "scripts/tool-installer.cjs",
  "scripts/install-addons-runner.cjs",
  "scripts/install-addons-pip.py",
  "scripts/wsl-addon-bootstrap.sh",
];

const PACKAGED_PYTHON_SCRIPTS = [
  "scripts/run-director-job.py",
  "scripts/run-open-sora-job.py",
  "scripts/run-music-video-sync.py",
  "scripts/opensora_inference_support.py",
  "scripts/install-addons-pip.py",
];

const OPENSORA_STUB_FILES = [
  "scripts/opensora-stub-paths/flash_attn/flash_attn/__init__.py",
  "scripts/opensora-stub-paths/flash_attn/flash_attn/flash_attn_interface.py",
  "scripts/opensora-stub-paths/tensornvme/tensornvme/__init__.py",
  "scripts/opensora-stub-paths/tensornvme/tensornvme/async_file_io.py",
];

const SETUP_HUB_DATA_FILES = [
  "data/addon-updates-manifest.json",
  "data/addon-requirements.txt",
  "data/addon-requirements-optional.txt",
  "data/setup-hub-manifest.json",
];

const INSTALL_ADDONS_FILES = [
  "scripts/install-addons.cmd",
  "scripts/install-addons-runner.cjs",
  "scripts/install-addons-pip.py",
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

  it("includes Director render and music-video Python helpers in packaged files", () => {
    const root = path.join(import.meta.dirname, "..");
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const files = pkg.build?.files || [];

    for (const rel of PACKAGED_PYTHON_SCRIPTS) {
      expect(files.includes(rel), `packaging missing: ${rel}`).toBe(true);
      expect(fs.existsSync(path.join(root, rel)), `repo file missing: ${rel}`).toBe(true);
    }
    expect(files.some((entry) => String(entry).includes("opensora-stub-paths"))).toBe(true);
    for (const rel of OPENSORA_STUB_FILES) {
      expect(fs.existsSync(path.join(root, rel)), `repo file missing: ${rel}`).toBe(true);
    }
  });

  it("bundles install-addons.cmd instead of standalone setup-hub.exe", () => {
    const root = path.join(import.meta.dirname, "..");
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

    for (const rel of INSTALL_ADDONS_FILES) {
      expect(fs.existsSync(path.join(root, rel)), `repo file missing: ${rel}`).toBe(true);
    }

    const extraFiles = pkg.build?.extraFiles || [];
    expect(extraFiles.some((entry) => String(entry.to || entry.from || entry).includes("install-addons.cmd"))).toBe(
      true,
    );
    expect(extraFiles.some((entry) => String(entry.from || entry).includes("setup-hub.exe"))).toBe(false);
    expect(pkg.build?.nsis?.include).toBe("build/installer.nsh");
    expect(pkg.build?.nsis?.runAfterFinish).toBe(false);

    const nsh = fs.readFileSync(path.join(root, "build/installer.nsh"), "utf8");
    expect(nsh).toMatch(/install-addons\.cmd/);
    expect(nsh).not.toMatch(/setup-hub\.exe/);
  });

  it("unpacks pip install script for Python CMD subprocess", () => {
    const root = path.join(import.meta.dirname, "..");
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const unpack = pkg.build?.asarUnpack || [];
    expect(unpack.some((entry) => entry.includes("install-addons-pip.py"))).toBe(true);
    expect(unpack.some((entry) => entry.includes("install-addons-runner.cjs"))).toBe(false);

    const cmd = fs.readFileSync(path.join(root, "scripts/install-addons.cmd"), "utf8");
    expect(cmd).toMatch(/app\.asar\\scripts\\install-addons-runner\.cjs/);
    expect(cmd).not.toMatch(/app\.asar\.unpacked\\scripts\\install-addons-runner/);
  });

  it("release workflow does not build setup-hub exe", () => {
    const root = path.join(import.meta.dirname, "..");
    const releaseYml = fs.readFileSync(path.join(root, ".github/workflows/release.yml"), "utf8");
    expect(releaseYml).not.toMatch(/build:setup-hub-exe/);
    expect(releaseYml).toMatch(/prepare:electron-dist/);
  });

  it("ships current version with Setup Hub manifest v2 and WSL script unpack", () => {
    const root = path.join(import.meta.dirname, "..");
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    expect(pkg.version).toBe("1.0.28");
    expect((pkg.build?.asarUnpack || []).some((entry) => entry.includes("wsl-addon-bootstrap"))).toBe(true);
    const hub = JSON.parse(fs.readFileSync(path.join(root, "data/setup-hub-manifest.json"), "utf8"));
    expect(hub.version).toBe("2.0.0");
    expect(hub.modules.some((m) => m.id === "git")).toBe(true);
  });
});
