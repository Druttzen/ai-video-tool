import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const root = path.join(import.meta.dirname, "..");

describe("main process modules", () => {
  it("exports bootstrap, state, and runtime IPC setup hooks", () => {
    const { bootstrap } = require("../scripts/lib/main-process/bootstrap.cjs");
    const { state, setAppRoot } = require("../scripts/lib/main-process/state.cjs");
    const runtime = require("../scripts/lib/main-process/app-runtime.cjs");

    expect(typeof bootstrap).toBe("function");
    expect(typeof setAppRoot).toBe("function");
    expect(state.mainWindow).toBeNull();
    expect(state.activeBuilds).toBeInstanceOf(Map);
    expect(typeof runtime.setupAppIpc).toBe("function");
    expect(typeof runtime.createWindow).toBe("function");
    expect(typeof runtime.extractBundlePathFromArgv).toBe("function");
  });

  it("keeps main.js as a thin bootstrap entry", () => {
    const src = fs.readFileSync(path.join(root, "main.js"), "utf8");
    expect(src).toMatch(/main-process\/bootstrap\.cjs/);
    expect(src.trim().split(/\r?\n/).length).toBeLessThanOrEqual(4);
  });
});
