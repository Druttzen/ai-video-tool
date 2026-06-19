"use client";

import { memo } from "react";

const STATUS_STYLES = {
  ok: "text-emerald-200",
  warn: "text-amber-200",
  over: "text-rose-300",
};

const BAR_STYLES = {
  ok: "bg-emerald-400",
  warn: "bg-amber-400",
  over: "bg-rose-500",
};

export const DirectorVideoLengthPunishmentPanel = memo(function DirectorVideoLengthPunishmentPanel({
  punishment,
  onApplyDuration,
}) {
  if (!punishment) return null;

  const status = punishment.status || "ok";
  const barWidth = Math.min(100, punishment.punishmentPercent);
  const overflow = punishment.punishmentPercent > 100;
  const hasSuggestion =
    punishment.buildSuggestion &&
    punishment.suggestedDurationSec !== punishment.durationSec;

  return (
    <div
      className="space-y-3 rounded-2xl border border-orange-300/20 bg-orange-500/5 p-4"
      data-testid="video-length-punishment-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-orange-200/80">
            Video length punishment
          </div>
          <p className="mt-1 text-[11px] text-white/55">
            Your <span className="font-bold text-orange-100">{punishment.durationSec}s</span> clip on{" "}
            <span className="font-bold text-orange-100">{punishment.tierLabel}</span> hardware
            {punishment.secondsOverComfort > 0
              ? ` · ${punishment.secondsOverComfort}s over ${punishment.comfortSec}s comfort`
              : ` · within ${punishment.comfortSec}s comfort`}
            .
          </p>
          <p className="mt-0.5 text-[10px] text-white/40">{punishment.summary}</p>
        </div>

        <div className="text-right">
          <div className={`text-2xl font-black tabular-nums ${STATUS_STYLES[status]}`}>
            +{punishment.punishmentPoints}
          </div>
          <div className="text-[9px] uppercase tracking-wider text-white/35">punishment pts</div>
          <div className={`mt-1 text-sm font-bold tabular-nums ${STATUS_STYLES[status]}`}>
            {punishment.punishmentPercent}%
          </div>
        </div>
      </div>

      <div className="relative h-2.5 overflow-hidden rounded-full bg-black/50">
        <div
          className={`h-full rounded-full ${BAR_STYLES[status]}`}
          style={{ width: `${barWidth}%` }}
        />
        {overflow ? (
          <div
            className="absolute inset-y-0 right-0 bg-rose-600/80"
            style={{ width: `${Math.min(40, punishment.punishmentPercent - 100)}%` }}
          />
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-3 text-[10px]">
        <div className="rounded-lg border border-white/10 bg-black/25 px-2 py-1.5">
          <div className="text-white/40">Comfort</div>
          <div className="font-bold text-white/80">{punishment.comfortSec}s</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/25 px-2 py-1.5">
          <div className="text-white/40">Your length</div>
          <div className="font-bold text-orange-100">{punishment.durationSec}s</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/25 px-2 py-1.5">
          <div className="text-white/40">Tier max</div>
          <div className="font-bold text-white/80">{punishment.maxSec}s</div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-[11px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-white/50">Build time (your length)</span>
          <span className="font-bold text-orange-100">{punishment.estimatedBuildLabel || "—"}</span>
        </div>
        {punishment.extraDurationSeconds > 0 ? (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[10px] text-white/45">
            <span>Extra from length vs comfort baseline</span>
            <span className="font-bold text-amber-200/90">+{punishment.extraDurationLabel}</span>
          </div>
        ) : null}
        {hasSuggestion ? (
          <div className="mt-2 border-t border-white/10 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-white/55">
                Suggested:{" "}
                <span className="font-bold text-emerald-200">{punishment.suggestedDurationLabel}</span>
              </span>
              <span className="font-bold text-emerald-200">{punishment.suggestedBuildLabel}</span>
            </div>
            {punishment.timeSavedLabel ? (
              <p className="mt-1 text-[10px] text-white/40">
                Saves ~{punishment.timeSavedLabel} vs your {punishment.durationSec}s choice.
              </p>
            ) : null}
            {onApplyDuration ? (
              <button
                type="button"
                data-testid="apply-suggested-duration"
                onClick={() => onApplyDuration(String(punishment.suggestedDurationSec))}
                className="mt-2 w-full rounded-lg bg-emerald-400/90 px-3 py-1.5 text-[11px] font-bold text-black hover:bg-emerald-300"
              >
                Use {punishment.suggestedDurationLabel} suggested length
              </button>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-[10px] text-emerald-200/80">
            Length is within a good range for this hardware tier.
          </p>
        )}
      </div>
    </div>
  );
});
