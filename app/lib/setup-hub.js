import manifest from "../../data/setup-hub-manifest.json";
import { DEFAULT_DIRECTOR_SETTINGS, loadDirectorSettingsFromStorage, saveDirectorSettingsToStorage } from "./director-settings";
import {
  getGpuWorkflowFunctions,
  loadGpuWorkflowSettings,
  saveGpuWorkflowSettings,
} from "./gpu-workflow-functions";
import {
  loadOpenSoraSettingsFromStorage,
  saveOpenSoraSettingsToStorage,
} from "./open-sora-settings";
import { isCoProducerLlmReady } from "./co-producer-llm";
import { isElectronApp, scanSetupEnvironmentFromHost } from "./electron-bridge";

export const SETUP_HUB_EVENT = "setup-hub-updated";

export function getSetupHubModules() {
  return manifest.modules || [];
}

function moduleStatus(scan, moduleId) {
  if (!scan) return "unknown";
  const row = scan.modules?.[moduleId];
  return row?.status || "unknown";
}

export function summarizeSetupScan(scan) {
  if (!scan?.modules) {
    return { ready: 0, total: getSetupHubModules().length, label: "Not scanned" };
  }
  const modules = getSetupHubModules();
  const ready = modules.filter((m) => moduleStatus(scan, m.id) === "ready").length;
  const optionalReady = modules.filter((m) =>
    ["ready", "optional", "offline"].includes(moduleStatus(scan, m.id)),
  ).length;
  const localRenderReady =
    moduleStatus(scan, "python") === "ready" && moduleStatus(scan, "pipeline") === "ready";
  return {
    ready,
    optionalReady,
    total: modules.length,
    localRenderReady,
    label: localRenderReady
      ? "Maxed standalone profile available — local MP4 ready"
      : ready >= 4
        ? "Core studio ready — add Python + pipeline for local MP4"
        : "Scan environment to configure all-in-one setup",
  };
}

export function buildSetupScanFromHost(hostScan, { coProducerLlmSettings } = {}) {
  if (!hostScan?.ok) return null;

  const scan = hostScan.scan || {};
  const modules = {
    desktop: {
      status: scan.electron?.packaged || isElectronApp() ? "ready" : "optional",
      message: scan.electron?.packaged
        ? "Packaged desktop app"
        : isElectronApp()
          ? "Electron dev shell"
          : "Browser mode — export only",
    },
    director: { status: "ready", message: "Director Engine bundled" },
    analyzers: { status: "ready", message: "Browser audio/image analyzers bundled" },
    python: scan.python?.ok
      ? {
          status: "ready",
          message: scan.python.bundled
            ? `Bundled Python ${scan.python.version || ""}`.trim()
            : `Python ${scan.python.version || "detected"}`.trim(),
        }
      : { status: "missing", message: scan.python?.error || "Install Python 3.10+ or bundle in resources/python" },
    pipeline: scan.pipeline?.ok
      ? { status: "ready", message: `Pipeline ready — ${scan.pipeline.path}` }
      : {
          status: "missing",
          message: scan.pipeline?.error || "Set Director → Advanced → local pipeline folder",
        },
    "open-sora": scan.openSora?.ok
      ? { status: "ready", message: `Open-Sora install found — ${scan.openSora.path}` }
      : {
          status: "optional",
          message: scan.openSora?.error || "Optional — clone Open-Sora or point install path below",
        },
    gpu: scan.gpu?.primaryGpu
      ? {
          status: "ready",
          message: `${scan.gpu.primaryGpu.name}${scan.gpu.primaryGpu.vramGb ? ` · ${scan.gpu.primaryGpu.vramGb} GB VRAM` : ""}`,
        }
      : { status: "optional", message: "No discrete GPU detected — export mode still works" },
    workflows: { status: "ready", message: "Paths A–E bundled" },
    "co-producer": isCoProducerLlmReady(coProducerLlmSettings)
      ? { status: "ready", message: "LLM endpoint configured" }
      : { status: "offline", message: "Heuristic mode — add API key in Co-Producer for full AI" },
    "style-dna": { status: "optional", message: "MusicBrainz works without keys; Spotify optional" },
    ffmpeg: scan.ffmpeg?.ok
      ? {
          status: "ready",
          message: scan.ffmpeg.bundled ? "Bundled ffmpeg" : `ffmpeg on PATH (${scan.ffmpeg.path})`,
        }
      : { status: "optional", message: "Optional — not required for prompt studio" },
    "export-cloud": { status: "ready", message: "Export JSON + copy prompt to any video AI" },
  };

  return { scannedAt: scan.scannedAt || new Date().toISOString(), modules, raw: scan };
}

