"use client";

import { memo } from "react";
import { CoProducerLlmSettings } from "./co-producer-lyrics-block";
import { Panel } from "./ui-blocks";
import { PanelActions } from "./panel-actions";
import { isCoProducerLlmReady, saveCoProducerLlmSettings } from "../lib/co-producer-llm";
import { useProjectWorkspace } from "../context/project-workspace-context";

export const CenterManuscriptChatPanel = memo(function CenterManuscriptChatPanel() {
  const ws = useProjectWorkspace();
  const llmReady = isCoProducerLlmReady(ws.coProducerLlmSettings);

  return (
    <Panel
      title="AI Manuscript Chat"
      hint="Write your own manuscript — story, scene, music-video brief, or Suno vision. AI turns it into styles, shot structure, and Director prompts."
      data-testid="manuscript-chat-panel"
      actions={<PanelActions topic="manuscript" onClear={() => ws.clearManuscriptChat()} />}
    >
      <p className="mb-3 text-[11px] leading-relaxed text-white/50">
        Describe what you want in plain language: characters, mood, setting, beats, or paste a Suno
        lyric sketch. The assistant returns visual genres, lighting, camera motion, rules, and a shot
        list. Click <strong className="text-white/65">Apply to project</strong> to fill workspace
        fields and render in Director.
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
          LLM off — manuscripts parse locally with keyword heuristics. Enable API above for full AI
          chat.
        </p>
      ) : null}

      <div
        className="mb-3 max-h-56 space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-black/30 p-3"
        data-testid="manuscript-chat-log"
      >
        {ws.manuscriptMessages.length === 0 ? (
          <p className="text-xs text-white/40">
            Example: &quot;A synthwave music video — lone driver on a neon highway at 2am, chorus hits
            on wide aerial, verse is tight interior close-ups, rain on windshield, 15 seconds.&quot;
          </p>
        ) : (
          ws.manuscriptMessages.map((m, i) => (
            <div
              key={`${m.ts}-${i}`}
              className={
                m.role === "user"
                  ? "ml-6 rounded-xl bg-violet-500/20 px-3 py-2 text-sm text-violet-50"
                  : "mr-6 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm text-emerald-50"
              }
            >
              <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider opacity-60">
                {m.role === "user" ? "You" : "Director AI"}
              </div>
              {m.content}
              {m.preview ? (
                <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-2 text-[10px] text-white/70">
                  {m.preview}
                </pre>
              ) : null}
            </div>
          ))
        )}
      </div>

      <textarea
        data-testid="manuscript-chat-input"
        value={ws.manuscriptDraft}
        onChange={(e) => ws.setManuscriptDraft(e.target.value)}
        rows={4}
        placeholder="Write your manuscript here — scene, story, music video brief, mood board in words…"
        className="mb-3 w-full rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none focus:border-violet-300/40"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            ws.sendManuscriptMessage();
          }
        }}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="manuscript-chat-send"
          disabled={ws.manuscriptBusy || !ws.manuscriptDraft?.trim()}
          onClick={() => ws.sendManuscriptMessage()}
          className="rounded-2xl bg-violet-300 px-4 py-2 text-sm font-bold text-black hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {ws.manuscriptBusy ? "Thinking…" : "Send manuscript → video"}
        </button>
        <button
          type="button"
          data-testid="manuscript-chat-apply"
          disabled={!ws.manuscriptProposal?.patch}
          onClick={() => ws.applyManuscriptToProject()}
          className="rounded-2xl bg-emerald-300 px-4 py-2 text-sm font-bold text-black hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Apply to project
        </button>
        <button
          type="button"
          onClick={() => ws.clearManuscriptChat()}
          className="rounded-2xl border border-white/15 bg-black/30 px-4 py-2 text-sm font-bold text-white/80 hover:bg-white/10"
        >
          Clear chat
        </button>
      </div>

      {ws.manuscriptProposal?.patch ? (
        <details className="mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-emerald-100">
            Preview mapped fields
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-white/75">
            {JSON.stringify(ws.manuscriptProposal.patch, null, 2)}
          </pre>
        </details>
      ) : null}

      <p className="mt-2 text-[10px] text-white/35">Ctrl+Enter to send</p>
    </Panel>
  );
});
