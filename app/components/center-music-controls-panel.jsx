"use client";

import { memo, useEffect, useState } from "react";
import { Panel, SearchablePillGrid } from "./ui-blocks";
import { PanelActions } from "./panel-actions";
import { genreOptions, rhythmOptions, soundOptions, vocalOptions } from "../lib/video-config";
import {
  getDirectorCameraPresets,
  getDirectorColorGrades,
  getDirectorFilmFormats,
  getDirectorLensKits,
  getDirectorLightingSetups,
  getDirectorShotTypes,
} from "../lib/director-catalog";
import {
  DEFAULT_DIRECTOR_SETTINGS,
  loadDirectorSettingsFromStorage,
  saveDirectorSettingsToStorage,
} from "../lib/director-settings";
import { useProjectWorkspace } from "../context/project-workspace-context";

function CraftPill({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[11px] font-bold transition ${
        active
          ? "border-cyan-300 bg-cyan-300/20 text-cyan-100"
          : "border-white/10 bg-black/25 text-white/55 hover:bg-white/10"
      }`}
    >
      {label}
    </button>
  );
}

export const CenterMusicControlsPanel = memo(function CenterMusicControlsPanel() {
  const ws = useProjectWorkspace();
  const isDirector = ws.promptEngine === "Director" || ws.promptEngine === "Open-Sora";
  const [craft, setCraft] = useState(DEFAULT_DIRECTOR_SETTINGS);

  useEffect(() => {
    if (isDirector) setCraft(loadDirectorSettingsFromStorage());
  }, [isDirector]);

  const persistCraft = (patch) => {
    const next = { ...craft, ...patch };
    setCraft(next);
    saveDirectorSettingsToStorage(next);
  };

  const pickCraft = (key, value) => {
    persistCraft({ [key]: craft[key] === value ? "" : value });
  };

  return (
    <Panel
      title="Step 3 — Visual Controls"
      hint={
        isDirector
          ? "Visual style, camera, lighting, and Director craft (shot type, camera body, lens, grade)."
          : "Pick visual style, camera motion, lighting, and audio/narration mode."
      }
      actions={
        <PanelActions
          topic="music-controls"
          onClear={() => {
            ws.setSelectedGenres([]);
            ws.setSelectedSounds([]);
            ws.setSelectedRhythms([]);
          }}
        />
      }
    >
      <SearchablePillGrid
        label="Visual style"
        options={genreOptions}
        selected={ws.selectedGenres}
        onToggle={(x) => ws.toggle(x, ws.selectedGenres, ws.setSelectedGenres)}
      />
      <SearchablePillGrid
        label="Camera motion"
        options={rhythmOptions}
        selected={ws.selectedRhythms}
        onToggle={(x) => ws.toggle(x, ws.selectedRhythms, ws.setSelectedRhythms)}
      />
      <SearchablePillGrid
        label="Lighting"
        options={soundOptions}
        selected={ws.selectedSounds}
        onToggle={(x) => ws.toggle(x, ws.selectedSounds, ws.setSelectedSounds)}
      />

      {isDirector ? (
        <div className="mt-4 space-y-4 rounded-2xl border border-cyan-300/15 bg-cyan-500/5 p-3">
          <div className="text-xs font-bold uppercase tracking-wider text-cyan-200/80">Director craft</div>
          <div>
            <div className="mb-2 text-[11px] text-white/45">Shot type</div>
            <div className="flex flex-wrap gap-2">
              {getDirectorShotTypes().map((x) => (
                <CraftPill key={x} label={x} active={craft.shotType === x} onClick={() => pickCraft("shotType", x)} />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-[11px] text-white/45">Camera body</div>
            <div className="flex flex-wrap gap-2">
              {getDirectorCameraPresets().slice(0, 12).map((x) => (
                <CraftPill key={x} label={x} active={craft.cameraPreset === x} onClick={() => pickCraft("cameraPreset", x)} />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-[11px] text-white/45">Lens kit</div>
            <div className="flex flex-wrap gap-2">
              {getDirectorLensKits().map((x) => (
                <CraftPill key={x} label={x} active={craft.lensKit === x} onClick={() => pickCraft("lensKit", x)} />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-[11px] text-white/45">Film format</div>
            <div className="flex flex-wrap gap-2">
              {getDirectorFilmFormats().map((x) => (
                <CraftPill key={x} label={x} active={craft.filmFormat === x} onClick={() => pickCraft("filmFormat", x)} />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-[11px] text-white/45">Color grade</div>
            <div className="flex flex-wrap gap-2">
              {getDirectorColorGrades().map((x) => (
                <CraftPill key={x} label={x} active={craft.colorGrade === x} onClick={() => pickCraft("colorGrade", x)} />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-[11px] text-white/45">Lighting setup</div>
            <div className="flex flex-wrap gap-2">
              {getDirectorLightingSetups().map((x) => (
                <CraftPill key={x} label={x} active={craft.lightingSetup === x} onClick={() => pickCraft("lightingSetup", x)} />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/45">Audio / narration</div>
        <div className="flex flex-wrap gap-2">
          {vocalOptions.map((x) => (
            <CraftPill key={x} label={x} active={ws.vocal === x} onClick={() => ws.setVocal(x)} />
          ))}
        </div>
      </div>
    </Panel>
  );
});
