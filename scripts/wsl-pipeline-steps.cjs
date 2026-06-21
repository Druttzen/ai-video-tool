#!/usr/bin/env node
const { execFileSync } = require("child_process");
const {
  getRepoRootWsl,
  getWslPyWsl,
  wslSourcePathsPrelude,
  wslTensornvmeEnvPrelude,
} = require("./lib/wsl-paths.cjs");

function wsl(cmd) {
  return execFileSync("wsl", ["bash", "-lc", cmd], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
}

const repoRoot = getRepoRootWsl();
const wslPy = getWslPyWsl();
const pathsPrelude = wslSourcePathsPrelude();
const step = process.argv[2] || "all";

try {
  if (step === "tensornvme" || step === "all") {
    console.log("=== tensornvme import ===");
    console.log(
      wsl(
        `${wslTensornvmeEnvPrelude()}; ${pathsPrelude}; source "$VENV_ACTIVATE"; python3 -c 'import tensornvme; print("tensornvme OK:", tensornvme.__file__)'`,
      ),
    );
  }

  if (step === "dist" || step === "all") {
    console.log("=== dist init test ===");
    console.log(
      wsl(
        `${pathsPrelude}; source "$VENV_ACTIVATE"; torchrun --nproc_per_node 1 --standalone ${repoRoot}/scripts/wsl-dist-probe.py`,
      ),
    );
    console.log("=== inference argv ===");
    console.log(
      wsl(
        `${pathsPrelude}; source "$VENV_ACTIVATE"; cd ${repoRoot}/scripts; python3 -c "from opensora_inference_support import opensora_inference_argv; print(opensora_inference_argv('${wslPy}', ['scripts/diffusion/inference.py', 'cfg.py']))"`,
      ),
    );
  }

  if (step === "smoke" || step === "all") {
    console.log("=== director smoke render ===");
    console.log(
      wsl(
        `${wslTensornvmeEnvPrelude()}; ${pathsPrelude}; cd ${repoRoot}; "$WSL_PY" scripts/run-director-job.py director-smoke-job.json`,
      ),
    );
  }
} catch (err) {
  if (err.stdout) process.stdout.write(err.stdout);
  if (err.stderr) process.stderr.write(err.stderr);
  process.exit(err.status || 1);
}
