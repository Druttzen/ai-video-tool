"use client";

import { memo } from "react";
import {
  computeFinishAtMs,
  formatBuildCountdown,
  formatFinishTime,
} from "../lib/build-progress-format";

export const VideoBuildProgressModal = memo(function VideoBuildProgressModal({
  open,
  title = "Video build",
  progress,
  remainingSec,
  status,
  estimatedLabel,
  message,
  finishAtMs,
  onCancel,
  onAbortError,
  onClose,
  canCancel = false,
  cancelBusy = false,
  abortBusy = false,
}) {
  if (!open) return null;

  const pct = Math.min(100, Math.max(0, Math.round(progress || 0)));
  const active = status === "running" || status === "starting" || status === "cancelling";
  const done = status === "complete";
  const failed = status === "failed";
  const cancelled = status === "cancelled";
  const finishAt = finishAtMs ?? computeFinishAtMs(remainingSec);

  const heading = done
    ? "Build complete"
    : cancelled
      ? "Build cancelled"
      : failed
        ? "Build failed"
        : status === "cancelling"
          ? "Cancelling…"
          : active
            ? "Building video…"
            : "Video build";

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-build-modal-title"
      data-testid="video-build-progress-modal"
      onClick={active ? undefined : onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-violet-400/30 bg-[#12151a] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300/80">
          {title}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 id="video-build-modal-title" className="text-xl font-black text-white">
            {heading}
          </h2>
          <div className="text-2xl font-black tabular-nums text-violet-100">{pct}%</div>
        </div>

        <div className="relative mt-4 h-4 overflow-hidden rounded-full bg-black/50">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              cancelled
                ? "bg-amber-500/80"
                : failed
                  ? "bg-rose-500"
                  : done
                    ? "bg-emerald-400"
                    : "bg-gradient-to-r from-violet-500 to-cyan-400"
            }`}
            style={{ width: `${pct}%` }}
            data-testid="video-build-progress-bar"
          />
        </div>

        <dl className="mt-4 grid gap-2 text-sm">
          <div className="flex justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
            <dt className="text-white/50">ETA (time left)</dt>
            <dd className="font-bold tabular-nums text-cyan-100" data-testid="video-build-eta">
              {active ? formatBuildCountdown(remainingSec) : done ? "Done" : cancelled ? "Stopped" : failed ? "—" : "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
            <dt className="text-white/50">To be finished</dt>
            <dd className="font-bold tabular-nums text-violet-100" data-testid="video-build-finish-time">
              {active ? formatFinishTime(finishAt) : done ? formatFinishTime(finishAt) : "—"}
            </dd>
          </div>
          {estimatedLabel ? (
            <div className="flex justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs">
              <dt className="text-white/40">Estimated total</dt>
              <dd className="text-white/70">{estimatedLabel}</dd>
            </div>
          ) : null}
        </dl>

        {message ? <p className="mt-3 text-xs leading-relaxed text-white/55">{message}</p> : null}

        <div className="mt-5 flex flex-wrap gap-2">
          {canCancel ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelBusy || status === "cancelling"}
              data-testid="video-build-cancel"
              className="flex-1 rounded-2xl border border-rose-400/40 bg-rose-500/15 px-4 py-2.5 text-sm font-bold text-rose-100 hover:bg-rose-500/25 disabled:opacity-50"
            >
              {cancelBusy || status === "cancelling" ? "Cancelling…" : "Cancel build"}
            </button>
          ) : null}
          {failed ? (
            <button
              type="button"
              onClick={onAbortError}
              disabled={abortBusy}
              data-testid="video-build-abort-error"
              className="flex-1 rounded-2xl border border-amber-400/40 bg-amber-500/15 px-4 py-2.5 text-sm font-bold text-amber-100 hover:bg-amber-500/25 disabled:opacity-50"
            >
              {abortBusy ? "Aborting…" : "Abort failed build"}
            </button>
          ) : null}
          {!active && !canCancel ? (
            <button
              type="button"
              onClick={onClose}
              data-testid="video-build-close"
              className="flex-1 rounded-2xl bg-violet-300 px-4 py-2.5 text-sm font-bold text-black hover:bg-violet-200"
            >
              Close
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
});
