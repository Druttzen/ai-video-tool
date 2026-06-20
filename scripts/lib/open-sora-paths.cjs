const os = require("os");
const path = require("path");

function defaultOpenSoraPath() {
  return process.platform === "win32"
    ? "E:\\Open-Sora"
    : path.join(os.homedir(), "Open-Sora");
}

module.exports = { defaultOpenSoraPath };
