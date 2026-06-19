"use client";

import { memo } from "react";
import { useProjectWorkspace } from "../context/project-workspace-context";
import { triggerImportBundleClick } from "../lib/panel-help";

const btn =
  "rounded-lg border border-white/15 bg-black/35 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white/75 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35";

/**
 * Standard Save · Load · Clear · Help row for any panel.
 * @param {object} props
 * @param {string} props.topic — help dialog key
 * @param {(() => void)|undefined} props.onSave
 * @param {(() => void)|undefined} props.onLoad
 * @param {(() => void)|undefined} props.onClear
 * @param {boolean} [props.clearDisabled]
 * @param {string} [props.saveLabel]
 * @param {string} [props.loadLabel]
 * @param {string} [props.clearLabel]
 */
export const PanelActions = memo(function PanelActions({
  topic,
  onSave,
  onLoad,
  onClear,
  clearDisabled = false,
  saveLabel = "Save",
  loadLabel = "Load",
  clearLabel = "Clear",
}) {
  const ws = useProjectWorkspace();

  return (
    <div className="flex shrink-0 flex-wrap gap-1" data-testid={`panel-actions-${topic}`}>
      <button
        type="button"
        className={`${btn} border-emerald-400/30 text-emerald-100`}
        onClick={() => (onSave ? onSave() : ws.saveProject())}
        title="Save project to browser storage"
      >
        {saveLabel}
      </button>
      <button
        type="button"
        className={`${btn} border-cyan-400/30 text-cyan-100`}
        onClick={() => (onLoad ? onLoad() : triggerImportBundleClick())}
        title="Import project bundle (JSON)"
      >
        {loadLabel}
      </button>
      <button
        type="button"
        className={`${btn} border-red-400/30 text-red-100`}
        onClick={() => onClear?.()}
        disabled={clearDisabled || !onClear}
        title={clearDisabled || !onClear ? "Nothing to clear" : "Clear this panel's data"}
      >
        {clearLabel}
      </button>
      <button
        type="button"
        className={`${btn} border-violet-400/30 text-violet-100`}
        onClick={() => ws.openHelp(topic)}
        title="Help for this panel"
      >
        Help
      </button>
    </div>
  );
});
