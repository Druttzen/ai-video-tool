/**
 * Unified tool installer — protocol, missing-addon scan, and install orchestration.
 * Wraps addon-updater with built-in scanning before install.
 */
const path = require("path");
const { scanSetupEnvironment } = require("./environment-scan.cjs");
const {
  checkAddonUpdates,
  loadAddonManifest,
  updateAddon,
  updateAllAddons,
} = require("./addon-updater.cjs");
const { resolveEffectivePlatform } = require("./addon-platform.cjs");
const { defaultUserDataPath } = require("./open-sora-paths.cjs");

function getInstallProtocol() {
  const manifest = loadAddonManifest();
  return {
    version: manifest.protocol?.version || manifest.version,
    forceManaged: Boolean(manifest.forceManaged),
    forceVenvForPip: Boolean(manifest.protocol?.forceVenvForPip),
    scanBeforeInstall: manifest.protocol?.scanBeforeInstall !== false,
    stopOnFirstFailure: manifest.protocol?.stopOnFirstFailure !== false,
    platforms: manifest.protocol?.platforms || ["win32", "linux", "darwin"],
    installOrder: manifest.installOrder || [],
    addons: Object.fromEntries(
      Object.entries(manifest.addons || {}).map(([id, cfg]) => [
        id,
        { id, label: cfg.label, description: cfg.description || "", required: Boolean(cfg.required) },
      ]),
    ),
  };
}

/**
 * Scan all managed tools/addons and report missing items.
 * @param {object} params
 * @param {string} [params.userDataPath]
 */
async function scanMissingAddons({ userDataPath } = {}) {
  const base = userDataPath || defaultUserDataPath();
  const platform = await resolveEffectivePlatform();
  const scan = await scanSetupEnvironment({ userDataPath: base });
  const report = await checkAddonUpdates({ scan, userDataPath: base });

  const items = report.items || [];
  const missing = items.filter((i) => i.updateAvailable);

  return {
    ok: missing.length === 0,
    scannedAt: new Date().toISOString(),
    platform,
    userDataPath: base,
    forceManaged: report.forceManaged,
    protocol: getInstallProtocol(),
    items,
    missing,
    missingCount: missing.length,
    missingIds: missing.map((i) => i.id),
    summary:
      missing.length === 0
        ? "All managed tools installed"
        : `${missing.length} missing: ${missing.map((i) => i.label || i.id).join(", ")}`,
  };
}

/**
 * Install tools using protocol order. Scans first unless disabled.
 * @param {object} params
 * @param {string} params.userDataPath
 * @param {string|null} [params.addonId] single addon or all
 * @param {boolean} [params.skipScan]
 */
async function installTools({ userDataPath, addonId = null, skipScan = false } = {}) {
  const base = userDataPath || defaultUserDataPath();
  const protocol = getInstallProtocol();

  let preScan = null;
  if (!skipScan && protocol.scanBeforeInstall) {
    preScan = await scanMissingAddons({ userDataPath: base });
  }

  if (addonId) {
    const scan = preScan?.items
      ? { python: {}, ffmpeg: {}, openSora: {} }
      : (await scanSetupEnvironment({ userDataPath: base }));
    const result = await updateAddon({ addonId, userDataPath: base, scan });
    const postScan = await scanMissingAddons({ userDataPath: base });
    return {
      ok: Boolean(result.ok),
      results: [{ id: addonId, ...result }],
      preScan,
      postScan,
    };
  }

  const batch = await updateAllAddons({ userDataPath: base, scan: await scanSetupEnvironment({ userDataPath: base }) });
  const postScan = await scanMissingAddons({ userDataPath: base });
  return {
    ok: Boolean(batch.ok),
    results: batch.results,
    preScan,
    postScan,
  };
}

module.exports = {
  getInstallProtocol,
  installTools,
  scanMissingAddons,
};
