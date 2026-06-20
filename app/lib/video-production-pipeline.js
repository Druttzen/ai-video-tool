/**
 * End-to-end video production — Setup Hub readiness → Director render → optional audio mux.
 */
import { buildDirectorJobPayload } from "./director-prompt-builder";
import { sendDirectorJob } from "./director-launch";
import { computeBuildPlan } from "./video-build-estimate";
import {
  assembleMusicVideoFromHost,
  getDirectorBuildStatus,
  isElectronApp,
  revealDirectorOutput,
  scanSetupEnvironmentFromHost,
} from "./electron-bridge";
import { loadDirectorSettingsFromStorage, saveDirectorSettingsToStorage } from "./director-settings";
import {
  buildSetupScanFromHost,
  getMissingSetupChecklist,
  loadPersistedSetupScan,
  summarizeSetupScan,
} from "./setup-hub";
import { loadCachedSystemStats } from "./system-stats";
import { scrollToPanel } from "./music-video-workflows";

/** @typedef {"idle"|"validating"|"rendering"|"assembled"|"done"|"failed"} ProductionPhase */

export const PRODUCTION_PHASES = ["idle", "validating", "rendering", "assembled", "done", "failed"];

export const PRODUCTION_REQUIRED_MODULES = ["python", "pipeline", "models"];

const MULTI_CLIP_NOTE =
  "Full multi-clip music videos (beat-sync clip plans) are phase 2 — this run renders one Director segment. Use Director for each clip or wait for multi-segment pipeline.";

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 6 * 60 * 60 * 1000;

/** @returns {object} */
export function createDefaultProductionState() {
  return {
    phase: "idle",
    updatedAt: null,
    lastOutputPath: null,
    assembledOutputPath: null,
    lastError: null,
    logPath: null,
    jobPath: null,
    multiClipNote: null,
    renderPythonSource: null,
  };
}

/**
 * @param {unknown} raw
 */
export function normalizeProductionState(raw) {
  const base = createDefaultProductionState();
  if (!raw || typeof raw !== "object") return base;
  const phase = PRODUCTION_PHASES.includes(raw.phase) ? raw.phase : base.phase;
  return {
    ...base,
    ...raw,
    phase,
  };
}

/**
 * @param {object} session
 * @param {Partial<object>} patch
 */
export function mergeProductionSession(session, patch = {}) {
  const base = session || {};
  const production = normalizeProductionState({
    ...(base.production || createDefaultProductionState()),
    ...patch,
    updatedAt: Date.now(),
  });
  return { ...base, production };
}

/**
 * True when WSL Linux stack is render-ready and Windows managed venv is not.
 * @param {object} raw — host scan raw object
 */
export function shouldPreferWslRender(raw) {
  const wslStack = raw?.wsl;
  if (!wslStack?.ok || !wslStack?.path) return false;
  if (raw?.platform && raw.platform !== "win32") return false;
  const winRenderReady = Boolean(
    raw?.pipDeps?.winRenderReady ?? (raw?.pipDeps?.ok && raw?.pipDeps?.cudaOk !== false),
  );
  return !winRenderReady;
}

/**
 * Prefer WSL Linux venv when Windows managed venv lacks CUDA torch or colossalai.
 * @param {object} hostScanRaw — scan.raw from Setup Hub or host scan
 * @param {object} [directorSettings]
 */
