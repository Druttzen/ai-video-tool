#!/usr/bin/env node
const os = require("os");
const path = require("path");
const { scanSetupEnvironment } = require("./lib/environment-scan.cjs");
const { checkAddonUpdates } = require("./lib/addon-updater.cjs");

async function main() {
  const userDataPath = process.env.ADDON_USER_DATA || path.join(os.homedir(), ".ai-video-creator-addons-check");
  const scan = await scanSetupEnvironment({ userDataPath });
  const report = await checkAddonUpdates({ scan, userDataPath });
  console.log(JSON.stringify(report, null, 2));
  const pending = report.items?.filter((i) => i.updateAvailable) || [];
  process.exit(pending.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(2);
});
