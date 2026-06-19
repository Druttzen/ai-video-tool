"use client";

import { memo, useMemo, useState } from "react";
import { Panel } from "./ui-blocks";
import { PanelActions } from "./panel-actions";
import {
  buildIndexBrowseSections,
  getIndexManuscriptTemplates,
  getIndexModels,
  getIndexPresetBundles,
  getIndexPromptTemplates,
  getIndexRulesModelFixes,
  getIndexWorkflows,
  INDEX_SOURCES,
  INDEX_SYNCED_AT,
} from "../lib/video-creator-index";

export const VideoCreatorIndexPanel = memo(function VideoCreatorIndexPanel({
  copyToClipboard,
}) {
  const [query, setQuery] = useState("");
  const sections = useMemo(() => buildIndexBrowseSections(), []);
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return sections;
    return sections
      .map((s) => ({
        ...s,
        items: s.items.filter((item) => String(item).toLowerCase().includes(q)),
      }))
      .filter((s) => s.items.length > 0);
  }, [sections, q]);

  return (
    <Panel
      title="Video Creator Index"
      hint={`Workflows, bundles, manuscript, Director, styles, camera, lighting, mood, rules — synced ${INDEX_SYNCED_AT || "2026"}.`}
      data-testid="video-creator-index-panel"
      actions={<PanelActions topic="video-index" clearDisabled />}
    >
      <p className="mb-2 text-[10px] leading-relaxed text-white/45">
        Sources: {INDEX_SOURCES.slice(0, 3).join(" · ")}…
      </p>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search index…"
        className="mb-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-violet-300/40"
        data-testid="video-index-search"
      />

      <details className="mb-3 rounded-2xl border border-violet-400/25 bg-violet-500/10 p-3">
        <summary className="cursor-pointer text-xs font-bold text-violet-100">
          Workflows ({getIndexWorkflows().length})
        </summary>
        <ul className="mt-2 space-y-2 text-[11px] text-white/65">
          {getIndexWorkflows().map((w) => (
            <li key={w.id}>
              <span className="font-bold text-white/80">{w.title}</span>
              {w.models?.length ? (
                <span className="ml-1 text-white/40">({w.models.join(", ")})</span>
              ) : null}
              <div className="text-white/50">{(w.steps || []).join(" → ")}</div>
            </li>
          ))}
        </ul>
      </details>

      <details className="mb-3 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-3">
        <summary className="cursor-pointer text-xs font-bold text-cyan-100">
          Preset bundles ({getIndexPresetBundles().length})
        </summary>
        <ul className="mt-2 space-y-1 text-[11px] text-white/60">
          {getIndexPresetBundles().map((b) => (
            <li key={b.name}>
              <button
                type="button"
                className="text-left hover:text-cyan-100"
                onClick={() =>
                  copyToClipboard(
                    [b.name, ...(b.visualStyles || []), ...(b.camera || []), ...(b.lighting || [])].join(
                      ", ",
                    ),
                    `${b.name} bundle copied`,
                  )
                }
              >
                {b.name} — {b.visualStyles?.join("+")}
              </button>
            </li>
          ))}
        </ul>
      </details>

      <details className="mb-3 rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/10 p-3">
        <summary className="cursor-pointer text-xs font-bold text-fuchsia-100">
          Manuscript templates
        </summary>
        <ul className="mt-2 space-y-2 text-[11px] text-white/60">
          {getIndexManuscriptTemplates().map((t) => (
            <li key={t.label}>
              <div className="font-bold text-white/75">{t.label}</div>
              <button
                type="button"
                className="mt-0.5 text-left text-fuchsia-100/90 hover:underline"
                onClick={() => copyToClipboard(t.text, `${t.label} copied`)}
              >
                {t.text}
              </button>
            </li>
          ))}
        </ul>
      </details>

      <details className="mb-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3">
        <summary className="cursor-pointer text-xs font-bold text-amber-100">Model tips</summary>
        <ul className="mt-2 space-y-2 text-[11px] text-white/60">
          {Object.entries(getIndexModels()).map(([name, meta]) => (
            <li key={name}>
              <span className="font-bold text-white/80">{name}</span>: {meta.bestFor}
              {meta.tips?.length ? (
                <ul className="ml-3 mt-0.5 list-disc text-white/50">
                  {meta.tips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </details>

      <details className="mb-3 rounded-2xl border border-white/10 bg-black/25 p-3">
        <summary className="cursor-pointer text-xs font-bold text-white/70">Prompt templates</summary>
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[10px] text-white/55">
          {Object.entries(getIndexPromptTemplates())
            .map(([k, v]) => `${k}:\n${v}`)
            .join("\n\n")}
        </pre>
      </details>

      <details className="mb-3 rounded-2xl border border-white/10 bg-black/25 p-3">
        <summary className="cursor-pointer text-xs font-bold text-white/70">Rule fixes (by problem)</summary>
        <ul className="mt-2 space-y-1 text-[11px] text-white/55">
          {Object.entries(getIndexRulesModelFixes()).map(([problem, fix]) => (
            <li key={problem}>
              <span className="font-bold capitalize text-white/70">{problem}</span>: {fix}
            </li>
          ))}
        </ul>
      </details>

      <div className="max-h-64 space-y-3 overflow-y-auto">
        {filtered.map((section) => (
          <div key={section.id}>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/45">
              {section.label} ({section.items.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {section.items.slice(0, 24).map((item) => (
                <button
                  key={`${section.id}-${String(item).slice(0, 40)}`}
                  type="button"
                  onClick={() => copyToClipboard(String(item), "Index term copied")}
                  className="rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] text-white/60 hover:border-violet-300/40 hover:text-violet-100"
                >
                  {String(item).length > 48 ? `${String(item).slice(0, 45)}…` : item}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
});
