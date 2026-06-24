#!/usr/bin/env node
/**
 * Full GPU beat-sync produce — 4 Wan clips from handoff fixture + FFmpeg concat.
 *
 * Usage:
 *   node scripts/gpu-full-produce.cjs
 *   node scripts/gpu-full-produce.cjs --clips 2 --frames 25 --steps 12
 */
const fs = require("fs");
const path = require("path");
const { scanSetupEnvironment } = require("./lib/environment-scan.cjs");
const { resolveUserDataPath } = require("./lib/open-sora-paths.cjs");
const { spawnDirectorPythonJob } = require("./lib/wan-render-exec.cjs");

const root = path.resolve(__dirname, "..");
const userDataPath = resolveUserDataPath(root);
const fixturePath = path.join(root, "tests", "fixtures", "music-handoff-path-e.aivbundle.json");
const outDir = path.join(userDataPath, "gpu-full-produce");

function readArg(flag, fallback = "") {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function buildClipSegmentPrompt(basePrompt, clip, index, total) {
  const start = Number(clip?.start) || 0;
  const end = Number(clip?.end) || start + (Number(clip?.duration) || 4);
  const label = clip?.label ? ` ${clip.label}` : "";
  const header = `[MV segment ${index + 1}/${total} · ${start.toFixed(1)}s–${end.toFixed(1)}s${label} · cut on beat]`;
  const body = String(basePrompt || "").trim();
  return body ? `${header}\n${body}` : header;
}

async function main() {
  const maxClips = Math.max(1, Number(readArg("--clips", "4")) || 4);
  const numFrames = Math.max(17, Number(readArg("--frames", "33")) || 33);
  const numSteps = Math.max(8, Number(readArg("--steps", "16")) || 16);
  const fps = Math.max(8, Number(readArg("--fps", "16")) || 16);

  console.log("GPU full produce — scanning environment…");
  const scan = await scanSetupEnvironment({
    userDataPath,
    directorSettings: { localRenderEngine: "diffusers-wan" },
  });

  const pip = scan.pipDeps || {};
  const wslWanReady = Boolean(scan.wsl?.wanReady);
  const wanReady = Boolean(pip.wanRenderReady || (scan.platform === "win32" && wslWanReady));
  const python = scan.venv?.ok ? scan.venv.path : scan.python?.path;

  if (!python || !wanReady) {
    console.error("GPU full produce — SKIP (Wan/CUDA stack not ready).");
    process.exit(1);
  }

  console.log(`  Python: ${python}`);
  console.log(`  GPU: ${pip.gpuVendor?.primaryGpu?.name || "CUDA"}`);
  console.log(`  Clips: ${maxClips} · frames ${numFrames} · steps ${numSteps} · fps ${fps}`);

  const bundle = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const clipPlan = (bundle.handoff?.audioAnalysis?.beatSync?.clipPlan || []).slice(0, maxClips);
  if (!clipPlan.length) {
    console.error("Fixture has no beat-sync clip plan.");
    process.exit(1);
  }

  const basePrompt = bundle.project?.idea || "Neon music video";
  fs.mkdirSync(outDir, { recursive: true });
  const runner = path.join(root, "scripts", "run-diffusers-wan-job.py");
  const clipPaths = [];

  for (let i = 0; i < clipPlan.length; i += 1) {
    const clip = clipPlan[i];
    const jobPath = path.join(outDir, `clip-${i + 1}.json`);
    const job = {
      kind: "director_video_job",
      prompt: buildClipSegmentPrompt(basePrompt, clip, i, clipPlan.length),
      localRenderEngine: "diffusers-wan",
      pythonPath: python,
      numFrames,
      fps,
      numSteps,
      seed: 42 + i,
      aspectRatio: "16:9",
      resolutionTier: "256px",
      saveDir: path.join(outDir, `wan-clip-${i + 1}`),
    };
    fs.writeFileSync(jobPath, JSON.stringify(job, null, 2));
    console.log(`\n=== Clip ${i + 1}/${clipPlan.length}: ${clip.label || "segment"} ===`);
    await spawnDirectorPythonJob({
      scan,
      python,
      runner,
      jobPath,
      cwd: root,
    });

    const staged = path.join(outDir, `clip-${i + 1}-output.mp4`);
    if (!fs.existsSync(staged)) {
      console.error(`Expected output missing: ${staged}`);
      process.exit(2);
    }
    clipPaths.push(staged);
    console.log(`  ✓ ${staged}`);
  }

  const concatOnly = path.join(outDir, "music-video-concat.mp4");
  const { execLocal } = require("./lib/process-exec.cjs");
  const { getManagedAddonPaths } = require("./lib/addon-updater.cjs");
  const managed = getManagedAddonPaths(userDataPath);
  const ffmpeg = managed.ffmpegPath || "ffmpeg";
  const listPath = path.join(outDir, "clips.txt");
  fs.writeFileSync(
    listPath,
    clipPaths.map((p) => `file "${p.replace(/"/g, '\\"')}"`).join("\n"),
    "utf8",
  );
  await execLocal(
    ffmpeg,
    ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", concatOnly],
    { timeout: 600000 },
  );

  console.log(`\nGPU full produce — complete`);
  console.log(`  Clips: ${clipPaths.length}`);
  console.log(`  Output: ${concatOnly}`);
  fs.writeFileSync(
    path.join(outDir, "manifest.json"),
    JSON.stringify({ clipPaths, concatOnly, completedAt: new Date().toISOString() }, null, 2),
  );
}

main().catch((err) => {
  console.error("\nGPU full produce — FAILED:", err?.message || err);
  process.exit(2);
});
