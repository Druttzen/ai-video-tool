#!/usr/bin/env node
/**
 * Validate local MP4 render prerequisites and optionally dry-run Director job JSON.
 *
 * Usage:
 *   node scripts/smoke-local-mp4.cjs --check-only
 *   node scripts/smoke-local-mp4.cjs --pipeline E:\Open-Sora --python python
 *   node scripts/smoke-local-mp4.cjs --pipeline ~/Open-Sora --write-job /tmp/director-smoke.json
 */
const fs = require("fs");
const path = require("path");
const { scanSetupEnvironment, isPipelineFolder } = require("./lib/environment-scan.cjs");
const { resolveUserDataPath } = require("./lib/open-sora-paths.cjs");

function readArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return "";
  return process.argv[idx + 1] || "";
}

async function main() {
  const pipeline = readArg("--pipeline") || readArg("--open-sora") || process.env.OPEN_SORA_ROOT || "";
  const pythonPath = readArg("--python") || "python";
  const writeJob = readArg("--write-job");
  const checkOnly = process.argv.includes("--check-only") || !writeJob;

  const userDataPath = resolveUserDataPath(path.join(__dirname, ".."));
  const scan = await scanSetupEnvironment({
    userDataPath,
    directorSettings: { localPipelinePath: pipeline, localPythonPath: pythonPath },
    openSoraInstallPath: pipeline,
  });

  const runner = path.join(__dirname, "run-director-job.py");
  const errors = [];

  if (!scan.python?.ok) errors.push(`Python: ${scan.python?.error || "missing"}`);
  if (!scan.pipeline?.ok) errors.push(`Pipeline: ${scan.pipeline?.error || "missing"}`);
  if (!fs.existsSync(runner)) errors.push(`Runner missing: ${runner}`);

  const pipelineRoot = scan.pipeline?.path || pipeline;
  if (pipelineRoot && !isPipelineFolder(pipelineRoot)) {
    errors.push(`Pipeline folder invalid: ${pipelineRoot}`);
  }

  if (errors.length) {
    console.error("Local MP4 smoke — FAILED");
    errors.forEach((line) => console.error(`  • ${line}`));
    process.exit(1);
  }

  console.log("Local MP4 smoke — prerequisites OK");
  console.log(`  Python: ${scan.python.path}`);
  console.log(`  Pipeline: ${scan.pipeline.path}`);
  console.log(`  Runner: ${runner}`);

  if (checkOnly && !writeJob) {
    console.log("Use --write-job <path.json> to emit a minimal Director job for manual render.");
    process.exit(0);
  }

  const job = {
    prompt: "Smoke test — neon alley courier at night, cinematic 10s clip",
    localPipelinePath: scan.pipeline.path,
    pythonPath: scan.python.path,
    renderBackend: "local-python",
    durationSeconds: 5,
    resolutionTier: "256px",
    estimatedBuildSeconds: 120,
    output: { container: "mp4" },
  };

  const outPath = writeJob || path.join(process.cwd(), "director-smoke-job.json");
  fs.writeFileSync(outPath, JSON.stringify(job, null, 2));
  console.log(`Wrote job JSON: ${outPath}`);
  console.log(`Run: "${scan.python.path}" "${runner}" "${outPath}"`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(2);
});
