#!/usr/bin/env node
const path = require("path");
const { execFileSync } = require("child_process");

const html = path.resolve(__dirname, "multiclip-progress-demo.html");
const url = `file:///${html.replace(/\\/g, "/")}`;

console.log("Opening beat-sync progress demo:", url);

if (process.platform === "win32") {
  execFileSync("cmd", ["/c", "start", "", url], { stdio: "ignore" });
} else if (process.platform === "darwin") {
  execFileSync("open", [url], { stdio: "ignore" });
} else {
  execFileSync("xdg-open", [url], { stdio: "ignore" });
}
