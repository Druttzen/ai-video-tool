"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { MV_DURATION_MODES } from "../lib/audio-visual-music-video";
import {
  buildBeatSyncExport,
  labelClipPlan,
  probeMusicVideoAddon,
  summarizeBeatSync,
} from "../lib/music-video-addon";
import { isElectronApp } from "../lib/electron-bridge";
import { useProjectWorkspace } from "../context/project-workspace-context";

function ClipTimeline({ clipPlan }) {
  if (!clipPlan.length) return null;
  const maxEnd = Math.max(...clipPlan.map((c) => c.end), 1);
  return (
    <div
      className="relative h-9 rounded-lg border border-white/10 bg-black/25"
      data-testid="mv-beat-sync-timeline"
    >
      {clipPlan.map((clip, index) => {
        const left = (clip.start / maxEnd) * 100;
        const width = Math.max(2, ((clip.end - clip.start) / maxEnd) * 100);
        return (
          <div
            key={`${clip.start}-${clip.end}-${index}`}
            className="absolute top-1 bottom-1 flex items-center justify-center overflow-hidden rounded-md border border-cyan-400/50 bg-gradient-to-b from-cyan-400/55 to-cyan-500/25 text-[10px] font-bold text-white"
            style={{ left: `${left}%`, width: `${width}%` }}
            title={`${clip.label}: ${clip.start}s–${clip.end}s`}
          >
            <span>{index + 1}</span>
          </div>
        );
      })}
    </div>
  );
}

