"use client";

import { memo, useState } from "react";
import { AnalyzersDashboard } from "./analyzers-dashboard";
import { AudioTrackEditor } from "./audio-track-editor";
import { DropBox, Panel } from "./ui-blocks";
import { PanelActions } from "./panel-actions";
import { IMAGE_ANALYZER_DISCLAIMER } from "../lib/analyzer-disclaimer";
import { MV_DURATION_MODES } from "../lib/audio-visual-music-video";
import {
  SUPPORTED_AUDIO_ACCEPT,
  SUPPORTED_AUDIO_LABEL,
  SUPPORTED_IMAGE_ACCEPT,
  SUPPORTED_IMAGE_LABEL,
} from "../lib/analyzer-file-types";
import {
  SUNO_LYRICS_CHAR_TYPICAL_MAX,
  SUNO_LYRICS_CHAR_WARN,
  SUNO_STYLE_CHAR_CAP,
  SUNO_STYLE_CHAR_WARN,
} from "../lib/suno-limits";
import { useProjectWorkspace } from "../context/project-workspace-context";

export const CenterAnalyzersPanel = memo(function CenterAnalyzersPanel() {
  const ws = useProjectWorkspace();
  const [durationMode, setDurationMode] = useState(MV_DURATION_MODES.FULL);

  return (
    <>
      <Panel
        title="Drag & Drop Analyzers"
        hint="Optional Polish-step tools — track report with waveform, LUFS/dBTP meter, studio WAV export. Merge into Suno fields (Sora-like) or map track to music video (Director)."
        data-testid="analyzers-panel"
        actions={
          <PanelActions
            topic="analyzers"
            onClear={() => {
              ws.clearAudioAnalysis();
              ws.clearImageAnalysis();
            }}
          />
        }
      >
        <div
          className={`mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl border px-3 py-2 font-mono text-[11px] leading-snug ${
            ws.sunoFieldSlices.style.length > SUNO_STYLE_CHAR_CAP
              ? "border-red-400/45 bg-red-500/15 text-red-100"
              : ws.sunoFieldSlices.style.length > SUNO_STYLE_CHAR_WARN
                ? "border-amber-400/40 bg-amber-500/10 text-amber-50"
                : "border-emerald-400/30 bg-emerald-500/10 text-emerald-50"
          }`}
        >
          <span>
            Style box: {ws.sunoFieldSlices.style.length}/{SUNO_STYLE_CHAR_CAP}
            {ws.promptEngine !== "Sora-like" ? (
              <span className="ml-1.5 font-sans text-[10px] font-normal text-white/40">
                (same string as validator when you use Sora-like)
              </span>
            ) : null}
          </span>
          <span
            className={
              ws.sunoFieldSlices.lyrics.length > SUNO_LYRICS_CHAR_TYPICAL_MAX
                ? "text-red-200"
                : ws.sunoFieldSlices.lyrics.length > SUNO_LYRICS_CHAR_WARN
                  ? "text-amber-200"
                  : "text-white/55"
            }
          >
            Lyrics: {ws.sunoFieldSlices.lyrics.length}/{SUNO_LYRICS_CHAR_TYPICAL_MAX}
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <DropBox
            title="Drop Audio File"
            hint={SUPPORTED_AUDIO_LABEL}
            accept={SUPPORTED_AUDIO_ACCEPT}
            onFile={ws.analyzeAudioFile}
          >
            {ws.audioAnalysis ? (
              <AudioTrackEditor
                analysis={ws.audioAnalysis}
                audioUrl={ws.audioPreviewUrl}
                onChange={ws.updateAudioAnalysis}
                onApply={() => {
                  ws.captureSnapshot("before audio merge");
                  ws.applyAudioToSunoStyle();
                }}
                onApplyMusicVideo={() => {
                  ws.captureSnapshot("before track → music video");
                  ws.applyAudioToMusicVideo();
                }}
                onClear={ws.clearAudioAnalysis}
                onAttachAudio={ws.attachAudioFile}
                onAddLyricsForTrack={ws.addLyricsFromInstrumentalTrack}
                onAnalyzeVocalCharacter={ws.handoffTrackToVoiceCharacterStudio}
                loudness={ws.audioLoudness}
                loudnessBusy={ws.audioLoudnessBusy}
                onExportEnhanced={ws.exportEnhancedAudio}
                exportBusy={ws.audioExportBusy}
                exportProgress={ws.audioExportProgress}
              />
            ) : null}
          </DropBox>
          <DropBox
            title="Drop Image File"
            hint={SUPPORTED_IMAGE_LABEL}
            accept={SUPPORTED_IMAGE_ACCEPT}
            onFile={ws.analyzeImageFile}
          >
            {ws.imagePreview && (
              /* eslint-disable-next-line @next/next/no-img-element -- blob Object URLs from analyzer */
              <img
                src={ws.imagePreview}
                alt="Image preview"
                className="mx-auto mt-3 max-h-40 rounded-2xl object-contain"
              />
            )}
            {ws.imageAnalysis ? (
              <div className="mt-3 text-left">
                <p className="mb-2 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[10px] leading-relaxed text-amber-100/90">
                  {IMAGE_ANALYZER_DISCLAIMER}
                </p>
                <div className="rounded-2xl bg-black/30 p-3 text-xs whitespace-pre-wrap text-white/70">
                  {ws.imageAnalysis.summary}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    ws.captureSnapshot("before image merge");
                    ws.applyImageToSunoStyle();
                  }}
                  className="mt-2 w-full rounded-2xl border border-fuchsia-400/40 bg-fuchsia-500/20 py-2 text-xs font-bold text-fuchsia-50 hover:bg-fuchsia-500/30"
                >
                  Add image style to Suno (merge) → next step
                </button>
              </div>
            ) : null}
          </DropBox>
        </div>

        {ws.audioAnalysis && ws.imageAnalysis ? (
          <div className="mt-3 space-y-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-white/45">
                Path E duration
              </span>
              <select
                data-testid="audio-visual-duration-mode"
                value={durationMode}
                onChange={(e) => setDurationMode(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/30 p-2 text-sm text-white outline-none focus:border-emerald-300/40"
              >
                <option value={MV_DURATION_MODES.FULL}>Full track (max 480s)</option>
                <option value={MV_DURATION_MODES.HIGHLIGHT}>Highlight section only</option>
              </select>
            </label>
            <button
              type="button"
              data-testid="apply-audio-visual-music-video-analyzers"
              onClick={() => {
                ws.captureSnapshot("before audio + picture → music video");
                ws.applyAudioVisualMusicVideo(durationMode);
              }}
              className="w-full rounded-2xl border border-emerald-400/40 bg-gradient-to-r from-emerald-500/25 to-cyan-500/20 py-3 text-sm font-bold text-emerald-50 hover:from-emerald-500/35 hover:to-cyan-500/30"
            >
              Build music video from audio + picture — beat sync, lip sync
            </button>
          </div>
        ) : null}
      </Panel>

      <AnalyzersDashboard />

      {ws.sourcePrompt.trim() ? (
        <Panel title="Extracted Source Prompt" hint="Copy only the prompt created from audio/image analysis.">
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-2xl border border-orange-300/20 bg-black/50 p-4 text-xs leading-relaxed text-orange-50">
            {ws.sourcePrompt}
          </pre>
          <button
            onClick={() => ws.copyToClipboard(ws.sourcePrompt, "Extracted prompt copied")}
            className="mt-3 w-full rounded-2xl bg-orange-300 px-4 py-2 font-bold text-black hover:bg-orange-200"
          >
            Copy Extracted Prompt
          </button>
        </Panel>
      ) : null}
    </>
  );
});
