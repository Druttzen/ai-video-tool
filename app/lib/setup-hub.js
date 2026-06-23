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
import { resolveRenderPythonFromScan } from "./video-production-pipeline";

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
  const depsReady =
    moduleStatus(scan, "pip-deps") === "ready" || moduleStatus(scan, "wsl") === "ready";
  const wanReady = Boolean(scan.raw?.pipDeps?.wanRenderReady);
  const openSoraStackReady =
    moduleStatus(scan, "pipeline") === "ready" && moduleStatus(scan, "models") === "ready";
  const localRenderReady =
    moduleStatus(scan, "python") === "ready" &&
    (wanReady || openSoraStackReady) &&
    (!scan.raw?.forceManaged || (moduleStatus(scan, "venv") === "ready" && depsReady));
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
          message: scan.python?.error || "Run Install Addons or Setup Hub → Install all tools (managed Python embed)",
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
          message: scan.pipeline?.error || "Run Install Addons or Setup Hub → Install all tools (managed Open-Sora)",
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
          message: scan.openSora?.error || "Run Install Addons or Setup Hub → Install all tools",
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
      : { status: "optional", message: "Optional — install via Install Addons or Setup Hub → Update all addons" },
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
    "pip-deps": scan.pipDeps?.wanRenderReady
      ? {
          status: "ready",
          message: `${scan.pipDeps.probeModule || "torch"} + CUDA + diffusers ready (Wan local render)`,
        }
      : scan.pipDeps?.winRenderReady
      ? { status: "ready", message: `${scan.pipDeps.probeModule || "torch"} + CUDA + colossalai OK in managed venv` }
      : scan.pipDeps?.ok
        ? {
            status: "optional",
            message: scan.pipDeps.cudaOk
              ? scan.pipDeps.diffusersOk
                ? "torch + diffusers OK — Wan render ready"
                : "torch OK — install diffusers via Update all addons; or use WSL for Open-Sora"
              : "torch OK but no CUDA — NVIDIA GPU required for local Wan render",
          }
        : {
            status: scan.forceManaged ? "missing" : "optional",
            message: "Pip deps missing — Update all addons (installs torch + Open-Sora stack)",
          },
    "music-video-sync": scan.musicVideoSync?.ok
      ? { status: "ready", message: "Librosa beat sync ready for music video paths" }
      : {
          status: scan.electron?.packaged || isElectronApp() ? "missing" : "optional",
          message:
            scan.musicVideoSync?.error ||
            "Install Addons after pip-deps for librosa beat sync (desktop only)",
        },
    models: scan.models?.hasWeights
      ? {
          status: "ready",
          message: `Open-Sora weights ready (${scan.models.count || 0} file(s) in ckpts)`,
        }
      : scan.models?.ok
        ? {
            status: "missing",
            message:
              "Download hpcai-tech/Open-Sora-v2 into addons/open-sora/ckpts (see models/README.txt), then rescan",
          }
        : {
            status: "missing",
            message: "Run Install Addons to create open-sora/ckpts and link models folder",
          },
    wsl: scan.wsl?.ok
      ? { status: "ready", message: `WSL render stack ready — ${scan.wsl.path}` }
      : scan.wsl?.available && scan.wsl?.torchOk
        ? {
            status: "optional",
            message: scan.wsl.tensornvmeOk
              ? "WSL venv missing colossalai — Update all addons"
              : "WSL venv has torch — run Setup Hub WSL fix hint (sudo apt once), then Update all addons for tensornvme/flash-attn",
          }
        : {
            status: "optional",
            message: scan.wsl?.available
              ? "WSL detected — Update all addons for Linux torch/colossalai/tensornvme/flash-attn stack"
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
  if (scan.pipDeps?.wanRenderReady) {
    director.localRenderEngine = "diffusers-wan";
    director.renderBackend = "local-python";
  } else if (pipelinePath) {
    director.localPipelinePath = pipelinePath;
    director.renderBackend = "local-python";
    director.localRenderEngine = "open-sora";
    openSora.installPath = pipelinePath;
  }

  const python = resolveRenderPythonFromScan(scan, director);
  if (python.localPythonPath) {
    director.localPythonPath = python.localPythonPath;
    director.preferWslRender = python.preferWslRender;
    openSora.pythonPath = python.localPythonPath;
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
