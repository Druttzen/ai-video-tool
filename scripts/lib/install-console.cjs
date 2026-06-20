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

function resolveBundledScript(relativePath) {
  const rel = String(relativePath || "").replace(/\\/g, "/");
  const candidates = [
    path.join(__dirname, "..", rel),
    path.join(process.cwd(), rel),
  ];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, "app.asar.unpacked", rel));
    candidates.push(path.join(process.resourcesPath, rel));
  }
  if (__dirname.includes("app.asar")) {
    candidates.push(path.join(__dirname.replace("app.asar", "app.asar.unpacked"), "..", rel));
  }
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

module.exports = {
  createInstallReporter,
  resolveBundledScript,
};
