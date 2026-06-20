import { describe, expect, it } from "vitest";
import {
  defaultOpenSoraPath,
  isPipelineFolder,
  scanSetupEnvironment,
} from "../scripts/lib/environment-scan.cjs";

describe("environment-scan CLI module", () => {
  it("defaultOpenSoraPath uses home folder on non-Windows", () => {
    if (process.platform === "win32") {
      expect(defaultOpenSoraPath()).toMatch(/Open-Sora/i);
    } else {
      expect(defaultOpenSoraPath()).toContain("Open-Sora");
    }
  });

  it("isPipelineFolder rejects empty paths", () => {
    expect(isPipelineFolder("")).toBe(false);
    expect(isPipelineFolder("/nonexistent/path")).toBe(false);
  });

  it("scanSetupEnvironment returns structured scan", async () => {
    const scan = await scanSetupEnvironment({});
    expect(scan.scannedAt).toBeTruthy();
    expect(scan.python).toBeTruthy();
    expect(scan.pipeline).toBeTruthy();
  });
});
