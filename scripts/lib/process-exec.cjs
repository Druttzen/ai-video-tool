/**
 * Safe child_process execFile — never use shell when invoking a concrete executable path
 * (Windows breaks paths containing spaces, e.g. AppData\AI Video Creator).
 */
const { execFile, spawn } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

/**
 * @param {string} executable
 * @param {string[]} args
 * @param {import('child_process').ExecFileOptions} [options]
 */
async function execLocal(executable, args, options = {}) {
  return execFileAsync(executable, args, { ...options, shell: false });
}

/**
 * Spawn with inherited stdio — preserves child exit codes (unlike shell:true + quoted paths).
 * @param {string} executable
 * @param {string[]} args
 * @param {import('child_process').SpawnOptions} [options]
 */
function spawnLocal(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: "inherit", shell: false, ...options });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${executable} exited ${code}`));
    });
  });
}

module.exports = {
  execLocal,
  spawnLocal,
};
