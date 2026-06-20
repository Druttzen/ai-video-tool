import { describe, expect, it } from "vitest";
import {
  defaultOpenSoraPath,
  isPipelineFolder,
  scanSetupEnvironment,
} from "../scripts/lib/environment-scan.cjs";

describe("environment-scan CLI module", () => {
  it("defaultOpenSoraPath points at managed addons folder", () => {
    expect(defaultOpenSoraPath()).toMatch(/addons[\\/]open-sora$/);
  });

  it("isPipelineFolder rejects empty paths", () => {
    expect(isPipelineFolder("")).toBe(false);
    expect(isPipelineFolder("/nonexistent/path")).toBe(false);
  });

  it("scanSetupEnvironment returns structured scan", async () => {
    const scan = await scanSetupEnvironment({
      gatherGpu: async () => null,
    });
    expect(scan.scannedAt).toBeTruthy();
    expect(scan.python).toBeTruthy();
    expect(scan.pipeline).toBeTruthy();
  }, 30_000);
});
