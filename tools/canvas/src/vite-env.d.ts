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
      onsetCount?: number;
      bpm?: number;
      source?: string;
      vocalsLikely?: boolean;
    };
  };
  imageAnalysis?: {
    suggestedGenres?: string[];
    suggestedSounds?: string[];
    suggestedRhythms?: string[];
    visualMood?: string;
    avgColor?: string;
    dominantHue?: number;
    hueLabel?: string;
    colorTemperature?: string;
    aspectLabel?: string;
    aspectRatio?: number;
    source?: string;
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
  clipPlannedTotal?: number;
  clipIndex?: number;
  clipStart?: number | null;
  clipEnd?: number | null;
  clipDuration?: number | null;
  assembledOutputPath?: string | null;
  logPath?: string | null;
  updatedAt?: number | null;
  renderPythonSource?: string | null;
};

type CanvasSetupSummaryRow = {
  ready?: number;
  optionalReady?: number;
  total?: number;
  localRenderReady?: boolean;
  label?: string;
};

type CanvasSetupSummary = {
  summary?: CanvasSetupSummaryRow;
  modules?: Array<{ id: string; status?: string; message?: string }>;
};

type CanvasAgentSummary = {
  phase?: string;
  messageCount?: number;
};

type CanvasCoProducer = {
  provider?: string;
  model?: string;
};

type CanvasBuildIntent = {
  buildTarget?: string;
  workflowPath?: number;
  workflowIntent?: string;
  recommendedActionId?: string | null;
  durationMode?: string;
  multiClip?: boolean;
  clipCount?: number;
  lipSync?: boolean;
  title?: string;
  concept?: string;
  directorBrief?: string;
  canvasSummary?: string;
  canvasIntent?: string;
  reasoning?: string;
  userRequest?: string;
};

type CanvasPayload = {
  title?: string;
  exportedAt?: string;
  appVersion?: string;
  project?: CanvasProject;
  handoff?: CanvasHandoff;
  directorSettings?: CanvasDirectorSettings;
  production?: CanvasProduction | null;
  agentSummary?: CanvasAgentSummary | null;
  coProducer?: CanvasCoProducer | null;
  setup?: CanvasSetupSummary | null;
  buildIntent?: CanvasBuildIntent | null;
};

interface CanvasAPI {
  getInitialPayload: () => Promise<CanvasPayload | null>;
  onPayload: (callback: (payload: CanvasPayload) => void) => () => void;
  getAppVersion: () => Promise<{ ok: boolean; version?: string; error?: string }>;
  revealPath: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
  requestRefresh: () => Promise<{ ok: boolean; error?: string }>;
}

interface Window {
  canvasAPI?: CanvasAPI;
}

