"use client";

import { memo } from "react";
import { Panel, Pill, SearchablePillGrid } from "./ui-blocks";
import { genreOptions, rhythmOptions, soundOptions, vocalOptions } from "../lib/video-config";
import { useProjectWorkspace } from "../context/project-workspace-context";

export const CenterMusicControlsPanel = memo(function CenterMusicControlsPanel() {
  const ws = useProjectWorkspace();

  return (
    <Panel
      title="Step 3 — Visual Controls"
      hint="Pick visual style, camera motion, lighting, pacing, and audio/narration mode for your Sora scene prompt."
    >
      <SearchablePillGrid
        label="Visual style"
        hint="Primary look — cinematic, documentary, anime, etc."
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
        hint="Mood and time-of-day cues for the scene."
        options={soundOptions}
        selected={ws.selectedSounds}
        onToggle={(x) => ws.toggle(x, ws.selectedSounds, ws.setSelectedSounds)}
      />
      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/45">Audio / narration</div>
        <div className="flex flex-wrap gap-2">
          {vocalOptions.map((x) => (
            <Pill key={x} active={ws.vocal === x} onClick={() => ws.setVocal(x)}>
              {x}
            </Pill>
          ))}
        </div>
      </div>
    </Panel>
  );
});
