"use client";

import { memo, useState } from "react";
import { Panel } from "./ui-blocks";
import { PanelActions } from "./panel-actions";
import { useProjectWorkspace } from "../context/project-workspace-context";
import { promptSymbolOverview } from "../lib/suno-language-index";
import { MV_DURATION_MODES } from "../lib/audio-visual-music-video";
import { MusicVideoBeatSyncDashboard } from "./music-video-beat-sync-dashboard";

export const CenterMusicVideoPanel = memo(function CenterMusicVideoPanel() {
  const ws = useProjectWorkspace();
  const hasTrack = Boolean(ws.audioAnalysis);
  const hasImage = Boolean(ws.imageAnalysis);
  const hasPaste = Boolean(ws.sunoPasteStyle?.trim() || ws.sunoPasteLyrics?.trim());
  const canBoth = hasTrack && hasPaste;
  const canAudioVisual = hasTrack && hasImage;
  const [durationMode, setDurationMode] = useState(MV_DURATION_MODES.FULL);

  return (
    <Panel
      title="Suno → Music Video Studio"
      hint="Both paths in one place: analyzed track, Suno paste, or BOTH merged → Director render."
      data-testid="music-video-panel"
      actions={
        <PanelActions
          topic="music-video"
          onLoad={() => ws.captureSunoPasteFromProject()}
          loadLabel="Capture"
          onClear={() => ws.clearSunoPaste()}
        />
      }
    >
      <p className="mb-3 text-[11px] leading-relaxed text-white/50">
        <strong className="text-white/65">Path A:</strong> drop a Suno export in Analyzers.
        <strong className="text-white/65"> Path B:</strong> paste Style + Lyrics below.
        <strong className="text-white/65"> Path C:</strong> use both for track-synced visuals with
        Suno bracket structure. <strong className="text-white/65">Path E:</strong> analyzed track +
        reference image — beat-sync, lip-sync, full song length. Or describe your vision in{" "}
        <strong className="text-white/65">AI Manuscript Chat</strong> below.
      </p>

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-white/45">
            Suno Style (paste)
          </span>
          <textarea
            data-testid="music-video-suno-style"
            value={ws.sunoPasteStyle}
            onChange={(e) => ws.setSunoPasteStyle(e.target.value)}
            rows={3}
            placeholder="Techno, Heavy sub bass, 128 BPM, 4/4…"
            className="w-full rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none focus:border-fuchsia-300/40"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-white/45">
            Suno Lyrics (paste)
          </span>
          <textarea
            data-testid="music-video-suno-lyrics"
            value={ws.sunoPasteLyrics}
            onChange={(e) => ws.setSunoPasteLyrics(e.target.value)}
            rows={3}
            placeholder="[Verse 1]… [Chorus]…"
            className="w-full rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none focus:border-fuchsia-300/40"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="apply-track-to-music-video"
          disabled={!hasTrack}
          onClick={() => {
            ws.captureSnapshot("before track → music video");
            ws.applyAudioToMusicVideo();
          }}
          className="rounded-2xl bg-violet-300 px-4 py-2 text-sm font-bold text-black hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          A · Track → video
        </button>
        <button
          type="button"
          data-testid="apply-suno-paste-to-music-video"
          disabled={!hasPaste}
          onClick={() => ws.applySunoPasteToMusicVideo()}
          className="rounded-2xl bg-fuchsia-300 px-4 py-2 text-sm font-bold text-black hover:bg-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          B · Suno paste → video
        </button>
        <button
          type="button"
          data-testid="apply-both-to-music-video"
          disabled={!canBoth}
          onClick={() => ws.applyMusicVideoFromBoth()}
          className="rounded-2xl bg-gradient-to-r from-violet-300 to-fuchsia-300 px-4 py-2 text-sm font-bold text-black hover:from-violet-200 hover:to-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          C · BOTH (track + paste)
        </button>
        <button
          type="button"
          data-testid="apply-audio-visual-music-video"
          disabled={!canAudioVisual}
          onClick={() => {
            ws.captureSnapshot("before audio + picture → music video");
            ws.applyAudioVisualMusicVideo(durationMode);
          }}
          className="rounded-2xl bg-gradient-to-r from-emerald-300 to-cyan-300 px-4 py-2 text-sm font-bold text-black hover:from-emerald-200 hover:to-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          E · Audio + picture → MV
        </button>
      </div>

      {canAudioVisual ? (
        <label className="mb-3 block max-w-md">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-white/45">
            Path E duration
          </span>
          <select
            data-testid="audio-visual-duration-mode-studio"
            value={durationMode}
            onChange={(e) => setDurationMode(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 p-2 text-sm text-white outline-none focus:border-cyan-300/40"
          >
            <option value={MV_DURATION_MODES.FULL}>Full track (max 480s)</option>
            <option value={MV_DURATION_MODES.HIGHLIGHT}>Highlight section only</option>
          </select>
        </label>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
        <span
          className={
            hasTrack
              ? "rounded-full border border-violet-400/40 bg-violet-500/15 px-2 py-0.5 text-violet-100"
              : "rounded-full border border-white/10 px-2 py-0.5 text-white/35"
          }
        >
          Track {hasTrack ? "✓" : "—"}
        </span>
        <span
          className={
            hasPaste
              ? "rounded-full border border-fuchsia-400/40 bg-fuchsia-500/15 px-2 py-0.5 text-fuchsia-100"
              : "rounded-full border border-white/10 px-2 py-0.5 text-white/35"
          }
        >
          Suno paste {hasPaste ? "✓" : "—"}
        </span>
        <span
          data-testid="mv-badge-both-ready"
          className={
            canBoth
              ? "rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-emerald-100"
              : "rounded-full border border-white/10 px-2 py-0.5 text-white/35"
          }
        >
          BOTH ready {canBoth ? "✓" : "—"}
        </span>
        <span
          data-testid="mv-badge-audio-visual-ready"
          className={
            canAudioVisual
              ? "rounded-full border border-cyan-400/40 bg-cyan-500/15 px-2 py-0.5 text-cyan-100"
              : "rounded-full border border-white/10 px-2 py-0.5 text-white/35"
          }
        >
          Audio + picture {canAudioVisual ? "✓" : "—"}
        </span>
      </div>

      {hasTrack ? (
        <p className="mt-3 rounded-2xl border border-violet-400/25 bg-violet-500/10 px-3 py-2 text-xs text-violet-100">
          Track: {ws.audioAnalysis?.estimatedBpm ? `${ws.audioAnalysis.estimatedBpm} BPM · ` : ""}
          {(ws.audioAnalysis?.suggestedGenres || []).slice(0, 2).join(", ") || "analyzed"}
        </p>
      ) : (
        <p className="mt-3 text-xs text-white/40">Drop audio in Analyzers above to enable Path A / C / E.</p>
      )}

      <MusicVideoBeatSyncDashboard durationMode={durationMode} />

      <details className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3">
        <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-white/55">
          Suno symbols & bracket tags (video use)
        </summary>
        <ul className="mt-2 space-y-2 text-[11px] leading-relaxed text-white/60">
          {promptSymbolOverview.slice(0, 6).map((row) => (
            <li key={row.symbol}>
              <span className="font-bold text-white/75">{row.symbol}</span> — {row.label}:{" "}
              {row.role}
            </li>
          ))}
        </ul>
      </details>
    </Panel>
  );
});
