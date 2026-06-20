"use client";

import { memo, useEffect, useState } from "react";
import { Panel, Pill } from "./ui-blocks";
import {
  getOpenSoraExamplePrompts,
  getOpenSoraStyleProfiles,
  openSoraCatalogSyncedAt,
  openSoraCatalogSource,
} from "../lib/open-sora-catalog";
import {
  applyInspirationToProjectFields,
  applyInspirationToSettings,
  randomOpenSoraInspiration,
} from "../lib/open-sora-inspire";
import {
  advanceWizard,
  createWizardSession,
  WIZARD_QUESTIONS,
} from "../lib/open-sora-prompt-wizard";
import {
  applyOpenSoraSceneTemplateToProject,
  getOpenSoraSceneTemplate,
  OPEN_SORA_SCENE_TEMPLATES,
  openSoraTemplateSettingsPatch,
} from "../lib/open-sora-scene-templates";
import {
  applyInstallConfigToSettings,
  DEFAULT_OPEN_SORA_SETTINGS,
  loadOpenSoraSettingsFromStorage,
  saveOpenSoraSettingsToStorage,
} from "../lib/open-sora-settings";
import { openSoraCatalog } from "../lib/open-sora-catalog";
import { isElectronApp } from "../lib/electron-bridge";
import { useProjectWorkspace } from "../context/project-workspace-context";
import { PROJECT_RESET_EVENT } from "../lib/project-reset";

