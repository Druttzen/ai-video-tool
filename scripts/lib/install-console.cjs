/**
 * Console + log progress for addon install (CMD window or log file).
 */
const fs = require("fs");
const path = require("path");
const { progressFromPayload, formatLine, getLogPath, initProgressLog } = require("./setup-hub-console.cjs");

function createInstallReporter(userDataPath, { version = "", echoToConsole = true } = {}) {
  initProgressLog(userDataPath, { version });

  function emit(message, { level = "info" } = {}) {
    const line = formatLine(message, { level });
    if (echoToConsole) {
      process.stdout.write(`${line}\r\n`);
    }
    fs.appendFileSync(getLogPath(userDataPath), `${line}\r\n`, "utf8");
  }

  return {
    report(payload) {
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
        emit(payload.message, { level: payload.phase === "error" ? "error" : "info" });
      } else if (payload?.phase) {
        emit(`Phase: ${payload.phase}`);
      }
    },
    finish({ ok, message } = {}) {
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

function resolveBundledScript(relativePath) {
  const candidates = buildBundledScriptCandidates(relativePath);
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

module.exports = {
  createInstallReporter,
  resolveBundledScript,
  isSpawnableBundledScript,
  getBundledScriptRoots,
  buildBundledScriptCandidates,
};
