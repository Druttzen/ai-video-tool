#!/usr/bin/env node
/**
 * GPU end-to-end smoke — verify Wan/Diffusers stack and optionally render one minimal clip.
 *
 * Usage:
 *   node scripts/gpu-e2e-smoke.cjs              # scan only
 *   node scripts/gpu-e2e-smoke.cjs --render     # one minimal Wan clip (GPU_E2E_RENDER=1)
 */
const fs = require("fs");
const path = require("path");
const { scanSetupEnvironment } = require("./lib/environment-scan.cjs");
const { resolveUserDataPath } = require("./lib/open-sora-paths.cjs");
const { spawnDirectorPythonJob } = require("./lib/wan-render-exec.cjs");

const root = path.resolve(__dirname, "..");
const userDataPath = resolveUserDataPath(root);
const renderRequested = process.argv.includes("--render") || process.env.GPU_E2E_RENDER === "1";

async function main() {
  console.log("GPU E2E smoke — scanning environment…");
  const scan = await scanSetupEnvironment({
    userDataPath,
    directorSettings: { localRenderEngine: "diffusers-wan" },
  });

  const pip = scan.pipDeps || {};
  const wslWanReady = Boolean(scan.wsl?.wanReady);
  const wanReady = Boolean(
    pip.wanRenderReady || (scan.platform === "win32" && wslWanReady),
  );
  const python = scan.venv?.ok ? scan.venv.path : scan.python?.path;

  console.log(`  Python: ${python || "missing"}`);
  console.log(`  CUDA: ${pip.cudaOk ? "yes" : "no"}`);
  console.log(`  Diffusers: ${pip.diffusersOk ? "yes" : "no"}`);
  console.log(`  Wan ready: ${wanReady ? "yes" : "no"}${wslWanReady ? " (WSL)" : ""}`);

  if (!python || !wanReady) {
    console.error("\nGPU E2E smoke — SKIP (Wan/CUDA stack not ready). Fix in Setup Hub.");
    process.exit(renderRequested ? 1 : 0);
  }

  if (!renderRequested) {
    console.log("\nGPU E2E smoke — prerequisites OK. Re-run with --render for one minimal Wan clip.");
    process.exit(0);
  }

  const jobPath = path.join(root, ".userdata", "gpu-e2e-job.json");
  fs.mkdirSync(path.dirname(jobPath), { recursive: true });
  const job = {
    kind: "director_video_job",
    prompt: "GPU E2E smoke — neon alley, cinematic, short test clip",
    localRenderEngine: "diffusers-wan",
    pythonPath: python,
    numFrames: 17,
    fps: 16,
    numSteps: 8,
    seed: 42,
    aspectRatio: "16:9",
    resolutionTier: "256px",
  };
  fs.writeFileSync(jobPath, JSON.stringify(job, null, 2));

  const runner = path.join(root, "scripts", "run-director-job.py");
  console.log(`\nGPU E2E smoke — rendering minimal Wan clip (${job.numFrames} frames)…`);
  console.log(`  Job: ${jobPath}`);
  const launch = await spawnDirectorPythonJob({
    scan,
    python,
    runner,
    jobPath,
    cwd: root,
  });
  console.log(`  Via: ${launch.via}`);

  const staged = path.join(path.dirname(jobPath), `${path.basename(jobPath, ".json")}-output.mp4`);
  if (!fs.existsSync(staged)) {
    throw new Error(`Render finished without output video: ${staged}`);
  }
  console.log(`  Output: ${staged}`);
  console.log("\nGPU E2E smoke — render complete.");
}

main().catch((err) => {
  console.error("\nGPU E2E smoke — FAILED:", err?.message || err);
  process.exit(2);
});