export const MusicVideoBeatSyncDashboard = memo(function MusicVideoBeatSyncDashboard({
  durationMode = MV_DURATION_MODES.FULL,
}) {
  const ws = useProjectWorkspace();
  const [addonProbe, setAddonProbe] = useState(null);
  const [busy, setBusy] = useState(false);

  const summary = useMemo(
    () => summarizeBeatSync(ws.audioAnalysis, durationMode),
    [ws.audioAnalysis, durationMode],
  );
  const clipPlan = useMemo(
    () => labelClipPlan(ws.audioAnalysis?.beatSync?.clipPlan || []),
    [ws.audioAnalysis?.beatSync?.clipPlan],
  );

  useEffect(() => {
    if (!isElectronApp()) return;
    let cancelled = false;
    void probeMusicVideoAddon().then((result) => {
      if (!cancelled) setAddonProbe(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onReanalyze = useCallback(async () => {
    if (!ws.audioAnalysis || !ws.reanalyzeBeatSync) return;
    setBusy(true);
    try {
      await ws.reanalyzeBeatSync(durationMode);
    } finally {
      setBusy(false);
    }
  }, [ws, durationMode]);

  const onExport = useCallback(() => {
    const payload = buildBeatSyncExport(ws.audioAnalysis, durationMode);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "music-video-beat-sync.json";
    a.click();
    URL.revokeObjectURL(url);
    ws.setStatusWithTime("Exported beat-sync clip plan", "info");
  }, [ws, durationMode]);

  const onCopy = useCallback(async () => {
    const payload = buildBeatSyncExport(ws.audioAnalysis, durationMode);
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      ws.setStatusWithTime("Beat-sync snapshot copied", "info");
    } catch {
      ws.setStatusWithTime("Could not copy beat-sync snapshot", "error");
    }
  }, [ws, durationMode]);

  const addonReady = addonProbe?.ok && addonProbe?.beatSync?.ok;
  const ffmpegReady = addonProbe?.ffmpeg?.ok;

  return (
    <section
      className="mt-4 rounded-2xl border border-cyan-400/25 bg-cyan-500/5 p-4"
      data-testid="music-video-beat-sync-dashboard"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-100/90">
          Beat sync addon
        </h3>
        <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wide">
          <span
            className={
              addonReady
                ? "rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-emerald-100"
                : "rounded-full border border-amber-400/35 bg-amber-500/10 px-2 py-0.5 text-amber-100"
            }
            data-testid="mv-addon-librosa-status"
          >
            Librosa {addonReady ? "ready" : "setup"}
          </span>
          <span
            className={
              ffmpegReady
                ? "rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-emerald-100"
                : "rounded-full border border-white/15 px-2 py-0.5 text-white/45"
            }
            data-testid="mv-addon-ffmpeg-status"
          >
            FFmpeg {ffmpegReady ? "ready" : "—"}
          </span>
        </div>
      </div>

      {ws.audioAnalysis ? (
        <>
          <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
              <div className="text-lg font-bold text-cyan-200">{summary.bpm ?? "—"}</div>
              <div className="text-[10px] uppercase tracking-wide text-white/45">BPM</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
              <div className="text-lg font-bold text-cyan-200">{summary.beatCount}</div>
              <div className="text-[10px] uppercase tracking-wide text-white/45">Beats</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
              <div className="text-lg font-bold text-cyan-200">{summary.clipCount}</div>
              <div className="text-[10px] uppercase tracking-wide text-white/45">Segments</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
              <div className="text-lg font-bold text-cyan-200">{summary.onsetCount}</div>
              <div className="text-[10px] uppercase tracking-wide text-white/45">Onsets</div>
            </div>
          </div>

          <p className="mb-3 text-[11px] text-white/55">
            Source: <strong className="text-white/75">{summary.source}</strong> · Range{" "}
            {summary.rangeLabel}
            {summary.vocalsLikely ? " · Vocals likely" : " · Instrumental bed"}
            {summary.analyzedAt ? ` · ${new Date(summary.analyzedAt).toLocaleString()}` : ""}
          </p>
          <p className="mb-3 text-[11px] text-white/45">{summary.hint}</p>

          {clipPlan.length > 0 ? (
            <>
              <ClipTimeline clipPlan={clipPlan} />
              <table className="mt-3 w-full border-collapse text-[11px]" data-testid="mv-clip-plan-table">
                <thead>
                  <tr className="text-left text-white/45">
                    <th className="border-b border-white/10 py-1">Segment</th>
                    <th className="border-b border-white/10 py-1">Start</th>
                    <th className="border-b border-white/10 py-1">End</th>
                    <th className="border-b border-white/10 py-1">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {clipPlan.map((clip) => (
                    <tr key={`${clip.label}-${clip.start}`} className="text-white/70">
                      <td className="border-b border-white/5 py-1">{clip.label}</td>
                      <td className="border-b border-white/5 py-1">{clip.start}s</td>
                      <td className="border-b border-white/5 py-1">{clip.end}s</td>
                      <td className="border-b border-white/5 py-1">
                        {(clip.duration ?? clip.end - clip.start).toFixed(1)}s
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </>
      ) : (
        <p className="text-xs text-white/45">
          Analyze audio to see librosa beat sync, clip plan, and assembly readiness.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="mv-reanalyze-beats"
          disabled={!ws.audioAnalysis || busy || !isElectronApp()}
          onClick={() => void onReanalyze()}
          className="rounded-xl bg-cyan-300 px-3 py-1.5 text-xs font-bold text-black hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Analyzing…" : "Re-analyze beats"}
        </button>
        <button
          type="button"
          data-testid="mv-export-beat-sync"
          disabled={!ws.audioAnalysis}
          onClick={onExport}
          className="rounded-xl border border-white/15 bg-black/30 px-3 py-1.5 text-xs font-bold text-white/85 hover:bg-white/10 disabled:opacity-40"
        >
          Export clip plan
        </button>
        <button
          type="button"
          data-testid="mv-copy-beat-sync"
          disabled={!ws.audioAnalysis}
          onClick={() => void onCopy()}
          className="rounded-xl border border-white/15 bg-black/30 px-3 py-1.5 text-xs font-bold text-white/85 hover:bg-white/10 disabled:opacity-40"
        >
          Copy JSON
        </button>
      </div>

      {!isElectronApp() ? (
        <p className="mt-2 text-[10px] text-white/35">
          Desktop app required for librosa beat analysis and FFmpeg assembly.
        </p>
      ) : null}
    </section>
  );
});
