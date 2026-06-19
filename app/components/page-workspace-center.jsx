"use client";

import { memo } from "react";
import { CenterAnalyzersPanel } from "./center-analyzers-panel";
import {
  CenterCoProducerPanel,
  CenterCoProducerQuickPanel,
} from "./center-co-producer-panel";
import { CenterGuidedPathPanel } from "./center-guided-path-panel";
import { CenterIdeaPanel } from "./center-idea-panel";
import { CenterLyricStylePanel } from "./center-lyric-style-panel";
import { CenterMoodPanel } from "./center-mood-panel";
import { CenterMusicControlsPanel } from "./center-music-controls-panel";
import { CenterProModePanel } from "./center-pro-mode-panel";
import { CenterOpenSoraExportPanel } from "./center-open-sora-export-panel";
import { CenterSunoReimportPanel } from "./center-suno-reimport-panel";
import { CenterVariationsPanel } from "./center-variations-panel";

export const PageWorkspaceCenter = memo(function PageWorkspaceCenter() {
  return (
    <section className="space-y-4">
      <CenterGuidedPathPanel />
      <CenterIdeaPanel />
      <CenterLyricStylePanel />
      <CenterAnalyzersPanel />
      <CenterMoodPanel />
      <CenterMusicControlsPanel />
      <CenterCoProducerQuickPanel />
      <CenterCoProducerPanel />
      <CenterOpenSoraExportPanel />
      <CenterSunoReimportPanel />
      <CenterVariationsPanel />
      <CenterProModePanel />
    </section>
  );
});
