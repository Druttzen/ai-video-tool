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
import {
  DEFAULT_LOCAL_RENDER_ENGINE,
  isWinNativeRenderReady,
  normalizeLocalRenderEngine,
  productionRequiredModulesForEngine,
} from "./local-render-engine";
import { mediaNumFramesForDuration } from "./media-duration-limits";
import {
  buildClipSegmentPrompt,
  DEFAULT_PRODUCTION_MAX_CLIPS,
  resolveProductionClipPlan,
} from "./production-clip-plan";

/** @typedef {"idle"|"validating"|"rendering"|"assembled"|"done"|"failed"} ProductionPhase */

export const PRODUCTION_PHASES = ["idle", "validating", "rendering", "assembled", "done", "failed"];

export const PRODUCTION_REQUIRED_MODULES = ["python", "venv", "pip-deps"];

/** @deprecated use productionRequiredModulesForEngine */
export const PRODUCTION_OPEN_SORA_MODULES = ["python", "pipeline", "models"];

const MULTI_CLIP_CAP_NOTE = (planned, total) =>
  `Beat-sync plan: rendering ${planned} of ${total} segments (cap ${DEFAULT_PRODUCTION_MAX_CLIPS})`;

function notifyProductionProgress(onProgress, patch) {
  if (onProgress && patch && typeof patch === "object") {
    onProgress({ updatedAt: Date.now(), ...patch });
  }
}

/**
 * @param {object|null} state
 */
export function formatMultiClipProgressLabel(state) {
  if (!state?.multiClip || !state.clipTotal) return null;
  if (state.clipStatus === "assembling") {
    return `Assembling ${state.clipsRendered || state.clipTotal} clips with audio…`;
  }
  if (state.clipLabel) return state.clipLabel;
  if (state.clipCurrent > 0) {
    return `Clip ${state.clipCurrent}/${state.clipTotal}`;
  }
  return `Beat-sync render (${state.clipTotal} clips)`;
}

/**
 * @param {object|null} state
 */
