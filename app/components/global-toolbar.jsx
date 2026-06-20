"use client";

import { memo } from "react";
import { useProjectWorkspace } from "../context/project-workspace-context";
import { confirmProjectReset } from "../lib/project-reset";
import { triggerImportBundleClick } from "../lib/panel-help";

const btn =
  "rounded-xl px-3 py-2 text-xs font-bold transition hover:brightness-110 active:scale-[0.98]";

export const GlobalToolbar = memo(function GlobalToolbar() {
  const ws = useProjectWorkspace();

  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/40 p-2"
      data-testid="global-toolbar"
    >
      <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-white/40">Project</span>
      <button
        type="button"
        data-testid="global-save"
        className={`${btn} bg-emerald-300 text-black`}
        onClick={() => ws.saveProject()}
      >
        Save
      </button>
      <button
        type="button"
        data-testid="global-load"
        className={`${btn} bg-cyan-300 text-black`}
        onClick={() => triggerImportBundleClick()}
      >
        Load
      </button>
      <button
        type="button"
        data-testid="global-export"
        className={`${btn} border border-cyan-400/40 bg-cyan-500/20 text-cyan-100`}
        onClick={() => ws.exportProject()}
      >
        Export
      </button>
      <button
        type="button"
        data-testid="global-clear"
        className={`${btn} bg-red-400/90 text-black`}
        onClick={async () => {
          if (!(await confirmProjectReset())) return;
          ws.resetAll();
        }}
      >
        Clear all
      </button>
      <button
        type="button"
        data-testid="global-help"
        className={`${btn} bg-violet-300 text-black`}
        onClick={() => ws.openHelp("global")}
      >
        Help
      </button>
      <button
        type="button"
        className={`${btn} border border-amber-400/35 bg-amber-500/15 text-amber-100`}
        onClick={() => ws.revertSnapshot()}
      >
        Revert
      </button>
    </div>
  );
});
