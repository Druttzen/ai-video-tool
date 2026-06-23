"use client";

import { memo, useCallback, useRef } from "react";
import { CoProducerLlmSettings } from "./co-producer-lyrics-block";
import { Panel } from "./ui-blocks";
import { PanelActions } from "./panel-actions";
import { isCoProducerLlmReady, saveCoProducerLlmSettings } from "../lib/co-producer-llm";
import { useProjectWorkspace } from "../context/project-workspace-context";
import {
  formatMultiClipProgressLabel,
  multiClipProgressPercent,
} from "../lib/video-production-pipeline";

function AnalysisChip({ chip }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-100"
      title={chip.detail}
    >
      <span className="font-bold uppercase tracking-wide opacity-70">{chip.kind}</span>
      <span className="truncate">{chip.label}</span>
    </span>
  );
}

function WorkflowProgressBar({ checklist, phase, productionPhase }) {
  const steps = [
    { key: "hasAudio", label: "Audio" },
    { key: "hasImage", label: "Image" },
    { key: "hasBrief", label: "Brief" },
    { key: "hasPlan", label: "Plan" },
    { key: "patchApplied", label: "Applied" },
    { key: "directorReady", label: "Director" },
  ];
  const productionLabel =
    productionPhase && productionPhase !== "idle" ? productionPhase.replace(/_/g, " ") : null;
  return (
    <div className="mb-3" data-testid="video-prep-workflow-progress">
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-white/45">
        <span>Workflow</span>
        <span className="text-cyan-200/80">
          {phase?.replace(/_/g, " ")}
          {productionLabel ? ` · ${productionLabel}` : ""}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {steps.map((step) => {
          const done = Boolean(checklist?.[step.key]);
          return (
            <span
              key={step.key}
              className={
                done
                  ? "rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-100"
                  : "rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] text-white/40"
              }
            >
              {step.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function MultiClipProductionProgress({ state, phase }) {
  if (!state?.multiClip || !phase || phase === "idle" || phase === "done" || phase === "failed") {
    return null;
  }

  const total = Number(state.clipTotal) || 0;
  const rendered = Number(state.clipsRendered) || 0;
  const current = Number(state.clipCurrent) || 0;
  const pct = multiClipProgressPercent(state);
  const label = formatMultiClipProgressLabel(state);

  return (
    <div
      className="mb-3 rounded-2xl border border-orange-400/35 bg-orange-500/10 p-3"
      data-testid="video-prep-multiclip-progress"
    >
      <div className="mb-2 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-orange-100/90">
        <span>Beat-sync clips</span>
        <span>
          {rendered}/{total} rendered
          {current > 0 && phase === "rendering" ? ` · active ${current}/${total}` : ""}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-black/40">
        <div
          className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-300 transition-all duration-500"
          style={{ width: `${pct}%` }}
          data-testid="video-prep-multiclip-progress-bar"
        />
      </div>
      {label ? <p className="mt-2 text-[11px] text-orange-50/90">{label}</p> : null}
      {state.renderMessage ? (
        <p className="mt-1 text-[10px] text-white/50">{state.renderMessage}</p>
      ) : null}
      {state.multiClipNote ? (
        <p className="mt-1 text-[10px] text-white/45">{state.multiClipNote}</p>
      ) : null}
    </div>
  );
}

function SuggestionChip({ suggestion, onRun, onDismiss }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/35 bg-violet-500/10 pl-2 pr-1 text-[10px] text-violet-100">
      <button
        type="button"
        data-testid={`video-prep-suggestion-${suggestion.id}`}
        onClick={() => onRun?.(suggestion)}
        className="py-0.5 font-medium hover:text-white"
      >
        {suggestion.label}
      </button>
      <button
        type="button"
        aria-label={`Dismiss ${suggestion.label}`}
        onClick={() => onDismiss?.(suggestion.id)}
        className="rounded-full px-1 text-white/40 hover:bg-white/10 hover:text-white/70"
      >
        ×
      </button>
    </span>
  );
}

function WhatsNextBlock({ whatsNext, onRunStep }) {
  if (!whatsNext?.primary?.length && !whatsNext?.optional?.length) return null;
  return (
    <div
      className="mb-3 rounded-2xl border border-sky-400/30 bg-sky-500/10 p-3"
      data-testid="video-prep-whats-next"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-sky-100">
          What&apos;s next
        </span>
        <span className="text-[10px] text-sky-100/70">
          Path {whatsNext.recommendedPath} · {whatsNext.intentLabel}
        </span>
      </div>
      <ul className="space-y-2 text-[11px] text-sky-50/90">
        {whatsNext.primary?.map((step, i) => (
          <li key={`primary-${i}`} className="flex gap-2">
            <span className="shrink-0 font-bold text-emerald-200">→</span>
            <span>
              <button
                type="button"
                className="font-semibold text-left hover:text-white"
                onClick={() => onRunStep?.(step)}
              >
                {step.title}
              </button>
              <span className="text-white/55"> — {step.why}</span>
            </span>
          </li>
        ))}
        {whatsNext.optional?.map((step, i) => (
          <li key={`optional-${i}`} className="flex gap-2 text-white/50">
            <span className="shrink-0">○</span>
            <span>
              <span className="text-[10px] uppercase tracking-wide">Optional</span>:{" "}
              <button
                type="button"
                className="font-medium hover:text-white/80"
                onClick={() => onRunStep?.(step)}
              >
                {step.title}
              </button>
              <span> — {step.why}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MessageNextSteps({ nextSteps, onRunStep }) {
  if (!nextSteps?.length) return null;
  const primary = nextSteps.filter((s) => s.priority === "primary");
  const optional = nextSteps.filter((s) => s.priority === "optional");
  return (
    <div className="mt-2 rounded-lg border border-white/10 bg-black/25 p-2" data-testid="message-next-steps">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-emerald-200/80">
        Next steps
      </div>
      <ul className="space-y-1 text-[10px] text-white/70">
        {primary.map((step, i) => (
          <li key={`p-${i}`}>
            <button
              type="button"
              className="font-semibold text-emerald-100/90 hover:text-white"
              onClick={() => onRunStep?.(step)}
            >
              {step.title}
            </button>
            <span className="text-white/50"> — {step.why}</span>
          </li>
        ))}
        {optional.map((step, i) => (
          <li key={`o-${i}`} className="text-white/45">
            Optional:{" "}
            <button type="button" className="hover:text-white/70" onClick={() => onRunStep?.(step)}>
              {step.title}
            </button>
            <span> — {step.why}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const CenterManuscriptChatPanel = memo(function CenterManuscriptChatPanel() {
  const ws = useProjectWorkspace();
  const llmReady = isCoProducerLlmReady(ws.coProducerLlmSettings);
  const fileInputRef = useRef(null);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer?.files?.length) {
        ws.attachAgentFiles?.(e.dataTransfer.files);
      }
    },
    [ws],
  );

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return (
    <Panel
      title="Video Prep Agent"
      hint="Cursor-like chat: describe your video, drop audio + reference images here. The agent prepares project fields, Director settings, and suggested actions — no panel hopping."
      data-testid="manuscript-chat-panel"
      actions={<PanelActions topic="manuscript" onClear={() => ws.clearAgentChat?.()} />}
    >
      <p className="mb-3 text-[11px] leading-relaxed text-white/50">
        Primary workflow: attach a track and/or mood board image, describe what you want, then{" "}
        <strong className="text-white/65">Apply all</strong> or{" "}
        <strong className="text-white/65">Apply to project</strong>. Legacy panels (Analyzers,
        Music Video Studio, workflows) still work but are optional.
      </p>

      <CoProducerLlmSettings
        settings={ws.coProducerLlmSettings}
        onChange={(next) => {
          ws.setCoProducerLlmSettings(next);
          saveCoProducerLlmSettings(next);
        }}
      />

      {!llmReady ? (
        <p className="mb-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          LLM off — agent uses local heuristics + your uploads. Enable API above for full AI chat.
        </p>
      ) : null}

      {ws.agentRemembers ? (
        <p
          className="mb-3 rounded-2xl border border-cyan-400/25 bg-cyan-500/10 px-3 py-2 text-[11px] text-cyan-100"
          data-testid="video-prep-agent-remembers"
        >
          Agent remembers this session
          {ws.agentSessionSource === "userData" && ws.agentSessionPath
            ? " (saved under AppData)"
            : ws.agentSessionSource === "localStorage"
              ? " (browser storage)"
              : ""}
          .
        </p>
      ) : null}

      <WorkflowProgressBar
        checklist={ws.agentWorkflowChecklist}
        phase={ws.agentWorkflowPhase}
        productionPhase={ws.agentProductionPhase}
      />

      <MultiClipProductionProgress state={ws.agentProductionState} phase={ws.agentProductionPhase} />

      {(ws.agentProductionPhase === "rendering" ||
        ws.agentProductionPhase === "assembled" ||
        ws.agentProductionPhase === "validating") &&
      !ws.agentProductionState?.multiClip ? (
        <p
          className="mb-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100"
          data-testid="video-prep-production-status"
        >
          Production: {ws.agentProductionPhase}…
          {ws.agentProductionState?.multiClipNote ? (
            <span className="mt-1 block text-white/55">{ws.agentProductionState.multiClipNote}</span>
          ) : null}
        </p>
      ) : null}

      {ws.agentWorkflowSuggestions?.length ? (
        <div
          className="mb-3 flex flex-wrap gap-1"
          data-testid="video-prep-suggestions"
        >
          {ws.agentWorkflowSuggestions.map((s) => (
            <SuggestionChip
              key={s.id}
              suggestion={s}
              onRun={ws.runAgentSuggestion}
              onDismiss={ws.dismissAgentSuggestion}
            />
          ))}
        </div>
      ) : null}

      <WhatsNextBlock whatsNext={ws.agentWhatsNext} onRunStep={ws.runAgentNextStep} />

      <div
        className="mb-3 max-h-56 space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-black/30 p-3"
        data-testid="manuscript-chat-log"
      >
        {ws.agentMessages?.length === 0 ? (
          <p className="text-xs text-white/40">
            Example: drop a WAV/MP3 + PNG reference, then &quot;Synthwave MV — neon highway at 2am,
            chorus on wide aerial, verse tight interior, rain on windshield, full song length.&quot;
          </p>
        ) : (
          ws.agentMessages.map((m, i) => (
            <div
              key={`${m.ts}-${i}`}
              className={
                m.role === "user"
                  ? "ml-6 rounded-xl bg-violet-500/20 px-3 py-2 text-sm text-violet-50"
                  : "mr-6 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm text-emerald-50"
              }
            >
              <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider opacity-60">
                {m.role === "user" ? "You" : "Prep Agent"}
              </div>
              {m.chips?.length ? (
                <div className="mb-2 flex flex-wrap gap-1">
                  {m.chips.map((chip, j) => (
                    <AnalysisChip key={`${chip.kind}-${j}`} chip={chip} />
                  ))}
                </div>
              ) : null}
              {m.content}
              {m.production && m.outputPath ? (
                <div className="mt-2">
                  <button
                    type="button"
                    data-testid="video-prep-reveal-output"
                    onClick={() => ws.revealAgentProductionOutput?.()}
                    className="rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-2 py-1 text-[10px] font-bold text-emerald-100 hover:bg-emerald-500/25"
                  >
                    Reveal output file
                  </button>
                </div>
              ) : null}
              {m.role === "assistant" && m.nextSteps?.length ? (
                <MessageNextSteps nextSteps={m.nextSteps} onRunStep={ws.runAgentNextStep} />
              ) : null}
              {m.preview ? (
                <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-2 text-[10px] text-white/70">
                  {m.preview}
                </pre>
              ) : null}
              {m.suggestedActions?.length ? (
                <ul className="mt-2 space-y-0.5 text-[10px] text-white/55">
                  {m.suggestedActions.map((a) => (
                    <li key={a.id}>→ {a.label || a.id}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))
        )}
      </div>

      {ws.agentAnalysisChips?.length ? (
        <div
          className="mb-2 flex flex-wrap gap-1"
          data-testid="video-prep-analysis-chips"
        >
          {ws.agentAnalysisChips.map((chip, i) => (
            <AnalysisChip key={`live-${chip.kind}-${i}`} chip={chip} />
          ))}
        </div>
      ) : null}

      <div
        className="relative mb-3"
        onDrop={onDrop}
        onDragOver={onDragOver}
        data-testid="video-prep-drop-zone"
      >
        <textarea
          data-testid="manuscript-chat-input"
          value={ws.agentDraft ?? ws.manuscriptDraft}
          onChange={(e) => (ws.setAgentDraft ?? ws.setManuscriptDraft)(e.target.value)}
          rows={4}
          placeholder="Describe your video… Drop audio (WAV/MP3) or image (PNG/JPG) here, or use Attach."
          className="w-full rounded-2xl border border-white/10 bg-black/30 p-3 pr-24 text-sm text-white outline-none focus:border-violet-300/40"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              (ws.sendAgentMessage ?? ws.sendManuscriptMessage)();
            }
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept={ws.agentFileAccept}
          multiple
          className="hidden"
          data-testid="video-prep-file-input"
          onChange={(e) => {
            if (e.target.files?.length) ws.attachAgentFiles?.(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          data-testid="video-prep-attach"
          disabled={ws.agentAttachBusy}
          onClick={() => fileInputRef.current?.click()}
          className="absolute bottom-3 right-3 rounded-xl border border-white/15 bg-black/50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white/70 hover:bg-white/10 disabled:opacity-40"
        >
          {ws.agentAttachBusy ? "Analyzing…" : "Attach"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="manuscript-chat-send"
          disabled={ws.agentBusy || !(ws.agentDraft ?? ws.manuscriptDraft)?.trim()}
          onClick={() => (ws.sendAgentMessage ?? ws.sendManuscriptMessage)()}
          className="rounded-2xl bg-violet-300 px-4 py-2 text-sm font-bold text-black hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {ws.agentBusy ? "Thinking…" : "Send → prep video"}
        </button>
        <button
          type="button"
          data-testid="manuscript-chat-apply"
          disabled={!(ws.agentProposal ?? ws.manuscriptProposal)?.patch}
          onClick={() => (ws.applyAgentToProject ?? ws.applyManuscriptToProject)()}
          className="rounded-2xl bg-emerald-300 px-4 py-2 text-sm font-bold text-black hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Apply to project
        </button>
        <button
          type="button"
          data-testid="video-prep-produce"
          disabled={
            ws.agentBusy ||
            !(ws.agentWorkflowChecklist?.patchApplied || ws.agentWorkflowChecklist?.directorReady)
          }
          onClick={() => ws.runAgentFullProduction?.()}
          className="rounded-2xl bg-orange-300 px-4 py-2 text-sm font-bold text-black hover:bg-orange-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {ws.agentProductionPhase === "assembled"
            ? "Assembling…"
            : ws.agentProductionPhase === "rendering" || ws.agentProductionPhase === "validating"
              ? ws.agentProductionState?.multiClip && ws.agentProductionState?.clipCurrent
                ? `Producing clip ${ws.agentProductionState.clipCurrent}/${ws.agentProductionState.clipTotal}…`
                : "Producing…"
              : "Produce video"}
        </button>
        <button
          type="button"
          data-testid="video-prep-check-readiness"
          disabled={ws.agentBusy}
          onClick={() => ws.checkAgentProductionReadiness?.()}
          className="rounded-2xl border border-white/15 bg-black/30 px-4 py-2 text-sm font-bold text-white/80 hover:bg-white/10 disabled:opacity-40"
        >
          Check readiness
        </button>
        <button
          type="button"
          data-testid="video-prep-apply-all"
          disabled={!(ws.agentProposal ?? ws.manuscriptProposal)}
          onClick={() => ws.applyAllAgentActions?.()}
          className="rounded-2xl bg-sky-300 px-4 py-2 text-sm font-bold text-black hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Apply all
        </button>
        <button
          type="button"
          onClick={() => (ws.clearAgentChat ?? ws.clearManuscriptChat)()}
          className="rounded-2xl border border-white/15 bg-black/30 px-4 py-2 text-sm font-bold text-white/80 hover:bg-white/10"
        >
          Clear chat
        </button>
      </div>

      {(ws.agentProposal ?? ws.manuscriptProposal)?.patch ? (
        <details className="mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-emerald-100">
            Preview mapped fields
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-white/75">
            {JSON.stringify(
              {
                project: (ws.agentProposal ?? ws.manuscriptProposal).patch,
                director: (ws.agentProposal ?? ws.manuscriptProposal).directorSettingsPatch,
                actions: (ws.agentProposal ?? ws.manuscriptProposal).suggestedActions,
              },
              null,
              2,
            )}
          </pre>
        </details>
      ) : null}

      <p className="mt-2 text-[10px] text-white/35">Ctrl+Enter to send · drag-drop audio/image on input</p>
    </Panel>
  );
});
