/**
 * Safe child_process execFile — never use shell when invoking a concrete executable path
 * (Windows breaks paths containing spaces, e.g. AppData\AI Video Creator).
 */
const { execFile } = require("child_process");
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

module.exports = {
  execLocal,
};
