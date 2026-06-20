#!/usr/bin/env node
const { execFileSync } = require("child_process");

function wsl(cmd) {
  return execFileSync("wsl", ["bash", "-lc", cmd], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
}

const venv = "/mnt/c/Users/micke/AppData/Roaming/AI Video Creator/addons/wsl-venv/bin/activate";
const step = process.argv[2] || "all";

try {
  if (step === "tensornvme" || step === "all") {
    console.log("=== tensornvme import ===");
    console.log(
      wsl(
        `export LD_LIBRARY_PATH="\${HOME}/.tensornvme/lib:\${LD_LIBRARY_PATH:-}"; . '${venv}'; python3 -c 'import tensornvme; print("tensornvme OK:", tensornvme.__file__)'`,
      ),
    );
  }

  if (step === "dist" || step === "all") {
    console.log("=== dist init test ===");
    console.log(
      wsl(
        `. '${venv}'; torchrun --nproc_per_node 1 --standalone /mnt/f/ai-video-tool/scripts/wsl-dist-probe.py`,
      ),
    );
    console.log("=== inference argv ===");
    console.log(
      wsl(
        `. '${venv}'; cd /mnt/f/ai-video-tool/scripts; python3 -c "from opensora_inference_support import opensora_inference_argv; print(opensora_inference_argv('/mnt/c/Users/micke/AppData/Roaming/AI Video Creator/addons/wsl-venv/bin/python3', ['scripts/diffusion/inference.py', 'cfg.py']))"`,
      ),
    );
  }

  if (step === "smoke" || step === "all") {
    console.log("=== director smoke render ===");
    console.log(
      wsl(
        `export LD_LIBRARY_PATH="\${HOME}/.tensornvme/lib:\${LD_LIBRARY_PATH:-}"; cd /mnt/f/ai-video-tool; '/mnt/c/Users/micke/AppData/Roaming/AI Video Creator/addons/wsl-venv/bin/python3' scripts/run-director-job.py director-smoke-job.json`,
      ),
    );
  }
} catch (err) {
  if (err.stdout) process.stdout.write(err.stdout);
  if (err.stderr) process.stderr.write(err.stderr);
  process.exit(err.status || 1);
}
