import { APP_VERSION, STORAGE_KEY } from "./video-config";
import { DEFAULT_DIRECTOR_SETTINGS, saveDirectorSettingsToStorage } from "./director-settings";
import {
  DEFAULT_GPU_WORKFLOW_SETTINGS,
  saveGpuWorkflowSettings,
} from "./gpu-workflow-functions";
import {
  DEFAULT_OPEN_SORA_SETTINGS,
  saveOpenSoraSettingsToStorage,
} from "./open-sora-settings";
import { saveManuscriptChatHistory } from "./manuscript-video-chat";
import { attachCharacterVoiceFieldsToProjectExport } from "./voice-character-studio-session";
import { slimStateForPersistence } from "./project-persistence";
import {
  buildProjectSnapshot,
  createInitialProjectState,
  pickSnapshotFields,
  projectReducer,
} from "./project-state";
import { isElectronApp } from "./electron-bridge";
import { safeLocalStorage } from "./safe-local-storage";

export const PROJECT_RESET_EVENT = "project-workspace-reset";
const UNDO_SESSION_KEY = "ai_video_creator_undo_snapshot_v1";

/** Build a blank autosave payload (no analyzers, empty prompts). */
export function buildBlankProjectSnapshot(appVersion = APP_VERSION) {
  const blank = projectReducer(createInitialProjectState(), { type: "RESET_BLANK" });
  return buildProjectSnapshot(
    appVersion,
    pickSnapshotFields({ ...blank, audioAnalysis: null, imageAnalysis: null }),
  );
}

export function resetPersistedPanelSettings() {
  saveDirectorSettingsToStorage({ ...DEFAULT_DIRECTOR_SETTINGS });
  saveGpuWorkflowSettings({ ...DEFAULT_GPU_WORKFLOW_SETTINGS });
  saveOpenSoraSettingsToStorage({ ...DEFAULT_OPEN_SORA_SETTINGS });
  saveManuscriptChatHistory([]);
  try {
    sessionStorage.removeItem(UNDO_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function dispatchProjectResetEvent() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PROJECT_RESET_EVENT));
}

/**
 * Persist blank project immediately so reload does not restore DEFAULT prefill.
 * @param {{ current?: string } | null | undefined} lastAutosavePayloadRef
 */
export function persistBlankProjectNow(lastAutosavePayloadRef) {
  const payload = JSON.stringify(
    attachCharacterVoiceFieldsToProjectExport(slimStateForPersistence(buildBlankProjectSnapshot())),
  );
  const result = safeLocalStorage.set(STORAGE_KEY, payload);
  if (result.ok && lastAutosavePayloadRef) {
    lastAutosavePayloadRef.current = payload;
  }
  return result;
}

export async function confirmProjectReset(
  message = "Reset entire project to defaults? Prompts, analyzers, Director, Open-Sora, GPU settings, and history will be cleared.",
) {
  if (typeof window === "undefined") return false;
  if (isElectronApp() && window.electronAPI?.confirmAction) {
    const result = await window.electronAPI.confirmAction({
      title: "Reset project",
      message,
    });
    return Boolean(result?.ok);
  }
  return window.confirm(message);
}
