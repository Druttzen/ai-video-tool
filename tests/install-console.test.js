import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { createInstallReporter } from "../scripts/lib/install-console.cjs";

describe("install-console", () => {
  it("createInstallReporter writes progress to log file", () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "install-console-"));
    const reporter = createInstallReporter(userData, { version: "1.0.16", echoToConsole: false });
    reporter.report({ phase: "addon-start", addonId: "python", label: "Python", forceReinstall: true });
    reporter.finish({ ok: true, message: "Done" });
    const logText = fs.readFileSync(reporter.logPath, "utf8");
    expect(logText).toMatch(/Started \(local\):/);
    expect(logText).toMatch(/INSTALL -> Python/);
    expect(logText).toMatch(/Done/);
  });
});
