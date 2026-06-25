#!/usr/bin/env node
/**
 * Cross-platform Electron Playwright e2e (sets E2E_ELECTRON=1).
 */
const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const env = { ...process.env, E2E_ELECTRON: "1", E2E_FORCE_REBUILD: "1" };
delete env.ELECTRON_RUN_AS_NODE;
const buildEnv = { ...env, NEXT_PUBLIC_E2E_HOOKS: "1" };
const build = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
  cwd: root,
  env: buildEnv,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}
const args = ["playwright", "test", "tests/e2e/electron-multiclip-progress.spec.cjs"];
const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", args, {
  cwd: root,
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
