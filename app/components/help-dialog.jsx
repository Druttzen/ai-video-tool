"use client";

import { memo } from "react";
import { getPanelHelp } from "../lib/panel-help";

export const HelpDialog = memo(function HelpDialog({ topic, open, onClose }) {
  if (!open) return null;
  const help = getPanelHelp(topic);

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-dialog-title"
      data-testid="help-dialog"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-3xl border border-violet-400/30 bg-[#12151a] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="help-dialog-title" className="text-xl font-black text-violet-100">
            {help.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 px-3 py-1 text-xs font-bold text-white/70 hover:bg-white/10"
          >
            Close
          </button>
        </div>
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-white/70">{help.body}</div>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-2xl bg-violet-300 py-2 text-sm font-bold text-black hover:bg-violet-200"
        >
          Got it
        </button>
      </div>
    </div>
  );
});
