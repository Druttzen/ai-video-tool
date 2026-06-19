"use client";

import { memo } from "react";

const STATUS_STYLES = {
  ok: "bg-emerald-400",
  warn: "bg-amber-400",
  over: "bg-rose-500",
};

function MeterBar({ metric }) {
  const width = Math.min(100, metric.percent);
  const overflow = metric.percent > 100;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[10px]">
        <span className="font-bold text-white/70">{metric.label}</span>
        <span className={metric.status === "over" ? "text-rose-300" : "text-white/45"}>
          {metric.current}
          <span className="text-white/25"> / {metric.max}</span>
          {" · "}
          {metric.percent}%
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-black/50">
        <div
          className={`h-full rounded-full transition-all ${STATUS_STYLES[metric.status] || STATUS_STYLES.ok}`}
          style={{ width: `${width}%` }}
        />
        {overflow ? (
          <div
            className="absolute inset-y-0 right-0 bg-rose-600/80"
            style={{ width: `${Math.min(40, metric.percent - 100)}%`, marginLeft: "100%" }}
          />
        ) : null}
      </div>
    </div>
  );
}

export const DirectorBuildLoadPanel = memo(function DirectorBuildLoadPanel({ plan }) {
  if (!plan) return null;

  const overallStatus =
    plan.overallPercent > 100 ? "over" : plan.overallPercent >= 85 ? "warn" : "ok";

  return (
    <div
      className="space-y-3 rounded-2xl border border-cyan-300/15 bg-cyan-500/5 p-3"
      data-testid="build-load-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-200/70">
            Build load · {plan.limits.label} tier
          </div>
          <p className="mt-0.5 text-[11px] text-white/50">
            Est. render time: <span className="font-bold text-cyan-100">{plan.estimatedLabel}</span>
            {plan.durationPunishment?.punishmentPoints > 0 ? (
              <span className="text-orange-200/80">
                {" "}
                · +{plan.durationPunishment.punishmentPoints} length pts
              </span>
            ) : null}
          </p>
        </div>
        <div className="text-right">
          <div
            className={`text-lg font-black tabular-nums ${
              overallStatus === "over"
                ? "text-rose-300"
                : overallStatus === "warn"
                  ? "text-amber-200"
                  : "text-emerald-200"
            }`}
          >
            {plan.overallPercent}%
          </div>
          <div className="text-[9px] uppercase tracking-wider text-white/35">total load</div>
        </div>
      </div>

      <div className="relative h-2.5 overflow-hidden rounded-full bg-black/50">
        <div
          className={`h-full rounded-full ${STATUS_STYLES[overallStatus]}`}
          style={{ width: `${Math.min(100, plan.overallPercent)}%` }}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {plan.metrics.map((m) => (
          <MeterBar key={m.key} metric={m} />
        ))}
      </div>

      {plan.warnings.length ? (
        <ul className="space-y-1 text-[10px] text-amber-200/90">
          {plan.warnings.slice(0, 3).map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      ) : (
        <p className="text-[10px] text-white/35">Within safe limits for your hardware tier.</p>
      )}
    </div>
  );
});

export const DirectorBuildProgressPanel = memo(function DirectorBuildProgressPanel({
  progress,
  remainingSec,
  status,
  estimatedLabel,
  message,
  onCancel,
  canCancel = false,
  cancelBusy = false,
}) {
  const pct = Math.min(100, Math.max(0, Math.round(progress || 0)));
  const active = status === "running" || status === "starting" || status === "cancelling";
  const done = status === "complete";
  const failed = status === "failed";
  const cancelled = status === "cancelled";

  return (
    <div
      className="space-y-2 rounded-2xl border border-violet-300/25 bg-violet-500/10 p-4"
      data-testid="build-progress-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-bold uppercase tracking-wider text-violet-100">
          {done
            ? "Build complete"
            : cancelled
              ? "Build cancelled"
              : failed
                ? "Build failed"
                : status === "cancelling"
                  ? "Cancelling…"
                  : active
                    ? "Rendering…"
                    : "Build"}
        </div>
        <div className="flex items-center gap-2">
          {canCancel ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelBusy || status === "cancelling"}
              data-testid="cancel-build"
              className="rounded-lg border border-rose-400/40 bg-rose-500/15 px-3 py-1 text-[11px] font-bold text-rose-100 hover:bg-rose-500/25 disabled:opacity-50"
            >
              {cancelBusy || status === "cancelling" ? "Cancelling…" : "Cancel build"}
            </button>
          ) : null}
          <div className="text-sm font-black tabular-nums text-violet-50">{pct}%</div>
        </div>
      </div>

      <div className="relative h-3 overflow-hidden rounded-full bg-black/40">
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
        />
      </div>

      <div className="flex flex-wrap justify-between gap-2 text-[11px] text-white/60">
        <span>
          {active ? (
            <>
              Time left: <span className="font-bold text-white/90">{formatCountdown(remainingSec)}</span>
            </>
          ) : done ? (
            "Finished"
          ) : cancelled ? (
            "Stopped by user"
          ) : failed ? (
            "Check log for errors"
          ) : (
            `Est. ${estimatedLabel || ""}`
          )}
        </span>
        {message ? <span className="text-white/40">{message}</span> : null}
      </div>
    </div>
  );
});

function formatCountdown(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m > 0) return `${m}:${String(r).padStart(2, "0")}`;
  return `${s}s`;
}
