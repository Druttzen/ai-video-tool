"use client";

import { memo } from "react";
import { CenterAnalyzersPanel } from "./center-analyzers-panel";
import {
  CenterCoProducerPanel,
  CenterCoProducerQuickPanel,
} from "./center-co-producer-panel";
import { CenterGuidedPathPanel } from "./center-guided-path-panel";
import { CenterSetupHubPanel } from "./center-setup-hub-panel";
import { CenterOpenSoraExportPanel } from "./center-open-sora-export-panel";
import { CenterOpenSoraPromptStudio } from "./center-open-sora-prompt-studio";
import { CenterIdeaPanel } from "./center-idea-panel";
import { CenterLyricStylePanel } from "./center-lyric-style-panel";
import { CenterMoodPanel } from "./center-mood-panel";
import { CenterMusicControlsPanel } from "./center-music-controls-panel";
import { CenterMusicVideoPanel } from "./center-music-video-panel";
import { CenterMusicVideoWorkflowsPanel } from "./center-music-video-workflows-panel";
import { CenterGpuWorkflowPanel } from "./center-gpu-workflow-panel";
import { CenterManuscriptChatPanel } from "./center-manuscript-chat-panel";
import { CenterStyleDnaSearchPanel } from "./center-style-dna-search-panel";
import { CenterProModePanel } from "./center-pro-mode-panel";
import { CenterDirectorPanel } from "./center-director-panel";
import { CenterSunoReimportPanel } from "./center-suno-reimport-panel";
import { CenterVariationsPanel } from "./center-variations-panel";
import { CenterVoiceCharacterStudio } from "./center-voice-character-studio";

export const PageWorkspaceCenter = memo(function PageWorkspaceCenter() {
  return (
    <section className="space-y-4">
      <CenterSetupHubPanel />
      <CenterGuidedPathPanel />
      <CenterMusicVideoWorkflowsPanel />
      <CenterGpuWorkflowPanel />
      <CenterIdeaPanel />
      <CenterLyricStylePanel />
      <CenterAnalyzersPanel />
      <CenterMusicVideoPanel />
      <CenterManuscriptChatPanel />
      <CenterVoiceCharacterStudio />
      <CenterStyleDnaSearchPanel />
      <CenterMoodPanel />
      <CenterMusicControlsPanel />
      <CenterCoProducerQuickPanel />
      <CenterCoProducerPanel />
      <CenterDirectorPanel />
      <CenterOpenSoraPromptStudio />
      <CenterOpenSoraExportPanel />
      <CenterSunoReimportPanel />
      <CenterVariationsPanel />
      <CenterProModePanel />
    </section>
  );
});
