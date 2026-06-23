#!/usr/bin/env node
"use strict";

const path = require("path");
const { spawnSync } = require("child_process");
const { windowsPathToWsl } = require("./lib/addon-platform.cjs");

const SCRIPTS = {
  "build-tools": "wsl-install-build-tools.sh",
  optional: "wsl-install-linux-optional.sh",
};

const key = process.argv[2];
const basename = SCRIPTS[key];
if (!basename) {
  console.error("Usage: node scripts/wsl-npm-exec.cjs build-tools|optional");
  process.exit(1);
}

const scriptWsl = windowsPathToWsl(path.join(__dirname, basename));
const result = spawnSync("wsl", ["bash", scriptWsl], { stdio: "inherit", shell: false });
process.exit(result.status ?? 1);