export async function runSetupEnvironmentScan({ directorSettings, openSoraSettings, coProducerLlmSettings } = {}) {
  if (!isElectronApp()) {
    const browserScan = buildSetupScanFromHost(
      {
        ok: true,
        scan: {
          scannedAt: new Date().toISOString(),
          electron: { packaged: false },
          python: { ok: false, error: "Requires desktop app" },
          pipeline: { ok: false, error: "Requires desktop app" },
          openSora: { ok: false, error: "Requires desktop app" },
          ffmpeg: { ok: false },
          gpu: null,
        },
      },
      { coProducerLlmSettings },
    );
    notifySetupHubUpdated(browserScan);
    return { ok: true, scan: browserScan };
  }

  const host = await scanSetupEnvironmentFromHost({
    directorSettings: directorSettings || loadDirectorDefaults(),
    openSoraInstallPath: openSoraSettings?.installPath || "",
  });
  if (!host?.ok) return host;
  const scan = buildSetupScanFromHost(host, { coProducerLlmSettings });
  notifySetupHubUpdated(scan);
  return { ok: true, scan };
}

function loadDirectorDefaults() {
  return { ...DEFAULT_DIRECTOR_SETTINGS };
}

export function applyMaxedStandaloneProfile(hostScan) {
  const scan = hostScan?.raw || hostScan || {};
  const director = { ...loadDirectorSettingsFromStorage() };
  const openSora = { ...loadOpenSoraSettingsFromStorage() };
  const gpu = { ...loadGpuWorkflowSettings() };

  if (scan.openSora?.ok) {
    director.localPipelinePath = scan.openSora.path;
    director.renderBackend = "local-python";
    openSora.installPath = scan.openSora.path;
  } else if (scan.pipeline?.ok) {
    director.localPipelinePath = scan.pipeline.path;
    director.renderBackend = "local-python";
  }

  if (scan.python?.ok && scan.python.path) {
    director.localPythonPath = scan.python.path;
  }

  director.autoOptimizeFromHardware = true;

  gpu.autoRunBeforeRender = true;
  gpu.autoRunOnWorkflow = true;
  gpu.enabledIds = getGpuWorkflowFunctions().map((fn) => fn.id);

  saveDirectorSettingsToStorage(director);
  saveOpenSoraSettingsToStorage(openSora);
  saveGpuWorkflowSettings(gpu);

  window.dispatchEvent(new CustomEvent("director-settings-updated", { detail: director }));
  notifySetupHubUpdated(null);

  return { director, openSora, gpu };
}

export function linkOpenSoraToDirector(openSoraPath) {
  const trimmed = String(openSoraPath || "").trim();
  if (!trimmed) return { ok: false, error: "Open-Sora path is empty" };

  const director = {
    ...loadDirectorSettingsFromStorage(),
    localPipelinePath: trimmed,
    renderBackend: "local-python",
  };
  const openSora = { ...loadOpenSoraSettingsFromStorage(), installPath: trimmed };

  saveDirectorSettingsToStorage(director);
  saveOpenSoraSettingsToStorage(openSora);
  window.dispatchEvent(new CustomEvent("director-settings-updated", { detail: director }));
  notifySetupHubUpdated(null);

  return { ok: true, director, openSora };
}

export function notifySetupHubUpdated(scan) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SETUP_HUB_EVENT, { detail: scan }));
}

export function scrollToSetupTarget(testId) {
  if (!testId || typeof document === "undefined") return;
  document.querySelector(`[data-testid="${testId}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
