#!/usr/bin/env node
const { execFileSync } = require("child_process");
const cmd = process.argv.slice(2).join(" ");
if (!cmd) {
  console.error("Usage: node wsl-exec-once.cjs <bash command>");
  process.exit(2);
}
try {
  process.stdout.write(execFileSync("wsl", ["bash", "-lc", cmd], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }));
} catch (err) {
  if (err.stdout) process.stdout.write(err.stdout);
  if (err.stderr) process.stderr.write(err.stderr);
  process.exit(err.status || 1);
}
