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
const { resolveUserDataPath } = require("./open-sora-paths.cjs");

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
  const base = userDataPath || resolveUserDataPath();
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
        : `${missing.length} to install: ${missing.map((i) => i.label || i.id).join(", ")}`,
  };
}

/** Critical addons that must pass safe scan before proceeding to the main app. */
const SAFE_SCAN_CRITICAL = new Set([
  "git",
  "nodejs",
  "python",
  "venv",
  "open-sora",
  "requirements",
  "pip-deps",
]);

const SAFE_SCAN_OPTIONAL = new Set(["ffmpeg", "models", "wsl", "music-video-sync"]);

/** Pip stack only — skip full force-reinstall when base stack (git/python/venv) is already ready. */
const PIP_STACK_ONLY_IDS = new Set(["pip-deps", "music-video-sync"]);

function isOnlyPipStackMissing(audit) {
  const missingIds = audit?.missingIds || [];
  return missingIds.length > 0 && missingIds.every((id) => PIP_STACK_ONLY_IDS.has(id));
}

function formatInstallPhase2Message(audit) {
  if (isOnlyPipStackMissing(audit)) {
    return `Phase 2/4 — installing pip stack (torch + Python deps, ~2–4 GB download)…`;
  }
  if (audit.missingCount > 0) {
    return `Phase 2/4 — installing managed addons in protocol order (${audit.missingCount} to install)…`;
  }
  return "Phase 2/4 — verifying managed stack in protocol order…";
}
/**
 * Final verification scan — critical vs optional issues.
 * @param {object} params
 * @param {string} [params.userDataPath]
 */
async function runSafeScan({ userDataPath } = {}) {
  const base = userDataPath || resolveUserDataPath();
  const envScan = await scanSetupEnvironment({ userDataPath: base });
  const report = await checkAddonUpdates({ scan: envScan, userDataPath: base });

  const criticalIssues = [];
  const optionalIssues = [];

  for (const item of report.items || []) {
    if (!item.updateAvailable) continue;
    if (item.id === "git" && item.needsManualInstall) {
      criticalIssues.push(item);
    } else if (SAFE_SCAN_CRITICAL.has(item.id)) {
      criticalIssues.push(item);
    } else if (SAFE_SCAN_OPTIONAL.has(item.id)) {
      optionalIssues.push(item);
    }
  }

  const ok = criticalIssues.length === 0;
  let summary;
  if (ok && optionalIssues.length === 0) {
    summary = "Safe scan passed — all addons ready";
  } else if (ok) {
    summary = `Safe scan passed — ${optionalIssues.length} optional item(s) remain (FFmpeg, models, WSL, or music video sync)`;
  } else {
    summary = `Safe scan failed — ${criticalIssues.length} critical item(s): ${criticalIssues.map((i) => i.label || i.id).join(", ")}`;
  }

  return {
    ok,
    safe: ok,
    scannedAt: new Date().toISOString(),
    platform: envScan.platform,
    userDataPath: base,
    envScan,
    items: report.items,
    criticalIssues,
    optionalIssues,
    summary,
  };
}

/**
 * Full forced setup pipeline for standalone Setup Hub / first-run installer.
 * 1) Audit scan  2) Force reinstall (install order)  3) Update pass  4) Safe scan
 * @param {object} params
 * @param {string} params.userDataPath
 * @param {(payload: object) => void} [params.onProgress]
 */
async function forceInstallPipeline({ userDataPath, onProgress = () => {}, pipViaPython = false } = {}) {
  const base = userDataPath || resolveUserDataPath();

  const freshScan = async () => scanSetupEnvironment({ userDataPath: base });

  onProgress({ phase: "audit-scan", message: "Phase 1/4 — scanning for required addons, tools, and apps…" });
  const audit = await scanMissingAddons({ userDataPath: base });
  onProgress({
    phase: "audit-scan-done",
    message: audit.summary,
    report: audit,
    missingCount: audit.missingCount,
  });

  const needsForceReinstall =
    audit.missingCount > 0 ||
    audit.items.some((item) => item.updateAvailable && SAFE_SCAN_CRITICAL.has(item.id));

  if (needsForceReinstall) {
    onProgress({
      phase: "force-reinstall",
      message: formatInstallPhase2Message(audit),
    });
  } else {
    onProgress({
      phase: "force-reinstall",
      message: "Phase 2/4 — verifying managed stack (protocol order)…",
    });
  }

  const reinstall = await updateAllAddons({
    userDataPath: base,
    scan: await freshScan(),
    forceReinstall: !isOnlyPipStackMissing(audit),
    onProgress,
    pipViaPython,
  });

  onProgress({
    phase: "update-all",
    message: "Phase 3/4 — applying updates (pull, sync, pip refresh)…",
  });

  const update = await updateAllAddons({
    userDataPath: base,
    scan: await freshScan(),
    forceReinstall: false,
    onProgress,
    pipViaPython,
  });

  onProgress({ phase: "safe-scan", message: "Phase 4/4 — running safe verification scan…" });
  const safe = await runSafeScan({ userDataPath: base });
  onProgress({
    phase: "safe-scan-done",
    message: safe.summary,
    report: safe,
    safe,
  });

  const allResults = [...(reinstall.results || []), ...(update.results || [])];

  return {
    ok: Boolean(safe.ok && (reinstall.ok || update.ok)),
    audit,
    reinstall,
    update,
    safe,
    results: allResults,
    postScan: safe,
  };
}

/**
 * Install tools using protocol order. Scans first unless disabled.
 * @param {object} params
 * @param {string} params.userDataPath
 * @param {string|null} [params.addonId] single addon or all
 * @param {boolean} [params.skipScan]
 * @param {boolean} [params.forceReinstall]
 * @param {boolean} [params.forcePipeline] run full 4-phase pipeline
 */
async function installTools({
  userDataPath,
  addonId = null,
  skipScan = false,
  forceReinstall = false,
  forcePipeline = false,
  pipViaPython = false,
  onProgress = () => {},
} = {}) {
  const base = userDataPath || resolveUserDataPath();

  if (forcePipeline && !addonId) {
    return forceInstallPipeline({ userDataPath: base, onProgress, pipViaPython });
  }

  const protocol = getInstallProtocol();

  let preScan = null;
  if (!skipScan && protocol.scanBeforeInstall) {
    preScan = await scanMissingAddons({ userDataPath: base });
  }

  if (addonId) {
    onProgress({
      phase: "addon-start",
      addonId,
      label: addonId,
      forceReinstall: Boolean(forceReinstall),
    });
    const scan = await scanSetupEnvironment({ userDataPath: base });
    const result = await updateAddon({ addonId, userDataPath: base, scan, pipViaPython });
    onProgress({ phase: "addon-done", addonId, item: { id: addonId, ...result } });
    const postScan = await scanMissingAddons({ userDataPath: base });
    return {
      ok: Boolean(result.ok),
      results: [{ id: addonId, ...result }],
      preScan,
      postScan,
    };
  }

  const batch = await updateAllAddons({
    userDataPath: base,
    scan: await scanSetupEnvironment({ userDataPath: base }),
    forceReinstall,
    onProgress,
    pipViaPython,
  });
  const postScan = await runSafeScan({ userDataPath: base });
  return {
    ok: Boolean(batch.ok),
    results: batch.results,
    preScan,
    postScan,
  };
}

module.exports = {
  forceInstallPipeline,
  formatInstallPhase2Message,
  getInstallProtocol,
  installTools,
  isOnlyPipStackMissing,
  runSafeScan,
  scanMissingAddons,
};
