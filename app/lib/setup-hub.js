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
import { safeLocalStorage } from "./safe-local-storage";

export const SETUP_HUB_EVENT = "setup-hub-updated";
export const SETUP_HUB_SCAN_KEY = "ai_video_creator_setup_hub_scan_v1";

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
    moduleStatus(scan, "python") === "ready" &&
    moduleStatus(scan, "pipeline") === "ready" &&
    (!scan.raw?.forceManaged ||
      (moduleStatus(scan, "venv") === "ready" && moduleStatus(scan, "pip-deps") === "ready"));
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
    git: scan.git?.ok
      ? { status: "ready", message: "Git on PATH" }
      : {
          status: "missing",
          message: scan.git?.error || "Install Git — required for Open-Sora clone",
        },
    nodejs: scan.nodejs?.ok
      ? { status: "ready", message: `Managed Node.js — ${scan.nodejs.path || scan.nodejs.version || ""}`.trim() }
      : {
          status: scan.forceManaged ? "missing" : "optional",
          message: "Managed Node.js — Update all addons",
        },
    python: scan.python?.ok
      ? {
          status: "ready",
          message: scan.python.managed
            ? `Managed Python ${scan.python.version || ""}`.trim()
            : scan.python.bundled
              ? `Bundled Python ${scan.python.version || ""}`.trim()
              : `Python ${scan.python.version || "detected"}`.trim(),
        }
      : {
          status: "missing",
          message: scan.python?.error || "Run Setup Hub → Update all addons (managed Python embed)",
        },
    pipeline: scan.pipeline?.ok
      ? {
          status: "ready",
          message: scan.pipeline.managed
            ? `Managed pipeline — ${scan.pipeline.path}`
            : `Pipeline ready — ${scan.pipeline.path}`,
        }
      : {
          status: "missing",
          message: scan.pipeline?.error || "Run Setup Hub → Update all addons (managed Open-Sora)",
        },
    "open-sora": scan.openSora?.ok
      ? {
          status: "ready",
          message: scan.openSora.managed
            ? `Managed Open-Sora — ${scan.openSora.path}`
            : `Open-Sora install found — ${scan.openSora.path}`,
        }
      : {
          status: scan.forceManaged ? "missing" : "optional",
          message: scan.openSora?.error || "Run Setup Hub → Update all addons",
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
          message: scan.ffmpeg.managed
            ? "Managed FFmpeg addon"
            : scan.ffmpeg.bundled
              ? "Bundled ffmpeg"
              : `ffmpeg on PATH (${scan.ffmpeg.path})`,
        }
      : { status: "optional", message: "Optional — install via Setup Hub addon update" },
    venv: scan.venv?.ok
      ? { status: "ready", message: `Managed venv — ${scan.venv.path}` }
      : {
          status: scan.forceManaged ? "missing" : "optional",
          message: scan.venv?.path
            ? "Managed venv missing — Update all addons"
            : "Isolated venv under userData/addons/venv",
        },
    requirements: scan.requirements?.ok
      ? { status: "ready", message: `requirements.txt synced — ${scan.requirements.path}` }
      : {
          status: scan.forceManaged ? "missing" : "optional",
          message: "Run addon update to sync data/addon-requirements.txt",
        },
    "pip-deps": scan.pipDeps?.ok
      ? { status: "ready", message: `${scan.pipDeps.probeModule || "torch"} OK in managed venv` }
      : {
          status: scan.forceManaged ? "missing" : "optional",
          message: "Pip deps missing — Update all addons (installs torch + Open-Sora stack)",
        },
    models: scan.models?.ok
      ? { status: "ready", message: `Model cache — ${scan.models.path}` }
      : {
          status: "optional",
          message: "Add checkpoint files to managed models folder or configure manifest downloads",
        },
    wsl: scan.wsl?.ok
      ? { status: "ready", message: `WSL Linux venv — ${scan.wsl.path}` }
      : {
          status: "optional",
          message: scan.wsl?.available
            ? "WSL detected — Update all addons for Linux torch stack"
            : "Optional — WSL2 not detected",
        },
    "export-cloud": { status: "ready", message: "Export JSON + copy prompt to any video AI" },
  };

  return { scannedAt: scan.scannedAt || new Date().toISOString(), modules, raw: scan };
}

export function loadPersistedSetupScan() {
  if (typeof window === "undefined") return null;
  const parsed = safeLocalStorage.getJSON(SETUP_HUB_SCAN_KEY, null);
  if (!parsed?.modules) return null;
  return parsed;
}

export function savePersistedSetupScan(scan) {
  if (typeof window === "undefined" || !scan?.modules) return;
  safeLocalStorage.setJSON(SETUP_HUB_SCAN_KEY, scan);
}

export function clearPersistedSetupScan() {
  if (typeof window === "undefined") return;
  safeLocalStorage.remove(SETUP_HUB_SCAN_KEY);
}

/** @returns {{ id: string, label: string, status: string, message: string, fixHint: string, scrollTarget: string|null, requiredForLocalMp4: boolean }[]} */
export function getMissingSetupChecklist(scan) {
  if (!scan?.modules) return [];
  const modules = getSetupHubModules();
  return modules
    .map((mod) => {
      const row = scan.modules[mod.id];
      const status = row?.status || "unknown";
      return {
        id: mod.id,
        label: mod.label,
        status,
        message: row?.message || "",
        fixHint: mod.fixHint || row?.message || "",
        scrollTarget: mod.scrollTarget || null,
        requiredForLocalMp4: Boolean(mod.requiredForLocalMp4),
      };
    })
    .filter(
      (item) =>
        item.status === "missing" ||
        (item.requiredForLocalMp4 && item.status !== "ready"),
    );
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
    savePersistedSetupScan(browserScan);
    return { ok: true, scan: browserScan };
  }

  const host = await scanSetupEnvironmentFromHost({
    directorSettings: directorSettings || loadDirectorDefaults(),
    openSoraInstallPath: openSoraSettings?.installPath || "",
  });
  if (!host?.ok) return host;
  const scan = buildSetupScanFromHost(host, { coProducerLlmSettings });
  notifySetupHubUpdated(scan);
  savePersistedSetupScan(scan);
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

  const pipelinePath = scan.pipeline?.ok
    ? scan.pipeline.path
    : scan.openSora?.ok
      ? scan.openSora.path
      : "";
  if (pipelinePath) {
    director.localPipelinePath = pipelinePath;
    director.renderBackend = "local-python";
    openSora.installPath = pipelinePath;
  }

  const pythonPath =
    scan.venv?.ok && scan.venv.path
      ? scan.venv.path
      : scan.python?.ok && scan.python.path
        ? scan.python.path
        : "";
  if (pythonPath) {
    director.localPythonPath = pythonPath;
    openSora.pythonPath = pythonPath;
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