export function resolveRenderPythonFromScan(hostScanRaw, directorSettings = {}) {
  const raw = hostScanRaw?.raw || hostScanRaw || {};
  const wslReady = Boolean(raw.wsl?.ok && raw.wsl.path);

  if (shouldPreferWslRender(raw)) {
    const missing = [];
    if (!raw.pipDeps?.cudaOk) missing.push("CUDA torch");
    if (!raw.pipDeps?.colossalaiOk) missing.push("colossalai");
    const note =
      missing.length > 0
        ? `Using WSL CUDA venv — Windows venv missing ${missing.join(" + ")}`
        : "Using WSL CUDA venv for local Open-Sora render";
    return {
      localPythonPath: String(raw.wsl.path),
      source: "wsl",
      note,
      preferWslRender: true,
    };
  }

  if (wslReady && !raw.pipDeps?.ok && raw.wsl?.torchOk) {
    return {
      localPythonPath: String(raw.wsl.path),
      source: "wsl",
      note: "Using WSL venv — Windows venv has no torch",
      preferWslRender: true,
    };
  }

  if (raw.venv?.ok && raw.venv.path) {
    return {
      localPythonPath: String(raw.venv.path),
      source: "venv",
      note: null,
      preferWslRender: false,
    };
  }

  if (raw.python?.ok && raw.python.path) {
    return {
      localPythonPath: String(raw.python.path),
      source: "python",
      note: null,
      preferWslRender: false,
    };
  }

  const fallback = String(directorSettings.localPythonPath || "python").trim() || "python";
  return {
    localPythonPath: fallback,
    source: "director-settings",
    note: null,
    preferWslRender: false,
  };
}

/**
 * @param {object} scan — Setup Hub scan (modules + raw)
 */
export function evaluateProductionReadiness(scan) {
  if (!isElectronApp()) {
    return {
      ok: false,
      ready: false,
      blockers: ["Local MP4 production requires the AI Video Creator desktop app"],
      warnings: [],
      hints: [{ label: "Use export mode", target: "director-panel" }],
      summary: { label: "Browser — export only", localRenderReady: false },
    };
  }

  const modules = scan?.modules || {};
  const blockers = [];
  const warnings = [];
  const hints = [];

  for (const id of PRODUCTION_REQUIRED_MODULES) {
    const row = modules[id];
    if (!row || row.status !== "ready") {
      blockers.push({
        id,
        message: row?.message || `${id} not ready`,
        fixHint: row?.message || `Fix ${id} in Setup Hub`,
        scrollTarget: "setup-hub-panel",
      });
    }
  }

  const pip = modules["pip-deps"];
  const wsl = modules.wsl;
  if (pip?.status !== "ready" && wsl?.status !== "ready") {
    blockers.push({
      id: "pip-deps",
      message: pip?.message || "torch/CUDA stack not ready in managed venv",
      fixHint:
        "Setup Hub → Update all addons (pip/torch). On Windows, colossalai needs WSL2 — enable WSL addon (sudo apt once for cmake/build-essential/libaio-dev; flash-attn optional).",
      scrollTarget: "setup-hub-panel",
    });
  }

  const ffmpeg = modules.ffmpeg;
  if (ffmpeg?.status !== "ready") {
    warnings.push({
      id: "ffmpeg",
      message: "FFmpeg optional — render MP4 works; audio mux needs FFmpeg addon",
    });
  }

  if (blockers.length) {
    hints.push({
      label: "Open Setup Hub",
      target: "setup-hub-panel",
      action: "scroll",
    });
  }

  const summary = summarizeSetupScan(scan);
  const renderStackReady = pip?.status === "ready" || wsl?.status === "ready";
  const coreModulesReady = PRODUCTION_REQUIRED_MODULES.every(
    (id) => modules[id]?.status === "ready",
  );
  const ready = blockers.length === 0 && coreModulesReady && renderStackReady;

  return {
    ok: true,
    ready,
    blockers: blockers.map((b) => b.message),
    blockerDetails: blockers,
    warnings: warnings.map((w) => w.message),
    warningDetails: warnings,
    hints,
    summary,
  };
}

/**
 * Load persisted scan or run a fresh host scan.
 * @param {object} [opts]
 */
