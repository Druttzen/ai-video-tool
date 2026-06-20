/**
 * Windows CMD progress window for Setup Hub install/update pipeline.
 * Writes a log under userData and opens a visible cmd.exe tailing it.
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const LOG_NAME = "setup-hub-install.log";
const BATCH_NAME = "setup-hub-progress.cmd";

let activeLogPath = null;

function getLogPath(userDataPath) {
  return path.join(String(userDataPath || "").trim(), LOG_NAME);
}

function formatLine(message, { level = "info" } = {}) {
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const prefix =
    level === "error" ? "[ERROR]" : level === "warn" ? "[WARN ]" : level === "ok" ? "[ OK  ]" : "[INFO ]";
  return `${stamp} ${prefix} ${String(message || "").trim()}`;
}

function appendProgressLine(userDataPath, message, options = {}) {
  const logPath = getLogPath(userDataPath);
  activeLogPath = logPath;
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${formatLine(message, options)}\r\n`, "utf8");
}

function initProgressLog(userDataPath, { version = "" } = {}) {
  const logPath = getLogPath(userDataPath);
  activeLogPath = logPath;
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const header = [
    "============================================================",
    "  AI Video Creator — Setup Hub Install / Update Progress",
    version ? `  Version: ${version}` : "",
    `  Started: ${new Date().toISOString()}`,
    `  Log file: ${logPath}`,
    "============================================================",
    "",
  ]
    .filter(Boolean)
    .join("\r\n");
  fs.writeFileSync(logPath, `${header}\r\n`, "utf8");
  return logPath;
}

function quotePsSingle(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Open a visible CMD window that tails the install log (Windows only).
 * @param {string} userDataPath
 */
function openProgressConsole(userDataPath) {
  if (process.platform !== "win32") {
    return { ok: true, skipped: true, reason: "CMD console is Windows-only" };
  }

  const logPath = activeLogPath || getLogPath(userDataPath);
  activeLogPath = logPath;
  const batchPath = path.join(String(userDataPath || "").trim(), BATCH_NAME);

  const batch = [
    "@echo off",
    "title AI Video Creator Setup Hub — Install Progress",
    "color 0A",
    "echo.",
    "echo ============================================================",
    "echo   AI Video Creator - Setup Hub Install / Update Progress",
    "echo   Live log tail (close this window when finished)",
    "echo ============================================================",
    "echo.",
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -LiteralPath ${quotePsSingle(logPath)} -Wait -Tail 100"`,
    "",
  ].join("\r\n");

  fs.mkdirSync(path.dirname(batchPath), { recursive: true });
  fs.writeFileSync(batchPath, batch, "utf8");

  const child = spawn("cmd.exe", ["/c", "start", "Setup Hub Install", "cmd", "/c", batchPath], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();

  return { ok: true, logPath, batchPath };
}

function progressFromPayload(payload) {
  if (!payload || typeof payload !== "object") return null;

  if (payload.phase === "addon-start") {
    return formatLine(`${payload.forceReinstall ? "INSTALL" : "UPDATE"} -> ${payload.label || payload.addonId}`);
  }

  if ((payload.phase === "addon-done" || payload.phase === "addon") && payload.item) {
    const row = payload.item;
    const detail = row.message || row.error || (row.skipped ? "skipped" : row.ok ? "ok" : "failed");
    return formatLine(`${row.id}: ${detail}`, {
      level: row.ok || row.skipped ? "ok" : row.needsManualInstall ? "warn" : "error",
    });
  }

  if (payload.message) {
    const level =
      payload.phase === "error" ? "error" : payload.phase === "complete" && payload.ok ? "ok" : "info";
    return formatLine(payload.message, { level });
  }

  return null;
}

function stripTimestamp(line) {
  return String(line || "").replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \[.*?\] /, "");
}

function createProgressReporter(userDataPath, { version = "", openConsole = true } = {}) {
  initProgressLog(userDataPath, { version });
  let consoleOpened = false;

  if (openConsole && process.platform === "win32") {
    const opened = openProgressConsole(userDataPath);
    consoleOpened = Boolean(opened.ok && !opened.skipped);
    if (consoleOpened) {
      appendProgressLine(userDataPath, "CMD progress window opened - live install log streaming below.");
    }
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
        appendProgressLine(userDataPath, stripTimestamp(line), { level });
      } else if (payload?.phase) {
        appendProgressLine(userDataPath, `Phase: ${payload.phase}`);
      }
    },
    finish({ ok, message } = {}) {
      const finalMessage =
        message || (ok ? "Setup pipeline finished successfully." : "Setup pipeline finished with errors.");
      appendProgressLine(userDataPath, finalMessage, { level: ok ? "ok" : "error" });
      appendProgressLine(userDataPath, "You may close this CMD window.", { level: "info" });
    },
    consoleOpened,
    logPath: getLogPath(userDataPath),
  };
}

module.exports = {
  appendProgressLine,
  createProgressReporter,
  formatLine,
  getLogPath,
  initProgressLog,
  openProgressConsole,
  progressFromPayload,
};
