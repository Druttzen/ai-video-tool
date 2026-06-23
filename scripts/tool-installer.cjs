#!/usr/bin/env node
/**
 * Unified tool installer CLI — scan missing addons + install protocol.
 *
 * Usage:
 *   node scripts/tool-installer.cjs scan [--json]
 *   node scripts/tool-installer.cjs install [--addon <id>] [--json] [--pip-via-python]
 *   node scripts/tool-installer.cjs protocol [--json]
 */
const os = require("os");
const path = require("path");
const {
  getInstallProtocol,
  installTools,
  scanMissingAddons,
} = require("./lib/tool-installer.cjs");
const { resolveUserDataPath } = require("./lib/open-sora-paths.cjs");

function readArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return "";
  return process.argv[idx + 1] || "";
}

async function main() {
  const cmd = process.argv[2] || "scan";
  const jsonOut = process.argv.includes("--json");
  const addonId = readArg("--addon");
  const userDataPath = resolveUserDataPath(path.join(__dirname, ".."));

  if (cmd === "protocol") {
    const protocol = getInstallProtocol();
    if (jsonOut) console.log(JSON.stringify(protocol, null, 2));
    else {
      console.log("AI Video Creator — tool install protocol v" + protocol.version);
      console.log("Platforms:", protocol.platforms.join(", "));
      console.log("Install order:", protocol.installOrder.join(" → "));
      console.log("Force venv for pip:", protocol.forceVenvForPip);
    }
    process.exit(0);
  }

  if (cmd === "scan") {
    const report = await scanMissingAddons({ userDataPath });
    if (jsonOut) console.log(JSON.stringify(report, null, 2));
    else printScanReport(report);
    process.exit(report.missingCount > 0 ? 1 : 0);
  }

  if (cmd === "install") {
    const forcePipeline = process.argv.includes("--force-pipeline") || !addonId;
    const pipViaPython = process.argv.includes("--pip-via-python");
    const result = await installTools({
      userDataPath,
      addonId: addonId || null,
      forcePipeline,
      pipViaPython,
    });
    if (jsonOut) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(result.ok ? "Tool install finished" : "Tool install had failures");
      for (const row of result.results || []) {
        console.log(`  ${row.id}: ${row.skipped ? "skipped" : row.ok ? "ok" : "FAIL"} — ${row.message || row.error || ""}`);
      }
    }
    process.exit(result.ok ? 0 : 1);
  }

  console.error("Usage: tool-installer.cjs <scan|install|protocol> [--json] [--addon <id>]");
  process.exit(2);
}

function printScanReport(report) {
  console.log("AI Video Creator — missing addon scan");
  console.log(`Platform: ${report.platform} · userData: ${report.userDataPath}`);
  console.log(`Missing: ${report.missingCount} / ${report.items.length}`);
  console.log("");
  for (const item of report.items) {
    const mark = item.updateAvailable ? "MISSING" : "OK";
    console.log(`[${mark}] ${item.label} (${item.id})`);
    console.log(`       ${item.message}`);
    if (item.path) console.log(`       ${item.path}`);
  }
  if (report.missingCount > 0) {
    console.log("");
    console.log("Install all: npm run tools:install");
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(2);
});