export function multiClipProgressPercent(state) {
  if (!state?.multiClip || !state.clipTotal) return 0;
  const total = Math.max(1, Number(state.clipTotal) || 1);
  const rendered = Math.max(0, Number(state.clipsRendered) || 0);
  if (state.clipStatus === "assembling") return 100;
  if (state.clipStatus === "rendering" && rendered < total) {
    return Math.min(99, Math.round(((rendered + 0.45) / total) * 100));
  }
  return Math.min(100, Math.round((rendered / total) * 100));
}

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
    multiClip: false,
    clipTotal: 0,
    clipPlannedTotal: 0,
    clipCurrent: 0,
    clipIndex: 0,
    clipsRendered: 0,
    clipStart: null,
    clipEnd: null,
    clipDuration: null,
    clipStatus: null,
    clipLabel: null,
    renderMessage: null,
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
export function shouldPreferWslRender(raw, localRenderEngine = DEFAULT_LOCAL_RENDER_ENGINE) {
  const engine = normalizeLocalRenderEngine(localRenderEngine);
  const wslStack = raw?.wsl;
  if (!wslStack?.path) return false;
  if (raw?.platform && raw.platform !== "win32") return false;

  if (engine === "diffusers-wan") {
    const wslWan = Boolean(wslStack.wanReady);
    if (wslWan) return true;
    if (isWinNativeRenderReady(raw, engine)) return false;
    return false;
  }

  if (!wslStack?.ok) return false;
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
  const engine = normalizeLocalRenderEngine(
    directorSettings.localRenderEngine || DEFAULT_LOCAL_RENDER_ENGINE,
  );
  const wslReady = Boolean(raw.wsl?.ok && raw.wsl.path);

  if (shouldPreferWslRender(raw, engine)) {
    const missing = [];
    if (!raw.pipDeps?.cudaOk) missing.push("CUDA torch");
    if (!raw.pipDeps?.colossalaiOk) missing.push("colossalai");
    const note =
      engine === "diffusers-wan" && raw.wsl?.wanReady
        ? "Using WSL CUDA venv for Wan (Diffusers) — stable path on Windows"
        : missing.length > 0
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

  const directorSettings = loadDirectorSettingsFromStorage();
  const renderEngine = normalizeLocalRenderEngine(directorSettings.localRenderEngine);
  const requiredModules =
    renderEngine === "open-sora"
      ? [...productionRequiredModulesForEngine(renderEngine), "pipeline", "models"]
      : productionRequiredModulesForEngine(renderEngine);

  for (const id of requiredModules) {
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
  const wslWanReady = Boolean(scan?.raw?.wsl?.wanReady);
  const wanReady =
    renderEngine === "diffusers-wan" &&
    (wslWanReady ||
      (pip?.status === "ready" &&
        (pip?.wanRenderReady || (pip?.cudaOk && pip?.diffusersOk))));
  if (renderEngine === "diffusers-wan") {
    if (!wanReady) {
      blockers.push({
        id: "pip-deps",
        message: pip?.message || "CUDA torch + diffusers not ready for Wan render",
        fixHint: "Setup Hub → Update all addons (pip/torch/diffusers). NVIDIA GPU required.",
        scrollTarget: "setup-hub-panel",
      });
    }
  } else if (pip?.status !== "ready" && wsl?.status !== "ready") {
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
  const renderStackReady =
    renderEngine === "diffusers-wan"
      ? Boolean(wanReady || wsl?.status === "ready")
      : pip?.status === "ready" || wsl?.status === "ready";
  const coreModulesReady = requiredModules.every((id) => modules[id]?.status === "ready");
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
  const productionClip = params.productionClip || null;
  const clipIndex = Number(params.clipIndex) || 0;
  const clipTotal = Number(params.clipTotal) || 1;

  const segmentSettings = { ...settings };
  const segmentProject = { ...project };

  if (productionClip) {
    const basePrompt = project.idea || project.prompt || "";
    segmentProject.idea = buildClipSegmentPrompt(basePrompt, productionClip, clipIndex, clipTotal);
    const clipDuration = Number(productionClip.duration) || Number(productionClip.end) - Number(productionClip.start);
    if (clipDuration > 0) {
      segmentSettings.numFrames = mediaNumFramesForDuration(clipDuration, segmentSettings.fps || 24);
    }
    segmentSettings.seed = (Number(segmentSettings.seed) || 42) + clipIndex;
  }

  const plan =
    params.buildPlan ||
    computeBuildPlan(segmentSettings, params.systemStats || loadCachedSystemStats(), {
      useI2v: Boolean(imagePayload?.base64 || project.imageAnalysis),
      promptLength: segmentProject.idea?.length || 0,
    });

  const job = buildDirectorJobPayload(segmentProject, segmentSettings, {
    imagePayload,
    estimatedBuildSeconds: plan.estimatedSeconds,
  });

  job.pythonPath = segmentSettings.localPythonPath;
  if (segmentSettings.preferWslRender) {
    job.preferWslRender = true;
  }

  return { job, settings: segmentSettings, buildPlan: plan, segmentProject };
}

/**
 * @param {object|null} audioAnalysis
 */
export function assessMusicVideoAssembly(audioAnalysis) {
  const clipPlan = audioAnalysis?.beatSync?.clipPlan;
  const totalSegments = Array.isArray(clipPlan) ? clipPlan.length : 0;
  const productionClips = resolveProductionClipPlan(audioAnalysis);
  const segmentCount = productionClips.length >= 2 ? productionClips.length : totalSegments || 1;

  return {
    canAssemble: true,
    segmentCount,
    multiClip: productionClips.length >= 2,
    note:
      productionClips.length >= 2 && totalSegments > productionClips.length
        ? MULTI_CLIP_CAP_NOTE(productionClips.length, totalSegments)
        : null,
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
  const clipPaths = params.clipPaths?.length
    ? params.clipPaths.filter(Boolean)
    : params.renderPath
      ? [params.renderPath]
      : [];
  const renderPath = clipPaths[0] || params.renderPath;
  const { audioAnalysis, audioBuffer, outputPath } = params;
  if (!renderPath) {
    return { ok: false, skipped: true, reason: "No render output" };
  }

  const mv = assessMusicVideoAssembly(audioAnalysis);
  if (!audioAnalysis) {
    return {
      ok: true,
      skipped: true,
      path: renderPath,
      reason: "No audio — using render only",
      clipPaths,
    };
  }

  const scan = params.scan || loadPersistedSetupScan();
  const ffmpegReady = scan?.modules?.ffmpeg?.status === "ready";
  if (!ffmpegReady) {
    return {
      ok: true,
      skipped: true,
      path: renderPath,
      clipPaths,
      reason: "FFmpeg not installed — render saved without audio mux",
    };
  }

  if (!audioBuffer?.byteLength) {
    return {
      ok: true,
      skipped: true,
      path: renderPath,
      clipPaths,
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
    clipPaths,
    audioPath: "",
    audioBuffer,
    fileName: safeName,
    outputPath: out,
  });

  if (!result?.ok) {
    return { ok: false, error: result?.error || "Audio mux failed", path: renderPath, clipPaths };
  }

  return {
    ok: true,
    skipped: false,
    path: result.path || out,
    clipPaths,
    message: result.message,
    multiClip: mv.multiClip,
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
  const onProgress = params.onProgress || (() => {});

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

  const { segmentProject } = buildProductionJob({
    project: params.project,
    imagePayload: params.imagePayload,
    scan: readiness.scan,
    directorSettings: params.directorSettings,
    systemStats: params.systemStats,
  });

  if (!segmentProject.idea && !params.project?.idea) {
    onPhase("failed");
    return { ok: false, phase: "failed", error: "Project prompt is empty — apply agent plan first" };
  }

  saveDirectorSettingsToStorage(
    buildProductionDirectorSettings({
      project: params.project,
      scan: readiness.scan,
      directorSettings: params.directorSettings,
    }),
  );

  const clipPlan = resolveProductionClipPlan(
    params.audioAnalysis,
    params.maxProductionClips ?? DEFAULT_PRODUCTION_MAX_CLIPS,
  );
  const multiClip = clipPlan.length >= 2;
  const segments = multiClip ? clipPlan : [null];
  if (multiClip) {
    const capNote = MULTI_CLIP_CAP_NOTE(clipPlan.length, params.audioAnalysis.beatSync.clipPlan.length);
    onMessage(capNote);
    notifyProductionProgress(onProgress, {
      multiClip: true,
      clipTotal: segments.length,
      clipPlannedTotal: params.audioAnalysis.beatSync.clipPlan.length,
      clipsRendered: 0,
      clipCurrent: 0,
      clipIndex: -1,
      clipStatus: "planned",
      multiClipNote: capNote,
      clipLabel: capNote,
    });
  } else {
    notifyProductionProgress(onProgress, { multiClip: false, clipTotal: 0, clipsRendered: 0 });
  }

  onPhase("rendering");
  const clipPaths = [];
  let lastLaunch = null;
  let lastSettings = null;

  for (let i = 0; i < segments.length; i += 1) {
    const productionClip = segments[i];
    const clipLabel = multiClip
      ? `Clip ${i + 1}/${segments.length}: ${productionClip.duration}s (${productionClip.start}s–${productionClip.end}s)`
      : null;

    if (multiClip) {
      notifyProductionProgress(onProgress, {
        multiClip: true,
        clipIndex: i,
        clipCurrent: i + 1,
        clipTotal: segments.length,
        clipsRendered: i,
        clipStart: productionClip.start,
        clipEnd: productionClip.end,
        clipDuration: productionClip.duration,
        clipStatus: "launching",
        clipLabel,
        renderMessage: null,
      });
    }
    const { settings: clipSettings, buildPlan: clipPlan_, segmentProject } = buildProductionJob({
      project: params.project,
      imagePayload: params.imagePayload,
      scan: readiness.scan,
      directorSettings: params.directorSettings,
      systemStats: params.systemStats,
      productionClip,
      clipIndex: i,
      clipTotal: segments.length,
    });
    lastSettings = clipSettings;

    if (multiClip) {
      onMessage(`${clipLabel}…`);
    } else {
      onMessage(
        clipSettings.renderPythonSource === "wsl"
          ? "Launching render via WSL CUDA…"
          : "Launching Director local render…",
      );
    }

    saveDirectorSettingsToStorage(clipSettings);

    const launch = await sendDirectorJob({
      project: segmentProject,
      settings: clipSettings,
      imagePayload: params.imagePayload,
      buildPlan: clipPlan_,
    });
    lastLaunch = launch;

    if (!launch?.ok) {
      onPhase("failed");
      return {
        ok: false,
        phase: "failed",
        error: launch?.error || "Failed to launch render",
        hints: formatFailureHints(readiness, launch?.error),
        clipPaths,
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

    if (!multiClip) {
      onMessage("Rendering… this may take several minutes");
    } else {
      notifyProductionProgress(onProgress, {
        clipStatus: "rendering",
        renderMessage: "Rendering segment…",
      });
    }

    const renderResult = await waitForDirectorRenderComplete({
      logPath: launch.logPath,
      pid: launch.pid,
      startedAt: launch.startedAt,
      estimatedMs: launch.estimatedMs || clipPlan_.estimatedSeconds * 1000,
      onProgress: (st) => {
        if (multiClip) {
          notifyProductionProgress(onProgress, {
            clipStatus: "rendering",
            renderMessage: st.message || null,
          });
        } else if (st.message) {
          onMessage(st.message);
        }
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
        clipPaths,
      };
    }

    if (renderResult.outputVideoPath) {
      clipPaths.push(renderResult.outputVideoPath);
    }

    if (multiClip) {
      notifyProductionProgress(onProgress, {
        clipsRendered: i + 1,
        clipStatus: i + 1 < segments.length ? "clip-complete" : "clips-rendered",
        clipLabel:
          i + 1 < segments.length
            ? `Finished clip ${i + 1}/${segments.length} — starting next…`
            : `All ${segments.length} clips rendered`,
        renderMessage: null,
      });
    }
  }

  let finalPath = clipPaths[clipPaths.length - 1] || null;
  let assembly = null;

  if (params.audioAnalysis) {
    onPhase("assembled");
    if (multiClip) {
      notifyProductionProgress(onProgress, {
        clipStatus: "assembling",
        clipsRendered: clipPaths.length,
        clipTotal: segments.length,
        multiClip: true,
        clipLabel: `Assembling ${clipPaths.length} clips with audio…`,
      });
    }
    onMessage(
      multiClip
        ? `Assembling ${clipPaths.length} clips with audio…`
        : "Muxing audio with rendered clip…",
    );
    assembly = await maybeAssembleWithAudio({
      renderPath: finalPath,
      clipPaths,
      audioAnalysis: params.audioAnalysis,
      audioBuffer: params.audioBuffer,
      scan: readiness.scan,
    });
    if (assembly.ok && assembly.path) {
      finalPath = assembly.path;
    }
    if (assembly.skipped && assembly.reason) {
      onMessage(assembly.reason);
    }
  }

  onPhase("done");
  onMessage(finalPath ? `Done — ${finalPath.split(/[/\\]/).pop()}` : "Render complete");

  const mv = assessMusicVideoAssembly(params.audioAnalysis);

  return {
    ok: true,
    phase: "done",
    outputPath: finalPath,
    renderPath: clipPaths[0] || null,
    clipPaths,
    assembly,
    launch: lastLaunch,
    readiness,
    settings: lastSettings,
    multiClip,
    multiClipNote: mv.note,
  };
}

export async function revealProductionOutput(filePath) {
  if (!filePath) return { ok: false, error: "No output path" };
  return revealDirectorOutput(filePath);
}
