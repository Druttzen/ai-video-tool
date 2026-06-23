/**
 * Bridge Setup Hub install/update progress to renderer IPC + optional log file.
 */
const { progressFromPayload, createProgressReporter, stripTimestamp } = require("./setup-hub-console.cjs");

/**
 * @param {import("electron").IpcMainInvokeEvent} event
 * @param {string} userDataPath
 * @param {{ version?: string, writeLog?: boolean, openConsole?: boolean }} [options]
 */
function createSetupInstallProgressBridge(event, userDataPath, { version = "", writeLog = true, openConsole = false } = {}) {
  let reporter = null;
  if (writeLog) {
    reporter = createProgressReporter(userDataPath, { version, openConsole });
  }

  function send(payload) {
    const sender = event?.sender;
    if (!sender || sender.isDestroyed()) return;
    const line = progressFromPayload(payload);
    sender.send("setup:tool-install-progress", {
      ...payload,
      line: line ? stripTimestamp(line) : payload.message || null,
    });
  }

  return {
    onProgress(payload) {
      if (reporter) reporter.report(payload);
      send(payload);
    },
    finish({ ok, message } = {}) {
      if (reporter) reporter.finish({ ok, message });
      send({ phase: "complete", ok: Boolean(ok), message, done: true });
    },
    reportError(message) {
      const payload = { phase: "error", message, ok: false };
      if (reporter) reporter.report(payload);
      send(payload);
    },
  };
}

module.exports = {
  createSetupInstallProgressBridge,
};
