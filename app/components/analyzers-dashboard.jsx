"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  buildAnalyzersExport,
  determineBuildFromAnalyzersAndRequest,
  executeAnalyzerBuildPlan,
  probeAnalyzersAddon,
  summarizeAnalyzersPair,
  summarizeAudioAnalysis,
  summarizeImageAnalysis,
} from "../lib/analyzers-addon";
import { buildCanvasPayloadFromWorkspace } from "../lib/canvas-payload";
import { isElectronApp, openCanvasDashboard } from "../lib/electron-bridge";
import { useProjectWorkspace } from "../context/project-workspace-context";

function StatCell({ label, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
      <div className="text-sm font-bold text-fuchsia-100">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-white/45">{label}</div>
    </div>
  );
}

export const AnalyzersDashboard = memo(function AnalyzersDashboard() {
  const ws = useProjectWorkspace();
  const [probe, setProbe] = useState(null);
  const [applyBusy, setApplyBusy] = useState(false);

  const requestCtx = useMemo(
    () => ({
      idea: ws.idea,
      agentDraft: ws.agentDraft,
      manuscriptDraft: ws.manuscriptDraft,
      agentMessages: ws.agentMessages,
      sunoPasteStyle: ws.sunoPasteStyle,
      sunoPasteLyrics: ws.sunoPasteLyrics,
    }),
    [
      ws.idea,
      ws.agentDraft,
      ws.manuscriptDraft,
      ws.agentMessages,
      ws.sunoPasteStyle,
      ws.sunoPasteLyrics,
    ],
  );

  const audio = useMemo(() => summarizeAudioAnalysis(ws.audioAnalysis), [ws.audioAnalysis]);
  const image = useMemo(() => summarizeImageAnalysis(ws.imageAnalysis), [ws.imageAnalysis]);
  const pair = useMemo(
    () => summarizeAnalyzersPair(ws.audioAnalysis, ws.imageAnalysis),
    [ws.audioAnalysis, ws.imageAnalysis],
  );

  const buildPlan = useMemo(
    () =>
      determineBuildFromAnalyzersAndRequest({
        audioAnalysis: ws.audioAnalysis,
        imageAnalysis: ws.imageAnalysis,
        ...requestCtx,
      }),
    [ws.audioAnalysis, ws.imageAnalysis, requestCtx],
  );

  useEffect(() => {
    let cancelled = false;
    void probeAnalyzersAddon().then((result) => {
      if (!cancelled) setProbe(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onExport = useCallback(() => {
    const payload = buildAnalyzersExport(ws.audioAnalysis, ws.imageAnalysis, requestCtx);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "analyzers-export.json";
    a.click();
    URL.revokeObjectURL(url);
    ws.setStatusWithTime("Exported analyzer snapshot", "info");
  }, [ws, requestCtx]);

  const onCopy = useCallback(async () => {
    const payload = buildAnalyzersExport(ws.audioAnalysis, ws.imageAnalysis, requestCtx);
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      ws.setStatusWithTime("Analyzer snapshot copied", "info");
    } catch {
      ws.setStatusWithTime("Could not copy analyzer snapshot", "error");
    }
  }, [ws, requestCtx]);

  const onApplyBuildPlan = useCallback(async () => {
    setApplyBusy(true);
    try {
      const result = await executeAnalyzerBuildPlan(buildPlan, {
        applyAudioVisualMusicVideo: ws.applyAudioVisualMusicVideo,
        applyAudioToMusicVideo: ws.applyAudioToMusicVideo,
        applyMusicVideoFromBoth: ws.applyMusicVideoFromBoth,
        applySunoPasteToMusicVideo: ws.applySunoPasteToMusicVideo,
        applyImageToSunoStyle: ws.applyImageToSunoStyle,
        setAgentDraft: ws.setAgentDraft,
        agentDraft: ws.agentDraft,
        openCanvas: async () => {
          if (!isElectronApp()) return { ok: false, error: "Canvas requires desktop app" };
          return openCanvasDashboard(
            buildCanvasPayloadFromWorkspace({
              idea: ws.idea,
              tempo: ws.tempo,
              structure: ws.structure,
              selectedGenres: ws.selectedGenres,
              selectedRhythms: ws.selectedRhythms,
              selectedSounds: ws.selectedSounds,
              audioAnalysis: ws.audioAnalysis,
              imageAnalysis: ws.imageAnalysis,
              production: ws.agentProductionState,
              agentProductionState: ws.agentProductionState,
              coProducerLlmSettings: ws.coProducerLlmSettings,
              agentPhase: ws.agentProductionPhase,
              agentMessages: ws.agentMessages,
              agentDraft: ws.agentDraft,
              sunoPasteStyle: ws.sunoPasteStyle,
              sunoPasteLyrics: ws.sunoPasteLyrics,
            }),
          );
        },
      });
      ws.setStatusWithTime(result.message, result.ok ? "info" : "warning");
    } finally {
      setApplyBusy(false);
    }
  }, [buildPlan, ws]);

  const browserReady = probe?.browser !== false;
  const librosaReady = probe?.librosa?.ok;

  return (
    <section
      className="mt-4 rounded-2xl border border-fuchsia-400/25 bg-fuchsia-500/5 p-4"
      data-testid="analyzers-dashboard"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-fuchsia-100/90">
          Music & picture analyzers
        </h3>
        <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wide">
          <span
            className={
              browserReady
                ? "rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-emerald-100"
                : "rounded-full border border-amber-400/35 bg-amber-500/10 px-2 py-0.5 text-amber-100"
            }
            data-testid="analyzers-browser-status"
          >
            Browser DSP {browserReady ? "ready" : "unavailable"}
          </span>
          <span
            className={
              librosaReady
                ? "rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-emerald-100"
                : "rounded-full border border-white/15 px-2 py-0.5 text-white/45"
            }
            data-testid="analyzers-librosa-status"
          >
            Librosa refine {librosaReady ? "ready" : "optional"}
          </span>
          <span
            className={
              pair.pathEReady
                ? "rounded-full border border-cyan-400/40 bg-cyan-500/15 px-2 py-0.5 text-cyan-100"
                : "rounded-full border border-white/15 px-2 py-0.5 text-white/45"
            }
            data-testid="analyzers-path-e-status"
          >
            Path E {pair.pathEReady ? "ready" : "—"}
          </span>
        </div>
      </div>

      <p className="mb-3 text-[11px] text-white/50">{pair.hint}</p>

      {buildPlan.ok ? (
        <article
          className="mb-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3"
          data-testid="analyzers-build-plan"
        >
          <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-emerald-100">
            Build plan (audio + picture + chat)
          </h4>
          <p className="text-sm font-semibold text-white">{buildPlan.title}</p>
          <p className="mt-1 text-[11px] text-white/60">{buildPlan.reasoning}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold uppercase">
            <span className="rounded-full border border-white/15 px-2 py-0.5 text-white/70">
              {buildPlan.buildTarget === "canvas"
                ? "Canvas"
                : buildPlan.buildTarget === "music-video"
                  ? `MV Path ${buildPlan.workflowPath}`
                  : "Director"}
            </span>
            {buildPlan.multiClip ? (
              <span className="rounded-full border border-cyan-400/35 px-2 py-0.5 text-cyan-100">
                {buildPlan.clipCount} clips
              </span>
            ) : null}
            {buildPlan.lipSync ? (
              <span className="rounded-full border border-violet-400/35 px-2 py-0.5 text-violet-100">
                Lip-sync
              </span>
            ) : null}
          </div>
          <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-2 text-[10px] text-white/55">
            {buildPlan.directorBrief}
          </pre>
          <p className="mt-2 text-[10px] text-white/45">{buildPlan.canvasSummary}</p>
        </article>
      ) : (
        <p className="mb-3 text-xs text-white/40" data-testid="analyzers-build-plan-empty">
          {buildPlan.reasoning}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-violet-400/20 bg-black/20 p-3">
          <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-violet-100/80">
            Audio analyzer
          </h4>
          {audio.ready ? (
            <>
              <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <StatCell label="BPM" value={audio.bpm ?? "—"} />
                <StatCell label="Energy" value={audio.energy ?? "—"} />
                <StatCell label="Segments" value={audio.clipCount ?? 0} />
              </div>
              <p className="text-[11px] text-white/55">
                {audio.fileName} · {audio.durationSec.toFixed(1)}s · {audio.highlightLabel}
              </p>
              <p className="mt-1 text-[10px] text-white/40">
                Key {audio.key ?? "—"} · Highlight {audio.highlightRange}
                {audio.beatSyncReady ? ` · beat sync (${audio.beatSyncSource})` : ""}
              </p>
            </>
          ) : (
            <p className="text-xs text-white/40">{audio.hint}</p>
          )}
        </article>

        <article className="rounded-xl border border-fuchsia-400/20 bg-black/20 p-3">
          <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-fuchsia-100/80">
            Picture analyzer
          </h4>
          {image.ready ? (
            <>
              <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <StatCell label="Hue" value={image.hueLabel ?? image.dominantHue ?? "—"} />
                <StatCell label="Temp" value={image.colorTemperature ?? "—"} />
                <StatCell label="Aspect" value={image.aspectLabel ?? "—"} />
              </div>
              <p className="text-[11px] text-white/55">{image.fileName}</p>
              <p className="mt-1 text-[10px] text-white/40">
                {image.visualMood} · {image.avgColor}
              </p>
              <p className="mt-1 text-[10px] text-white/40">
                Genres {image.genreCount} · Sounds {image.soundCount} · Rhythms {image.rhythmCount}
              </p>
            </>
          ) : (
            <p className="text-xs text-white/40">{image.hint}</p>
          )}
        </article>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="analyzers-apply-build-plan"
          disabled={!buildPlan.ok || applyBusy}
          onClick={() => void onApplyBuildPlan()}
          className="rounded-xl bg-emerald-300 px-3 py-1.5 text-xs font-bold text-black hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {applyBusy ? "Applying…" : "Apply build plan"}
        </button>
        <button
          type="button"
          data-testid="analyzers-export-json"
          disabled={!audio.ready && !image.ready}
          onClick={onExport}
          className="rounded-xl bg-fuchsia-300 px-3 py-1.5 text-xs font-bold text-black hover:bg-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Export snapshot
        </button>
        <button
          type="button"
          data-testid="analyzers-copy-json"
          disabled={!audio.ready && !image.ready}
          onClick={() => void onCopy()}
          className="rounded-xl border border-white/15 bg-black/30 px-3 py-1.5 text-xs font-bold text-white/85 hover:bg-white/10 disabled:opacity-40"
        >
          Copy JSON
        </button>
        {audio.ready ? (
          <button
            type="button"
            data-testid="analyzers-dash-merge-audio"
            onClick={() => {
              ws.captureSnapshot("before audio merge");
              ws.applyAudioToSunoStyle();
            }}
            className="rounded-xl border border-violet-400/30 bg-violet-500/15 px-3 py-1.5 text-xs font-bold text-violet-100 hover:bg-violet-500/25"
          >
            Merge audio → Suno
          </button>
        ) : null}
        {image.ready ? (
          <button
            type="button"
            data-testid="analyzers-dash-merge-image"
            onClick={() => {
              ws.captureSnapshot("before image merge");
              ws.applyImageToSunoStyle();
            }}
            className="rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/15 px-3 py-1.5 text-xs font-bold text-fuchsia-100 hover:bg-fuchsia-500/25"
          >
            Merge image → Suno
          </button>
        ) : null}
      </div>

      {!isElectronApp() ? (
        <p className="mt-2 text-[10px] text-white/35">
          Desktop app required for librosa beat refine, Canvas, and local MV produce.
        </p>
      ) : null}
    </section>
  );
});
