#!/usr/bin/env node
/**
 * Post-install / CLI addon installer — visible CMD progress, Python pip via requirements.txt.
 * Run with ELECTRON_RUN_AS_NODE=1 and packaged ai-video-tool.exe, or: node scripts/install-addons-runner.cjs
 */
const path = require("path");
const { forceInstallPipeline } = require("./lib/tool-installer.cjs");
const { createInstallReporter } = require("./lib/install-console.cjs");
const { defaultUserDataPath } = require("./lib/open-sora-paths.cjs");

const pkg = require("../package.json");

async function main() {
  const userDataPath = process.env.ADDON_USER_DATA || defaultUserDataPath();
  const reporter = createInstallReporter(userDataPath, {
    version: pkg.version,
    echoToConsole: true,
  });

  reporter.report({
    phase: "start",
    message: "AI Video Creator — installing all addons and tools (requirements.txt + managed venv)",
  });

  try {
    const pipeline = await forceInstallPipeline({
      userDataPath,
      pipViaPython: true,
      onProgress: (payload) => reporter.report(payload),
    });

    const ok = Boolean(pipeline.safe?.ok && pipeline.ok);
    reporter.finish({
      ok,
      message: pipeline.safe?.summary || (ok ? "All critical addons verified." : "Install finished with errors."),
    });
    process.exit(ok ? 0 : 1);
  } catch (e) {
    const message = e?.message || String(e);
    reporter.report({ phase: "error", message, ok: false });
    reporter.finish({ ok: false, message });
    process.exit(1);
  }
}

main();
