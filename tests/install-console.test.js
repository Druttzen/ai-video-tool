import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { createInstallReporter, isPhaseInfoMessage } from "../scripts/lib/install-console.cjs";

describe("install-console", () => {
  it("detects Phase N/4 progress lines", () => {
    expect(isPhaseInfoMessage("Phase 1/4 — scanning for required addons, tools, and apps…")).toBe(true);
    expect(isPhaseInfoMessage("INSTALL -> Python")).toBe(false);
  });

  it("createInstallReporter writes progress to log file", () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "install-console-"));
    const reporter = createInstallReporter(userData, { version: "1.0.16", echoToConsole: false });
    reporter.report({ phase: "audit-scan", message: "Phase 1/4 — scanning for required addons, tools, and apps…" });
    reporter.report({ phase: "addon-start", addonId: "python", label: "Python", forceReinstall: true });
    reporter.finish({ ok: true, message: "Done" });
    const logText = fs.readFileSync(reporter.logPath, "utf8");
    expect(logText).toMatch(/Started \(local\):/);
    expect(logText).toMatch(/Phase 1\/4/);
    expect(logText).toMatch(/Done/);
  });
});
