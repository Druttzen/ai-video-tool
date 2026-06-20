"use client";

import { memo, useCallback, useState } from "react";
import { Panel } from "./ui-blocks";
import { PanelActions } from "./panel-actions";
import { useProjectWorkspace } from "../context/project-workspace-context";
import { MV_DURATION_MODES } from "../lib/audio-visual-music-video";
import {
  getMusicVideoWorkflowReadiness,
  MUSIC_VIDEO_WORKFLOWS,
  runMusicVideoWorkflow,
  scrollToPanel,
} from "../lib/music-video-workflows";
import { getIndexWorkflows } from "../lib/video-creator-index";

export const CenterMusicVideoWorkflowsPanel = memo(function CenterMusicVideoWorkflowsPanel() {
  const ws = useProjectWorkspace();
  const [activeId, setActiveId] = useState(null);
  const [pathEDurationMode, setPathEDurationMode] = useState(MV_DURATION_MODES.FULL);

  const ctx = {
    audioAnalysis: ws.audioAnalysis,
    imageAnalysis: ws.imageAnalysis,
    sunoPasteStyle: ws.sunoPasteStyle,
    sunoPasteLyrics: ws.sunoPasteLyrics,
  };

  const onStart = useCallback(
    async (workflowId) => {
      setActiveId(workflowId);
      const result = await runMusicVideoWorkflow(workflowId, {
        audioAnalysis: ws.audioAnalysis,
        imageAnalysis: ws.imageAnalysis,
        sunoPasteStyle: ws.sunoPasteStyle,
        sunoPasteLyrics: ws.sunoPasteLyrics,
        hasImageRef: Boolean(ws.imageAnalysis && ws.imagePreview),
        promptLength: ws.idea?.length || 0,
        captureSnapshot: ws.captureSnapshot,
        applyAudioToMusicVideo: ws.applyAudioToMusicVideo,
        applyAudioVisualMusicVideo: ws.applyAudioVisualMusicVideo,
        applySunoPasteToMusicVideo: ws.applySunoPasteToMusicVideo,
        applyMusicVideoFromBoth: ws.applyMusicVideoFromBoth,
        setPromptEngine: ws.setPromptEngine,
        setStatusWithTime: ws.setStatusWithTime,
        pathEDurationMode,
      });
      ws.setStatusWithTime(result.message, result.ok ? "info" : "warning");
    },
    [ws, pathEDurationMode],
  );

  const onShowSteps = useCallback((workflowId) => {
    setActiveId(workflowId);
    const wf = MUSIC_VIDEO_WORKFLOWS.find((w) => w.id === workflowId);
    if (wf?.scrollTarget) scrollToPanel(wf.scrollTarget);
  }, []);

  return (
    <Panel
      title="Quick Start — Music Video Paths 1–5"
      hint="Pick a workflow. Run applies fields and scrolls to Director when ready; Show jumps to the right panel."
      data-testid="music-video-workflows-panel"
      actions={<PanelActions topic="workflows" clearDisabled />}
    >
      <div className="grid gap-3 md:grid-cols-2">
        {MUSIC_VIDEO_WORKFLOWS.map((wf) => {
          const { ready, hint } = getMusicVideoWorkflowReadiness(wf.id, ctx);
          const isActive = activeId === wf.id;

          return (
            <article
              key={wf.id}
              data-testid={`workflow-card-${wf.id}`}
              className={
                "rounded-2xl border p-4 transition-colors " +
                (isActive
                  ? "border-violet-400/50 bg-violet-500/15"
                  : "border-white/10 bg-black/25 hover:border-white/20")
              }
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-xs font-bold text-white">
                    {wf.id}
                  </span>
                  <span className="text-sm font-bold text-white">{wf.title}</span>
                  <span className="ml-2 rounded-full border border-white/15 px-1.5 py-0.5 text-[10px] font-bold text-white/50">
                    {wf.badge}
                  </span>
                </div>
                <span
                  className={
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold " +
                    (ready
                      ? "bg-emerald-500/25 text-emerald-100"
                      : "bg-white/10 text-white/45")
                  }
                >
                  {ready ? "Ready" : "Setup"}
                </span>
              </div>

              <p className="mb-3 text-[11px] leading-relaxed text-white/55">{wf.summary}</p>

              <ol className="mb-3 list-decimal space-y-1 pl-4 text-[11px] text-white/50">
                {wf.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>

              <p className="mb-3 text-[10px] text-white/40">{hint}</p>

              {wf.id === 5 ? (
                <label className="mb-3 block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/45">
                    Path E duration
                  </span>
                  <select
                    data-testid="workflow-5-duration-mode"
                    value={pathEDurationMode}
                    onChange={(e) => setPathEDurationMode(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/30 p-2 text-[11px] text-white outline-none focus:border-violet-300/40"
                  >
                    <option value={MV_DURATION_MODES.FULL}>Full track (max 480s)</option>
                    <option value={MV_DURATION_MODES.HIGHLIGHT}>Highlight section only</option>
                  </select>
                </label>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid={`workflow-run-${wf.id}`}
                  onClick={() => onStart(wf.id)}
                  className="rounded-xl bg-violet-300 px-3 py-1.5 text-xs font-bold text-black hover:bg-violet-200"
                >
                  {wf.id === 4 ? "Open manuscript chat" : `Run path ${wf.id}`}
                </button>
                <button
                  type="button"
                  data-testid={`workflow-show-${wf.id}`}
                  onClick={() => onShowSteps(wf.id)}
                  className="rounded-xl border border-white/15 bg-black/30 px-3 py-1.5 text-xs font-bold text-white/80 hover:bg-white/10"
                >
                  Show panel
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <details className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3">
        <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-white/55">
          Extended workflows 5–8 (from Video Creator Index)
        </summary>
        <ul className="mt-2 space-y-2 text-[11px] text-white/55">
          {getIndexWorkflows()
            .filter((w) => w.id > 4)
            .map((w) => (
              <li key={w.id}>
                <span className="font-bold text-white/75">{w.title}</span>
                <div>{(w.steps || []).join(" → ")}</div>
                {w.source ? <div className="text-white/40">{w.source}</div> : null}
              </li>
            ))}
        </ul>
      </details>
    </Panel>
  );
});
