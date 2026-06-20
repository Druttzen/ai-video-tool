(function () {
  const statusCard = document.getElementById("status-card");
  const statusText = document.getElementById("status-text");
  const progressBar = document.getElementById("progress-bar");
  const logEl = document.getElementById("log");
  const addonList = document.getElementById("addon-list");
  const btnRetry = document.getElementById("btn-retry");
  const btnMain = document.getElementById("btn-main");
  const btnClose = document.getElementById("btn-close");

  let busy = true;

  function setBusy(value) {
    busy = value;
    btnRetry.disabled = value;
  }

  function appendLog(text, kind) {
    const line = document.createElement("p");
    line.className = "log-entry" + (kind ? " " + kind : "");
    line.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function renderAddonList(report) {
    if (!report?.items?.length) {
      addonList.hidden = true;
      return;
    }
    addonList.hidden = false;
    addonList.innerHTML = "";
    for (const item of report.items) {
      const row = document.createElement("div");
      row.className = "addon-row " + (item.updateAvailable ? "missing" : "ok");
      row.innerHTML =
        "<span>" +
        (item.label || item.id) +
        "</span><span>" +
        (item.updateAvailable ? "Missing" : "OK") +
        "</span>";
      addonList.appendChild(row);
    }
  }

  function handleProgress(payload) {
    if (!payload) return;

    if (payload.message) {
      statusText.textContent = payload.message;
      appendLog(payload.message, payload.phase === "error" ? "err" : "");
    }

    if (payload.phase === "scan" || payload.phase === "install") {
      statusCard.classList.remove("success", "error");
      progressBar.classList.remove("done");
      setBusy(true);
    }

    if (payload.phase === "scan-done" && payload.report) {
      renderAddonList(payload.report);
      appendLog(payload.report.summary || "Scan complete", "ok");
    }

    if (payload.phase === "addon" && payload.item) {
      const row = payload.item;
      const label = row.id + ": " + (row.message || row.error || (row.ok ? "OK" : "failed"));
      appendLog(label, row.ok || row.skipped ? "ok" : row.needsManualInstall ? "warn" : "err");
      if (row.needsManualInstall && row.installUrl && window.setupHubAPI?.openExternal) {
        appendLog("Opening manual install link for " + row.id + "…", "warn");
        void window.setupHubAPI.openExternal(row.installUrl);
      }
    }

    if (payload.phase === "complete") {
      progressBar.classList.add("done");
      setBusy(false);
      btnMain.disabled = false;
      if (payload.report) renderAddonList(payload.report);
      if (payload.ok) {
        statusCard.classList.add("success");
        statusCard.classList.remove("error");
        appendLog("Setup finished.", "ok");
      } else {
        statusCard.classList.add("error");
        appendLog("Setup finished with errors.", "err");
      }
    }

    if (payload.phase === "error") {
      progressBar.classList.add("done");
      statusCard.classList.add("error");
      setBusy(false);
      btnMain.disabled = false;
      appendLog(payload.error || "Unknown error", "err");
    }
  }

  btnRetry.addEventListener("click", () => {
    if (busy || !window.setupHubAPI?.runAutoSetup) return;
    logEl.innerHTML = "";
    progressBar.classList.remove("done");
    statusCard.classList.remove("success", "error");
    setBusy(true);
    btnMain.disabled = true;
    appendLog("Retrying scan and install…");
    void window.setupHubAPI.runAutoSetup();
  });

  btnMain.addEventListener("click", () => {
    if (!window.setupHubAPI?.openMainApp) return;
    void window.setupHubAPI.openMainApp();
  });

  btnClose.addEventListener("click", () => {
    window.close();
  });

  if (window.setupHubAPI?.onProgress) {
    window.setupHubAPI.onProgress(handleProgress);
  }

  if (window.setupHubAPI?.getVersion) {
    void window.setupHubAPI.getVersion().then((info) => {
      if (info?.version) {
        document.title = "All-in-One Setup Hub v" + info.version;
      }
    });
  }

  appendLog("Setup Hub ready — auto scan starting…");
})();
