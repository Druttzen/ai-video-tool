#!/usr/bin/env node
/** Exit 1 when addon updates are pending; use --allow-pending for CI-friendly exit 0. */
const path = require("path");
const { scanSetupEnvironment } = require("./lib/environment-scan.cjs");
const { checkAddonUpdates } = require("./lib/addon-updater.cjs");

const { resolveUserDataPath } = require("./lib/open-sora-paths.cjs");

async function main() {
  const userDataPath = resolveUserDataPath(path.join(__dirname, ".."));
  const scan = await scanSetupEnvironment({ userDataPath });
  const report = await checkAddonUpdates({ scan, userDataPath });
  console.log(JSON.stringify(report, null, 2));
  const pending = report.items?.filter((i) => i.updateAvailable) || [];
  const allowPending = process.argv.includes("--allow-pending");
  process.exit(pending.length && !allowPending ? 1 : 0);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(2);
});
