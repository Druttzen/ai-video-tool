#!/usr/bin/env node
/**
 * CLI smoke test — mirrors Setup Hub environment scan (no Electron required).
 *
 * Usage:
 *   node scripts/smoke-desktop-setup.cjs
 *   node scripts/smoke-desktop-setup.cjs --json
 *   OPEN_SORA_ROOT=~/Open-Sora node scripts/smoke-desktop-setup.cjs --pipeline ~/Open-Sora
 */
const path = require("path");
const { scanSetupEnvironment, defaultOpenSoraPath } = require("./lib/environment-scan.cjs");
const { defaultUserDataPath } = require("./lib/open-sora-paths.cjs");

function readArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return "";
  return process.argv[idx + 1] || "";
}

async function main() {
  const pipeline = readArg("--pipeline") || readArg("--open-sora");
  const python = readArg("--python");
  const jsonOut = process.argv.includes("--json");

  const userDataPath = defaultUserDataPath();
  const scan = await scanSetupEnvironment({
    userDataPath,
    directorSettings: {
      localPipelinePath: pipeline,
      localPythonPath: python,
    },
    openSoraInstallPath: pipeline || process.env.OPEN_SORA_ROOT || "",
  });

  const localRenderReady = scan.python?.ok && scan.pipeline?.ok;
  const report = {
    ok: localRenderReady,
    localRenderReady,
    label: localRenderReady
      ? "Local MP4 path ready"
      : "Missing Python and/or pipeline — export studio still works",
    scan,
  };

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("AI Video Creator — desktop setup smoke");
    console.log(`Platform: ${scan.platform}`);
    console.log(`Python: ${scan.python?.ok ? `OK (${scan.python.path})` : scan.python?.error}`);
    console.log(`Pipeline: ${scan.pipeline?.ok ? `OK (${scan.pipeline.path})` : scan.pipeline?.error}`);
    console.log(`Open-Sora: ${scan.openSora?.ok ? `OK (${scan.openSora.path})` : scan.openSora?.error}`);
    console.log(`Default probe path: ${defaultOpenSoraPath()}`);
    console.log(`FFmpeg: ${scan.ffmpeg?.ok ? `OK (${scan.ffmpeg.path})` : "optional — not found"}`);
    console.log(`GPU: ${scan.gpu?.primaryGpu?.name || "not scanned in CLI mode"}`);
    console.log("");
    console.log(report.label);
  }

  process.exit(localRenderReady ? 0 : 1);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(2);
});