export const CenterOpenSoraPromptStudio = memo(function CenterOpenSoraPromptStudio() {
  const ws = useProjectWorkspace();
  const [settings, setSettings] = useState(DEFAULT_OPEN_SORA_SETTINGS);
  const [wizard, setWizard] = useState(createWizardSession());
  const [wizardInput, setWizardInput] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);

  useEffect(() => {
    const loaded = loadOpenSoraSettingsFromStorage();
    setSettings(applyInstallConfigToSettings(loaded, openSoraCatalog.config));
  }, []);

  useEffect(() => {
    const onProjectReset = () => {
      setSettings({ ...DEFAULT_OPEN_SORA_SETTINGS });
      setWizard(createWizardSession());
      setWizardInput("");
    };
    window.addEventListener(PROJECT_RESET_EVENT, onProjectReset);
    return () => window.removeEventListener(PROJECT_RESET_EVENT, onProjectReset);
  }, []);

  const persist = (next) => {
    setSettings(next);
    saveOpenSoraSettingsToStorage(next);
  };

  const styleProfiles = getOpenSoraStyleProfiles();
  const examples = getOpenSoraExamplePrompts(8);

  const handleInspire = () => {
    const bundle = randomOpenSoraInspiration(settings.styleProfile);
    const patch = applyInspirationToProjectFields(bundle);
    if (patch.idea) ws.setIdea(patch.idea);
    if (patch.selectedSounds?.length) ws.setSelectedSounds(patch.selectedSounds);
    if (patch.selectedRhythms?.length) ws.setSelectedRhythms(patch.selectedRhythms);
    if (patch.lyricTheme) ws.setLyricTheme(patch.lyricTheme);
    if (patch.tempo) ws.setTempo(patch.tempo);
    if (patch.structure) ws.setStructure(patch.structure);
    persist(applyInspirationToSettings(bundle, settings));
    ws.setStatusWithTime("Random inspiration loaded from Open-Sora pools");
  };

  const applyTemplate = (name) => {
    const t = getOpenSoraSceneTemplate(name) || OPEN_SORA_SCENE_TEMPLATES[name];
    if (!t) return;
    const patch = applyOpenSoraSceneTemplateToProject(t);
    if (patch.idea) ws.setIdea(patch.idea);
    if (patch.selectedRhythms?.length) ws.setSelectedRhythms(patch.selectedRhythms);
    if (patch.selectedSounds?.length) ws.setSelectedSounds(patch.selectedSounds);
    if (patch.lyricTheme) ws.setLyricTheme(patch.lyricTheme);
    if (patch.tempo) ws.setTempo(patch.tempo);
    if (patch.structure) ws.setStructure(patch.structure);
    persist({ ...settings, ...openSoraTemplateSettingsPatch(t) });
    ws.setStatusWithTime(`Scene template: ${name}`);
  };

  const runWizardStep = () => {
    const text = wizardInput.trim();
    if (!text) return;
    const result = advanceWizard({ ...wizard, styleName: settings.styleProfile }, text);
    setWizard(result.session);
    setWizardInput("");
    if (result.prompt) {
      ws.setIdea(result.prompt);
      ws.setStatusWithTime("Prompt wizard finished — prompt applied to Idea");
    }
  };

  const handleSync = async () => {
    setSyncBusy(true);
    try {
      if (isElectronApp() && window.electronAPI?.syncOpenSoraCatalog) {
        const res = await window.electronAPI.syncOpenSoraCatalog(settings.installPath);
        if (res.ok) {
          ws.setStatusWithTime(`Catalog synced from ${settings.installPath} — reload app to refresh chips`);
        } else {
          ws.setStatusWithTime(res.error || "Sync failed");
        }
      } else {
        ws.setStatusWithTime("Run: npm run sync:open-sora-catalog (then reload)");
      }
    } finally {
      setSyncBusy(false);
    }
  };

  const wizardQuestion =
    wizard.step < WIZARD_QUESTIONS.length
      ? WIZARD_QUESTIONS[wizard.step]
      : wizard.topic
        ? null
        : "Describe what you want to create (subject + action)";

  return (
    <Panel
      title="Open-Sora Prompt Studio"
      hint="Style profiles, scene templates, inspiration, and step-by-step wizard — synced from your local Open-Sora install"
      data-testid="open-sora-prompt-studio"
    >
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-white/40">
        <span>
          Catalog:{" "}
          <span suppressHydrationWarning>
            {openSoraCatalogSyncedAt
              ? openSoraCatalogSyncedAt.replace("T", " ").slice(0, 16)
              : "not synced"}
          </span>
        </span>
        <span>·</span>
        <span>{openSoraCatalogSource}</span>
        <button
          type="button"
          disabled={syncBusy}
          onClick={handleSync}
          className="rounded-full border border-white/15 px-2 py-0.5 font-bold text-white/60 hover:bg-white/10"
        >
          {syncBusy ? "Syncing…" : "Sync from install"}
        </button>
      </div>

      <div className="mt-3">
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/45">Style profile</div>
        <div className="flex flex-wrap gap-2">
          {styleProfiles.map((s) => (
            <Pill
              key={s.name}
              active={settings.styleProfile === s.name}
              onClick={() => persist({ ...settings, styleProfile: s.name })}
            >
              {s.label.replace(/^[^\w]+/, "").trim() || s.label}
            </Pill>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleInspire}
          className="rounded-2xl border border-violet-400/40 bg-violet-500/15 px-4 py-2 text-xs font-bold text-violet-100 hover:bg-violet-500/25"
        >
          Inspire me
        </button>
        <button
          type="button"
          onClick={() => setWizard(createWizardSession())}
          className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/15"
        >
          Reset wizard
        </button>
        <label className="flex items-center gap-2 text-xs text-white/60">
          <input
            type="checkbox"
            checked={wizard.directorMode}
            onChange={(e) => setWizard({ ...wizard, directorMode: e.target.checked })}
          />
          Director mode (3-act)
        </label>
        <label className="flex items-center gap-2 text-xs text-white/60">
          <input
            type="checkbox"
            checked={wizard.expertMode}
            onChange={(e) => setWizard({ ...wizard, expertMode: e.target.checked })}
          />
          Expert metadata
        </label>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <div>
          {wizardQuestion ? (
            <p className="mb-1 text-[11px] text-cyan-200/80">{wizardQuestion}</p>
          ) : null}
          <input
            value={wizardInput}
            onChange={(e) => setWizardInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runWizardStep()}
            placeholder={wizard.topic ? "Your answer…" : "Start wizard: describe your scene…"}
            className="w-full rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none focus:border-cyan-300"
          />
        </div>
        <button
          type="button"
          onClick={runWizardStep}
          className="rounded-2xl bg-cyan-300 px-4 py-2 text-sm font-bold text-black hover:bg-cyan-200"
        >
          Next
        </button>
      </div>

      <div className="mt-4">
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/45">Scene templates</div>
        <div className="flex flex-wrap gap-2">
          {Object.keys(OPEN_SORA_SCENE_TEMPLATES).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => applyTemplate(name)}
              className="rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-[11px] font-bold text-violet-100 hover:bg-violet-500/20"
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {examples.length ? (
        <div className="mt-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/45">Example prompts (Open-Sora CSV)</div>
          <div className="max-h-32 space-y-1 overflow-auto">
            {examples.map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  ws.setIdea(ex.text);
                  ws.setStatusWithTime("Example prompt loaded");
                }}
                className="block w-full rounded-xl border border-white/5 bg-black/25 px-3 py-2 text-left text-[11px] text-white/70 hover:border-cyan-300/30 hover:text-white"
              >
                {ex.text.slice(0, 120)}
                {ex.text.length > 120 ? "…" : ""}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </Panel>
  );
});
