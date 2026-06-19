import { buildOpenSoraJobPayload } from "./open-sora-prompt-builder";
import { isElectronApp, launchOpenSoraJob, openOpenSoraUi } from "./electron-bridge";

/**
 * Send job to local Open-Sora via Electron (writes JSON + spawns pipeline).
 * Browser fallback: downloads job JSON.
 */
export async function sendToOpenSora({ project, settings, imagePayload, mode = "pipeline" }) {
  const job = buildOpenSoraJobPayload(project, settings, { imagePayload });

  if (isElectronApp()) {
    return launchOpenSoraJob({ job, imagePayload, mode, pythonPath: settings.pythonPath });
  }

  const blob = new Blob([JSON.stringify(job, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `open-sora-job-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  return {
    ok: true,
    fallback: true,
    message:
      "Desktop app not detected — job JSON downloaded. Run: python scripts/run-open-sora-job.py <file.json>",
    jobPath: null,
  };
}

/** Open app_pro.py Gradio UI in a new process (Electron only). */
export async function launchOpenSoraAppUi(installPath, pythonPath = "python") {
  if (!isElectronApp()) {
    return { ok: false, error: "Open-Sora UI launch requires the Electron desktop app" };
  }
  return openOpenSoraUi({ installPath, pythonPath });
}
