/**
 * Launch Wan/Director Python jobs — native or via WSL on Windows.
 */
const path = require("path");
const { spawnLocal } = require("./process-exec.cjs");
const { windowsPathToWsl, shellQuoteBash, wslTensornvmeEnvPrelude } = require("./addon-platform.cjs");
const { getWslPyWsl } = require("./wsl-paths.cjs");

/**
 * @param {object} params
 * @param {object} params.scan — environment scan result
 * @param {string} params.python — managed venv python (Windows path)
 * @param {string} params.runner — run-director-job.py or run-diffusers-wan-job.py
 * @param {string} params.jobPath — job JSON path
 * @param {string} params.cwd — working directory for native spawn
 */
async function spawnDirectorPythonJob({ scan, python, runner, jobPath, cwd }) {
  const preferWsl = scan?.platform === "win32" && Boolean(scan?.wsl?.wanReady);

  if (preferWsl) {
    const wslPy = getWslPyWsl();
    const wslRunner = windowsPathToWsl(runner);
    const wslJob = windowsPathToWsl(jobPath);
    const wslCwd = windowsPathToWsl(cwd || path.dirname(jobPath));
    const cmd = `${wslTensornvmeEnvPrelude()}; cd ${shellQuoteBash(wslCwd)} && ${shellQuoteBash(wslPy)} ${shellQuoteBash(wslRunner)} ${shellQuoteBash(wslJob)}`;
    await spawnLocal("wsl", ["bash", "-lc", cmd]);
    return { via: "wsl", python: wslPy };
  }

  await spawnLocal(python, [runner, jobPath], { cwd: cwd || path.dirname(jobPath) });
  return { via: "native", python };
}

module.exports = {
  spawnDirectorPythonJob,
};