export async function loadProductionSetupScan(opts = {}) {
  const persisted = loadPersistedSetupScan();
  if (persisted?.modules && !opts.forceRefresh) {
    return { scan: persisted, source: "persisted" };
  }

  if (!isElectronApp()) {
    const browser = buildSetupScanFromHost(
      {
        ok: true,
        scan: {
          scannedAt: new Date().toISOString(),
          electron: { packaged: false },
          python: { ok: false },
          pipeline: { ok: false },
          models: { ok: false, hasWeights: false },
        },
      },
      { coProducerLlmSettings: opts.coProducerLlmSettings },
    );
    return { scan: browser, source: "browser" };
  }

  const host = await scanSetupEnvironmentFromHost({
    directorSettings: opts.directorSettings || loadDirectorSettingsFromStorage(),
    openSoraInstallPath: opts.openSoraInstallPath || "",
  });
  if (!host?.ok) {
    return { ok: false, error: host?.error || "Setup scan failed", scan: persisted };
  }
  const scan = buildSetupScanFromHost(host, { coProducerLlmSettings: opts.coProducerLlmSettings });
  return { ok: true, scan, source: "host" };
}

/**
 * @param {object} params
 */
export async function checkProductionReadiness(params = {}) {
  const loaded = await loadProductionSetupScan(params);
  if (loaded.ok === false && !loaded.scan) {
    return {
      ok: false,
      ready: false,
      error: loaded.error,
      blockers: [loaded.error],
      hints: [{ label: "Open Setup Hub", target: "setup-hub-panel" }],
    };
  }
  const evaluation = evaluateProductionReadiness(loaded.scan);
  return {
    ...evaluation,
    scan: loaded.scan,
    scanSource: loaded.source,
    missingChecklist: getMissingSetupChecklist(loaded.scan),
  };
}

/**
 * @param {object} params
 */
export function buildProductionDirectorSettings(params = {}) {
  const base = { ...loadDirectorSettingsFromStorage(), ...(params.directorSettings || {}) };
  const scanRaw = params.scan?.raw || params.hostScan?.scan || params.scan;
  const python = resolveRenderPythonFromScan(scanRaw, base);

  const pipelinePath =
    scanRaw?.pipeline?.ok && scanRaw.pipeline.path
      ? scanRaw.pipeline.path
      : base.localPipelinePath;

  return {
    ...base,
    renderBackend: "local-python",
    localPipelinePath: pipelinePath || base.localPipelinePath,
    localPythonPath: python.localPythonPath,
    preferWslRender: python.preferWslRender,
    renderPythonSource: python.source,
  };
}

/**
 * @param {object} params
 */
export function buildProductionJob(params = {}) {
  const settings = buildProductionDirectorSettings(params);
  const project = params.project || {};
  const imagePayload = params.imagePayload || null;
  const plan =
    params.buildPlan ||
    computeBuildPlan(settings, params.systemStats || loadCachedSystemStats(), {
      useI2v: Boolean(imagePayload?.base64 || project.imageAnalysis),
      promptLength: project.idea?.length || 0,
    });

  const job = buildDirectorJobPayload(project, settings, {
    imagePayload,
    estimatedBuildSeconds: plan.estimatedSeconds,
  });

  job.pythonPath = settings.localPythonPath;
  if (settings.preferWslRender) {
    job.preferWslRender = true;
  }

  return { job, settings, buildPlan: plan };
}

/**
 * @param {object|null} audioAnalysis
 */
export function assessMusicVideoAssembly(audioAnalysis) {
  const clipPlan = audioAnalysis?.beatSync?.clipPlan;
  const segmentCount = Array.isArray(clipPlan) ? clipPlan.length : 0;
  if (segmentCount > 1) {
    return {
      canAssemble: false,
      segmentCount,
      note: MULTI_CLIP_NOTE,
    };
  }
  return {
    canAssemble: true,
    segmentCount: segmentCount || 1,
    note: segmentCount === 1 ? null : MULTI_CLIP_NOTE,
  };
}

/**
 * @param {object} params
 */
