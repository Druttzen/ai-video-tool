import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  formatLine,
  getLogPath,
  initProgressLog,
  progressFromPayload,
} from "../scripts/lib/setup-hub-console.cjs";

describe("setup-hub-console", () => {
  it("formatLine includes timestamp and level", () => {
    const line = formatLine("Hello", { level: "ok" });
    expect(line).toMatch(/\[ OK  \] Hello/);
  });

  it("initProgressLog writes header to userData log path", () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "setup-hub-log-"));
    const logPath = initProgressLog(userData, { version: "1.0.14" });
    expect(logPath).toBe(getLogPath(userData));
    const text = fs.readFileSync(logPath, "utf8");
    expect(text).toMatch(/Install Addons/);
    expect(text).toMatch(/1\.0\.14/);
  });

  it("progressFromPayload maps addon phases", () => {
    const start = progressFromPayload({ phase: "addon-start", addonId: "python", label: "Python", forceReinstall: true });
    expect(start).toMatch(/INSTALL -> Python/);
    const done = progressFromPayload({
      phase: "addon-done",
      item: { id: "python", ok: true, message: "Installed" },
    });
    expect(done).toMatch(/python: Installed/);
  });
});
