"use client";

import { memo, useEffect, useRef } from "react";
import { formatSetupInstallPhaseLabel } from "../lib/setup-install-progress";

export const SetupHubInstallProgressModal = memo(function SetupHubInstallProgressModal({
  open,
  title = "Setup Hub",
  progress = 0,
  status = "running",
  phaseLabel = "",
  message = "",
  lines = [],
  summary = "",
  onClose,
}) {
  const logRef = useRef(null);

  useEffect(() => {
    if (!open || !logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [open, lines]);

  if (!open) return null;

  const pct = Math.min(100, Math.max(0, Math.round(progress || 0)));
  const active = status === "running" || status === "starting";
  const done = status === "complete";
  const failed = status === "failed";

  const heading = done
    ? "Install complete"
    : failed
      ? "Install failed"
      : active
        ? "Installing tools…"
        : "Setup Hub";

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="setup-hub-install-modal-title"
      data-testid="setup-hub-install-progress-modal"
      onClick={active ? undefined : onClose}
    >
      <div
        className="flex w-full max-w-2xl flex-col rounded-3xl border border-violet-400/30 bg-[#12151a] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300/80">
          {title}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 id="setup-hub-install-modal-title" className="text-xl font-black text-white">
            {heading}
          </h2>
          <div className="text-2xl font-black tabular-nums text-violet-100">{pct}%</div>
        </div>

        <div className="relative mt-4 h-4 overflow-hidden rounded-full bg-black/50">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              failed ? "bg-rose-500" : done ? "bg-emerald-400" : "bg-gradient-to-r from-violet-500 to-cyan-400"
            }`}
            style={{ width: `${pct}%` }}
            data-testid="setup-hub-install-progress-bar"
          />
        </div>

        {phaseLabel ? (
          <p className="mt-3 text-sm font-semibold text-cyan-100/90" data-testid="setup-hub-install-phase">
            {phaseLabel}
          </p>
        ) : null}

        {message && active ? <p className="mt-1 text-xs leading-relaxed text-white/55">{message}</p> : null}

        <div
          ref={logRef}
          className="mt-4 max-h-64 min-h-[10rem] overflow-y-auto rounded-2xl border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-white/70"
          data-testid="setup-hub-install-log"
        >
          {lines.length ? (
            lines.map((line, index) => (
              <div key={`${index}-${line.slice(0, 24)}`} className="whitespace-pre-wrap break-words">
                {line}
              </div>
            ))
          ) : (
            <div className="text-white/35">Waiting for install output…</div>
          )}
        </div>

        {done || failed ? (
          <div
            className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
              done
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                : "border-rose-400/30 bg-rose-500/10 text-rose-100"
            }`}
            data-testid="setup-hub-install-summary"
          >
            <div className="font-bold">{done ? "Finished successfully" : "Finished with errors"}</div>
            {summary ? <p className="mt-1 text-xs leading-relaxed opacity-90">{summary}</p> : null}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          {!active ? (
            <button
              type="button"
              onClick={onClose}
              data-testid="setup-hub-install-close"
              className="flex-1 rounded-2xl bg-violet-300 px-4 py-2.5 text-sm font-bold text-black hover:bg-violet-200"
            >
              {done ? "Done" : "Close"}
            </button>
          ) : (
            <p className="flex-1 text-center text-xs text-white/40">Do not close the app while install is running.</p>
          )}
        </div>
      </div>
    </div>
  );
});

export { formatSetupInstallPhaseLabel };
