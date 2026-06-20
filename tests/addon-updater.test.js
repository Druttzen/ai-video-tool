import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  compareSemver,
  checkAddonUpdates,
  loadAddonManifest,
  mergeRequirementLines,
  normalizeHostScan,
  readRequirementsLines,
  syncAddonRequirements,
} from "../scripts/lib/addon-updater.cjs";
import { getBundledRequirementsTemplatePath } from "../scripts/lib/addon-paths.cjs";
import { getInstallProtocol, scanMissingAddons } from "../scripts/lib/tool-installer.cjs";

describe("addon-updater", () => {
  it("compareSemver orders versions", () => {
    expect(compareSemver("3.10.0", "3.11.9")).toBeLessThan(0);
    expect(compareSemver("3.11.9", "3.11.9")).toBe(0);
    expect(compareSemver("3.12.0", "3.11.9")).toBeGreaterThan(0);
  });

  it("manifest declares managed addons with protocol and install order", () => {
    const manifest = loadAddonManifest();
    expect(manifest.forceManaged).toBe(true);
    expect(manifest.protocol?.forceVenvForPip).toBe(true);
    expect(manifest.installOrder[0]).toBe("git");
    expect(manifest.installOrder).toContain("nodejs");
    expect(manifest.installOrder).toContain("wsl");
    expect(manifest.installOrder).toContain("pip-deps");
  });

  it("checkAddonUpdates returns git, nodejs, and core addons", async () => {
    const report = await checkAddonUpdates({
      scan: { python: { ok: false }, ffmpeg: { ok: false }, openSora: { ok: false } },
      userDataPath: path.join(os.tmpdir(), "ai-video-addon-test-all"),
      openSoraPath: "",
    });
    expect(report.items.length).toBeGreaterThanOrEqual(9);
    expect(report.items.some((i) => i.id === "git")).toBe(true);
    expect(report.items.some((i) => i.id === "nodejs")).toBe(true);
    expect(report.items.some((i) => i.id === "python")).toBe(true);
  });

  it("normalizeHostScan unwraps Setup Hub UI scan shape", () => {
    const host = { python: { ok: true, version: "3.11.9" } };
    expect(normalizeHostScan({ raw: host, modules: {} })).toEqual(host);
  });

  it("mergeRequirementLines dedupes package names", () => {
    const merged = mergeRequirementLines(["torch>=2.1", "numpy"], ["torch>=2.2", "pillow"]);
    expect(merged).toEqual(["torch>=2.1", "numpy", "pillow"]);
  });

  it("syncAddonRequirements writes managed requirements.txt", () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "ai-video-req-"));
    const result = syncAddonRequirements(userData);
    expect(result.ok).toBe(true);
    const lines = readRequirementsLines(result.path);
    expect(lines.some((l) => l.startsWith("gradio"))).toBe(true);
    expect(lines.some((l) => l.startsWith("opensora"))).toBe(false);
    expect(fs.existsSync(getBundledRequirementsTemplatePath())).toBe(true);
  });

  it("ffmpeg manifest uses live BtbN latest release URL", () => {
    const manifest = loadAddonManifest();
    expect(manifest.addons.ffmpeg.builds.win32.url).toContain("/releases/download/latest/");
    expect(manifest.addons.ffmpeg.builds.linux.url).toContain("linux64");
  });
});

describe("tool-installer", () => {
  it("getInstallProtocol exposes forceVenvForPip and install order", () => {
    const protocol = getInstallProtocol();
    expect(protocol.forceVenvForPip).toBe(true);
    expect(protocol.scanBeforeInstall).toBe(true);
    expect(protocol.installOrder.length).toBeGreaterThanOrEqual(9);
  });

  it("scanMissingAddons reports missingCount", async () => {
    const report = await scanMissingAddons({
      userDataPath: path.join(os.tmpdir(), "ai-video-tool-scan-" + Date.now()),
    });
    expect(report).toHaveProperty("missingCount");
    expect(report).toHaveProperty("items");
    expect(report.summary).toMatch(/missing|All managed/i);
  });
});