export async function waitForDirectorRenderComplete(params = {}) {
  const { logPath, pid, startedAt, estimatedMs, pollIntervalMs, timeoutMs, onProgress } = params;
  if (!logPath) {
    return { ok: false, error: "Missing render log path" };
  }

  const interval = pollIntervalMs || POLL_INTERVAL_MS;
  const deadline = Date.now() + (timeoutMs || POLL_TIMEOUT_MS);
  let lastStatus = null;

  while (Date.now() < deadline) {
    const res = await getDirectorBuildStatus({
      logPath,
      pid,
      startedAt,
      estimatedMs,
    });
    if (res?.ok) {
      lastStatus = res;
      onProgress?.(res);
      if (res.status === "complete") {
        return {
          ok: true,
          outputVideoPath: res.outputVideoPath || null,
          message: res.message,
          status: res,
        };
      }
      if (res.status === "failed" || res.status === "cancelled") {
        return {
          ok: false,
          error: res.message || "Render failed",
          status: res,
          logTail: res.logTail,
        };
      }
    }
    await new Promise((r) => setTimeout(r, interval));
  }

  return {
    ok: false,
    error: "Render timed out — check Director log",
    status: lastStatus,
  };
}

/**
 * @param {object} params
 */
export async function maybeAssembleWithAudio(params = {}) {
  const { renderPath, audioAnalysis, audioBuffer, outputPath } = params;
  if (!renderPath) {
    return { ok: false, skipped: true, reason: "No render output" };
  }

  const mv = assessMusicVideoAssembly(audioAnalysis);
  if (!audioAnalysis) {
    return { ok: true, skipped: true, path: renderPath, reason: "No audio — using render only" };
  }

  if (!mv.canAssemble) {
    return {
      ok: true,
      skipped: true,
      path: renderPath,
      reason: mv.note,
      multiClip: true,
    };
  }

  const scan = params.scan || loadPersistedSetupScan();
  const ffmpegReady = scan?.modules?.ffmpeg?.status === "ready";
  if (!ffmpegReady) {
    return {
      ok: true,
      skipped: true,
      path: renderPath,
      reason: "FFmpeg not installed — render saved without audio mux",
    };
  }

  if (!audioBuffer?.byteLength) {
    return {
      ok: true,
      skipped: true,
      path: renderPath,
      reason: "Audio file not in cache — attach track before produce",
    };
  }

  const stamp = Date.now();
  const safeName = String(audioAnalysis.fileName || "track.wav").replace(/[^\w.\-]+/g, "_");
  const baseOut =
    outputPath ||
    (renderPath.includes(".")
      ? renderPath.replace(/\.[^.]+$/, `-with-audio-${stamp}.mp4`)
      : `${renderPath}-with-audio-${stamp}.mp4`);
  const out = baseOut.endsWith(".mp4") ? baseOut : `${baseOut}.mp4`;

  const result = await assembleMusicVideoFromHost({
    clipPaths: [renderPath],
    audioPath: "",
    audioBuffer,
    fileName: safeName,
    outputPath: out,
  });

  if (!result?.ok) {
    return { ok: false, error: result?.error || "Audio mux failed", path: renderPath };
  }

  return {
    ok: true,
    skipped: false,
    path: result.path || out,
    message: result.message,
  };
}

function formatFailureHints(readiness, renderError) {
  const hints = [...(readiness?.hints || [])];
  const err = String(renderError || "").toLowerCase();
  if (err.includes("tensornvme") || err.includes("libaio")) {
    hints.push({
      label: "Install tensornvme in WSL (sudo apt once — see Setup Hub WSL fix hint)",
      target: "setup-hub-panel",
    });
  } else if (err.includes("flash_attn") || err.includes("flash-attn")) {
    hints.push({
      label: "flash-attn missing — Update WSL addons or use inference stub (Setup Hub)",
      target: "setup-hub-panel",
    });
  } else if (err.includes("cuda") || err.includes("colossalai")) {
    hints.push({
      label: "Fix torch/CUDA in Setup Hub",
      target: "setup-hub-panel",
    });
  }
  if (err.includes("pipeline")) {
    hints.push({ label: "Set pipeline in Director → Advanced", target: "director-panel" });
  }
  return hints;
}

