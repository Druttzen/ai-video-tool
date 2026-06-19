"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import {
  applyBenchmarkSuggestion,
  autoApplyRecommendedBenchmark,
  buildBenchmarkAutoContextKey,
  formatBenchmarkSummary,
  suggestBenchmarkSettings,
} from "../lib/benchmark-settings";
import { loadCachedSystemStats } from "../lib/system-stats";

export const DirectorBenchmarkSuggestionsPanel = memo(function DirectorBenchmarkSuggestionsPanel({
  settings,
  project,
  buildPlan,
  hasImageRef,
  promptLength,
  onApplySettings,
  onStatus,
}) {
  const useI2v = settings.useI2vWhenImage !== false && hasImageRef;
  const resolvedPromptLength = promptLength || 0;

  const report = useMemo(
    () =>
      suggestBenchmarkSettings({
        settings,
        stats: loadCachedSystemStats(),
        project,
        buildPlan,
        opts: {
          useI2v,
          promptLength: resolvedPromptLength,
        },
      }),
    [settings, project, buildPlan, useI2v, resolvedPromptLength],
  );

  const autoAppliedRef = useRef(false);

  useEffect(() => {
    const next = autoApplyRecommendedBenchmark({
      settings,
      report,
      opts: { useI2v, promptLength: resolvedPromptLength },
    });
    if (!next) return;
    onApplySettings(next);
    if (!autoAppliedRef.current) {
      autoAppliedRef.current = true;
      onStatus?.("Recommended benchmark applied automatically");
    }
  }, [
    settings,
    report,
    useI2v,
    resolvedPromptLength,
    onApplySettings,
    onStatus,
  ]);

  const apply = (suggestion) => {
    const applied = applyBenchmarkSuggestion(settings, suggestion);
    const patch = {
      ...applied,
      benchmarkAutoApplied: suggestion.id === "recommended",
    };
    if (suggestion.id === "recommended") {
      patch.benchmarkAutoContextKey = buildBenchmarkAutoContextKey({
        tier: report.tier,
        demand: report.demand,
        useI2v,
        promptLength: resolvedPromptLength,
      });
    }
    onApplySettings(patch);
    onStatus?.(`Benchmark applied: ${suggestion.label}`);
  };

  const recommendedAutoApplied =
    settings.benchmarkProfile === "recommended" && settings.benchmarkAutoApplied;

  return (
    <div
      className="space-y-3 rounded-2xl border border-amber-300/20 bg-amber-500/5 p-4"
      data-testid="benchmark-suggestions-panel"
    >
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-amber-200/80">
          Suggested benchmark settings
        </div>
        <p className="mt-1 text-[11px] text-white/55">
          Based on your <span className="font-bold text-amber-100">{report.demandLabel}</span> project
          on <span className="font-bold text-amber-100">{report.tierLabel}</span> hardware
          {report.currentLoadPercent != null ? ` · current load ${report.currentLoadPercent}%` : ""}.
        </p>
        <p className="mt-0.5 text-[10px] text-white/40">
          {formatBenchmarkSummary(report)}
          {recommendedAutoApplied ? " · Recommended auto-applied" : ""}
        </p>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {report.suggestions.map((s) => {
          const isPrimary = s.id === report.primaryId;
          return (
            <article
              key={s.id}
              data-testid={`benchmark-suggestion-${s.id}`}
              className={`rounded-xl border p-3 ${
                isPrimary
                  ? "border-amber-300/45 bg-amber-400/10"
                  : "border-white/10 bg-black/25"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-white">
                    {s.label}
                    {isPrimary ? (
                      <span className="ml-2 rounded-full bg-amber-300/25 px-1.5 py-0.5 text-[9px] uppercase text-amber-100">
                        Best fit
                      </span>
                    ) : null}
                    {isPrimary && recommendedAutoApplied ? (
                      <span className="ml-1 rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[9px] uppercase text-emerald-200">
                        Auto
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[10px] text-white/45">{s.description}</p>
                </div>
                <div className="shrink-0 text-right text-[10px] tabular-nums text-white/55">
                  <div className={s.overLimit ? "text-rose-300" : "text-emerald-200"}>{s.loadPercent}%</div>
                  <div>{s.estimatedLabel}</div>
                </div>
              </div>

              <p className="mt-2 text-[10px] leading-relaxed text-white/50">{s.reason}</p>

              <div className="mt-2 flex flex-wrap gap-1 text-[9px] text-white/35">
                <span>{s.settings.outputResolution || `${s.settings.outputWidth}×${s.settings.outputHeight}`}</span>
                <span>·</span>
                <span>{s.settings.numSteps} steps</span>
                <span>·</span>
                <span>{s.settings.numFrames} fr</span>
                <span>·</span>
                <span>{s.settings.qualityPreset}</span>
              </div>

              <button
                type="button"
                data-testid={`apply-benchmark-${s.id}`}
                onClick={() => apply(s)}
                className={`mt-2 w-full rounded-lg px-3 py-1.5 text-[11px] font-bold ${
                  isPrimary
                    ? "bg-amber-300 text-black hover:bg-amber-200"
                    : "border border-white/15 bg-white/10 text-white hover:bg-white/15"
                }`}
              >
                Apply benchmark
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
});
