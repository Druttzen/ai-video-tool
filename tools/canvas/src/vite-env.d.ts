/// <reference types="vite/client" />

type CanvasHandoff = {
  source?: string;
  intent?: string;
  musicAppVersion?: string;
  durationMode?: string;
  audioAnalysis?: {
    fileName?: string;
    bpm?: number;
    durationSec?: number;
    highlightStart?: number;
    highlightEnd?: number;
    sidecarImported?: boolean;
    beatSync?: {
      clipPlan?: Array<{ start: number; end: number; duration?: number; label?: string }>;
      beatCount?: number;
      bpm?: number;
      source?: string;
    };
  };
  imageAnalysis?: {
    suggestedGenres?: string[];
    suggestedSounds?: string[];
    suggestedRhythms?: string[];
  };
};

type CanvasProject = {
  idea?: string;
  tempo?: string;
  structure?: string;
  selectedGenres?: string[];
  selectedRhythms?: string[];
  selectedSounds?: string[];
  durationSeconds?: string;
};

type CanvasDirectorSettings = {
  renderBackend?: string;
  localRenderEngine?: string;
  qualityPreset?: string;
  aspectRatio?: string;
  numFrames?: number;
  fps?: number;
  durationSeconds?: string;
  wanModelId?: string;
};

type CanvasProduction = {
  phase?: string;
  multiClip?: boolean;
  clipTotal?: number;
  clipCurrent?: number;
  clipsRendered?: number;
  clipStatus?: string;
  clipLabel?: string;
  multiClipNote?: string;
  renderMessage?: string;
  lastOutputPath?: string;
  lastError?: string;
};

type CanvasSetupSummary = {
  summary?: { label?: string; localRenderReady?: boolean };
  modules?: Array<{ id: string; status?: string; message?: string }>;
};

type CanvasPayload = {
  title?: string;
  exportedAt?: string;
  project?: CanvasProject;
  handoff?: CanvasHandoff;
  directorSettings?: CanvasDirectorSettings;
  production?: CanvasProduction;
  setup?: CanvasSetupSummary;
};

interface CanvasAPI {
  getInitialPayload: () => Promise<CanvasPayload | null>;
  onPayload: (callback: (payload: CanvasPayload) => void) => () => void;
}

interface Window {
  canvasAPI?: CanvasAPI;
}