/**
 * Full pipeline: readiness → launch → poll → optional mux.
 * @param {object} params
 */
export async function runFullProduction(params = {}) {
  const onPhase = params.onPhase || (() => {});
  const onMessage = params.onMessage || (() => {});

  onPhase("validating");
  onMessage("Checking Setup Hub readiness…");

  const readiness = await checkProductionReadiness({
    forceRefresh: params.forceSetupScan,
    directorSettings: params.directorSettings,
    coProducerLlmSettings: params.coProducerLlmSettings,
  });

  if (!readiness.ready) {
    onPhase("failed");
    return {
      ok: false,
      phase: "failed",
      error: readiness.blockers?.[0] || "Not ready for local render",
      readiness,
      hints: readiness.hints,
    };
  }

  const { job, settings, buildPlan } = buildProductionJob({
    project: params.project,
    imagePayload: params.imagePayload,
    scan: readiness.scan,
    directorSettings: params.directorSettings,
    systemStats: params.systemStats,
  });

  if (!job.prompt) {
    onPhase("failed");
    return { ok: false, phase: "failed", error: "Project prompt is empty — apply agent plan first" };
  }

  saveDirectorSettingsToStorage(settings);

  onPhase("rendering");
  onMessage(
    settings.renderPythonSource === "wsl"
      ? "Launching render via WSL CUDA…"
      : "Launching Director local render…",
  );

  const launch = await sendDirectorJob({
    project: params.project,
    settings,
    imagePayload: params.imagePayload,
    buildPlan,
  });

  if (!launch?.ok) {
    onPhase("failed");
    return {
      ok: false,
      phase: "failed",
      error: launch?.error || "Failed to launch render",
      hints: formatFailureHints(readiness, launch?.error),
    };
  }

  if (launch.exportOnly) {
    onPhase("failed");
    return {
      ok: false,
      phase: "failed",
      error: "Export-only mode — enable local GPU render in Director → Advanced",
    };
  }

  onMessage("Rendering… this may take several minutes");

  const renderResult = await waitForDirectorRenderComplete({
    logPath: launch.logPath,
    pid: launch.pid,
    startedAt: launch.startedAt,
    estimatedMs: launch.estimatedMs || buildPlan.estimatedSeconds * 1000,
    onProgress: (st) => {
      if (st.message) onMessage(st.message);
    },
  });

  if (!renderResult.ok) {
    onPhase("failed");
    return {
      ok: false,
      phase: "failed",
      error: renderResult.error,
      logPath: launch.logPath,
      hints: formatFailureHints(readiness, renderResult.error),
    };
  }

  let finalPath = renderResult.outputVideoPath;
  let assembly = null;

  if (params.audioAnalysis) {
    onPhase("assembled");
    onMessage("Muxing audio with rendered clip…");
    assembly = await maybeAssembleWithAudio({
      renderPath: finalPath,
      audioAnalysis: params.audioAnalysis,
      audioBuffer: params.audioBuffer,
      scan: readiness.scan,
    });
    if (assembly.ok && assembly.path) {
      finalPath = assembly.path;
    }
    if (assembly.multiClip) {
      onMessage(assembly.reason || MULTI_CLIP_NOTE);
    }
  }

  onPhase("done");
  onMessage(finalPath ? `Done — ${finalPath.split(/[/\\]/).pop()}` : "Render complete");

  return {
    ok: true,
    phase: "done",
    outputPath: finalPath,
    renderPath: renderResult.outputVideoPath,
    assembly,
    launch,
    readiness,
    settings,
    multiClipNote: assessMusicVideoAssembly(params.audioAnalysis).note,
  };
}

export function scrollToProductionHint(target) {
  scrollToPanel(target || "setup-hub-panel");
}

export async function revealProductionOutput(filePath) {
  if (!filePath) return { ok: false, error: "No output path" };
  return revealDirectorOutput(filePath);
}
