/**
 * Console + log progress for addon install (CMD window or log file).
 */
const fs = require("fs");
const path = require("path");
const { progressFromPayload, getLogPath, initProgressLog } = require("./setup-hub-console.cjs");
const {
  buildEtaUserMessage,
  estimateFinishAt,
  formatLocalDateTime,
  formatEstDateTime,
  isOnlyPipStackMissingIds,
} = require("./install-time-estimate.cjs");

const ANSI_RED = "\x1b[91m";
const ANSI_RESET = "\x1b[0m";

function formatInstallLine(message, { level = "info" } = {}) {
  const stamp = formatLocalDateTime();
  const prefix =
    level === "error" ? "[ERROR]" : level === "warn" ? "[WARN ]" : level === "ok" ? "[ OK  ]" : "[INFO ]";
  return `${stamp} ${prefix} ${String(message || "").trim()}`;
}

function createInstallReporter(userDataPath, { version = "", echoToConsole = true } = {}) {
  const startedAt = new Date();
  initProgressLog(userDataPath, { version, startedAtLocal: formatLocalDateTime(startedAt), startedAtEst: formatEstDateTime(startedAt) });

  let lastEtaKey = "";

  function emit(message, { level = "info", highlight = false } = {}) {
    const line = formatInstallLine(message, { level });
    if (echoToConsole) {
      if (highlight) {
        process.stdout.write(`${ANSI_RED}${line}${ANSI_RESET}\r\n`);
      } else {
        process.stdout.write(`${line}\r\n`);
      }
    }
    fs.appendFileSync(getLogPath(userDataPath), `${line}\r\n`, "utf8");
  }

  function emitEta({ pipOnly = false, fromDate = new Date(), durationMin, reason = "" } = {}) {
    const finishAt = estimateFinishAt({ pipOnly, fromDate, durationMin });
    const etaKey = `${pipOnly}:${finishAt.getTime()}:${reason}`;
    if (etaKey === lastEtaKey) return;
    lastEtaKey = etaKey;
    const message = buildEtaUserMessage(finishAt, { pipOnly });
    emit(reason ? `${message} (${reason})` : message, { highlight: true });
  }

  emit(`Install started — local time ${formatLocalDateTime(startedAt)} / Eastern ${formatEstDateTime(startedAt)}`);
  emitEta({ pipOnly: false, fromDate: startedAt, reason: "initial estimate" });

  return {
    report(payload) {
      if (payload?.phase === "audit-scan-done") {
        const pipOnly = isOnlyPipStackMissingIds(payload.missingIds);
        emitEta({ pipOnly, fromDate: new Date(), reason: pipOnly ? "pip stack only" : "after scan" });
      }

      if (payload?.phase === "addon-start" && payload.addonId === "pip-deps") {
        emitEta({ pipOnly: true, fromDate: new Date(), reason: "torch download phase" });
      }

      const line = progressFromPayload(payload);
      if (line) {
        let level = "info";
        if (payload.phase === "error") level = "error";
        else if (payload.item && !payload.item.ok && !payload.item.skipped) {
          level = payload.item.needsManualInstall ? "warn" : "error";
        } else if (payload.phase === "complete" && payload.ok) level = "ok";
        const stripped = line.replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \[.*?\] /, "");
        emit(stripped, { level });
      } else if (payload?.message) {
        const highlight = /pip stack|2–4 GB|to install/i.test(String(payload.message));
        emit(payload.message, { level: payload.phase === "error" ? "error" : "info", highlight });
      } else if (payload?.phase) {
        emit(`Phase: ${payload.phase}`);
      }
    },
    finish({ ok, message } = {}) {
      const finishedAt = new Date();
      emit(`Finished — local ${formatLocalDateTime(finishedAt)} / Eastern ${formatEstDateTime(finishedAt)}`, {
        level: ok ? "ok" : "error",
      });
      const finalMessage =
        message || (ok ? "Install pipeline finished successfully." : "Install pipeline finished with errors.");
      emit(finalMessage, { level: ok ? "ok" : "error" });
      emit("Press any key to close this window…", { level: "info" });
    },
    logPath: getLogPath(userDataPath),
  };
}

function isSpawnableBundledScript(relativePath) {
  return /\.(py|sh)$/i.test(String(relativePath || ""));
}

/** App roots for packaged Electron (asar + asar.unpacked) and dev repo layout. */
function getBundledScriptRoots() {
  const roots = [];
  const seen = new Set();

  function addRoot(base, unpacked) {
    const packedRoot = path.resolve(String(base || ""));
    const unpackedRoot = path.resolve(String(unpacked || packedRoot));
    const key = `${packedRoot}\0${unpackedRoot}`;
    if (!packedRoot || seen.has(key)) return;
    seen.add(key);
    roots.push({ packed: packedRoot, unpacked: unpackedRoot });
  }

  addRoot(path.join(__dirname, "..", ".."), path.join(__dirname, "..", ".."));

  if (process.resourcesPath) {
    addRoot(
      path.join(process.resourcesPath, "app.asar"),
      path.join(process.resourcesPath, "app.asar.unpacked"),
    );
  }

  const asarMarker = `${path.sep}app.asar${path.sep}`;
  const asarIdx = __dirname.indexOf(asarMarker);
  if (asarIdx >= 0) {
    const packedRoot = __dirname.slice(0, asarIdx + "app.asar".length);
    addRoot(packedRoot, `${packedRoot}.unpacked`);
  } else if (__dirname.endsWith(`${path.sep}app.asar`)) {
    const packedRoot = __dirname;
    addRoot(packedRoot, `${packedRoot}.unpacked`);
  }

  return roots;
}

function buildBundledScriptCandidates(relativePath, { roots, cwd } = {}) {
  const rel = String(relativePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const searchRoots = roots || getBundledScriptRoots();
  const preferUnpacked = isSpawnableBundledScript(rel);
  const seen = new Set();
  const candidates = [];

  function add(candidate) {
    const normalized = path.normalize(candidate);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  }

  for (const { packed, unpacked } of searchRoots) {
    const orderedRoots = preferUnpacked ? [unpacked, packed] : [packed, unpacked];
    for (const root of orderedRoots) {
      add(path.join(root, rel));
    }
  }

  add(path.join(cwd || process.cwd(), rel));
  return candidates;
}

function isInsidePackedAsar(filePath) {
  const normalized = String(filePath || "").replace(/\//g, path.sep);
  const marker = `${path.sep}app.asar${path.sep}`;
  return normalized.includes(marker) && !normalized.includes(`${path.sep}app.asar.unpacked${path.sep}`);
}

function resolveBundledScript(relativePath, { roots, cwd } = {}) {
  const candidates = buildBundledScriptCandidates(relativePath, { roots, cwd });
  const resolved = candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
  if (isSpawnableBundledScript(relativePath) && isInsidePackedAsar(resolved)) {
    const unpacked = candidates.find((c) => c.includes(`${path.sep}app.asar.unpacked${path.sep}`) && fs.existsSync(c));
    if (unpacked) return unpacked;
  }
  return resolved;
}

module.exports = {
  createInstallReporter,
  resolveBundledScript,
  isSpawnableBundledScript,
  getBundledScriptRoots,
  buildBundledScriptCandidates,
  formatInstallLine,
};
