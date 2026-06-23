/**
 * Shared bundle import — file picker, Electron path, and handoff sidecar audio.
 */

import { parseProjectBundleImport } from "./project-bundle";
import { applyProjectHandoff } from "./project-handoff";
import { migrateImportedProject } from "./project-persistence";
import { saveGpuWorkflowSettings } from "./gpu-workflow-functions";
import { saveDirectorSettingsToStorage, loadDirectorSettingsFromStorage } from "./director-settings";
import { saveOpenSoraSettingsToStorage } from "./open-sora-settings";
import { mergeCustomPresetsMaps } from "./project-bundle";
import {
  extractCharacterVoicePresetsFromProject,
  persistCharacterVoicePresets,
} from "./voice-character-preset";
import {
  extractCharacterVoiceStudioSessionFromProject,
  persistCharacterVoiceStudioSession,
} from "./voice-character-studio-session";
import { storageFailureMessage, safeLocalStorage } from "./safe-local-storage";
import { hydrateAudioSidecarAnalysis } from "./audio-sidecar-import";

const PRESET_KEY = "ai_video_creator_custom_presets_v1";

/**
 * @param {object} params
 */
export async function applyParsedBundleImport(params) {
  const {
    raw,
    appVersion,
    captureSnapshot,
    loadState,
    setCustomPresets,
    setStatusWithTime,
    handoffActions = {},
    audioSidecarBuffer = null,
  } = params;

  captureSnapshot?.("before import");

  const {
    project,
    customPresets: importedPresets,
    gpuWorkflow,
    directorSettings,
    openSoraSettings,
    handoff,
    bundleMeta,
  } = parseProjectBundleImport(raw);

  if (handoff?.audioAnalysis && params.audioSidecarBuffer?.byteLength) {
    handoff.audioAnalysis = await hydrateAudioSidecarAnalysis(
      handoff.audioAnalysis,
      params.audioSidecarBuffer,
      handoff.audioSidecarName || handoff.audioAnalysis.fileName,
    );
  }

  const cvPresets = extractCharacterVoicePresetsFromProject(project);
  if (cvPresets && Object.keys(cvPresets).length > 0) {
    const presetResult = persistCharacterVoicePresets(cvPresets, { merge: true });
    if (!presetResult.ok) {
      setStatusWithTime?.(storageFailureMessage(presetResult), "error");
    }
  }

  const cvSession = extractCharacterVoiceStudioSessionFromProject(project);
  if (cvSession !== null) {
    persistCharacterVoiceStudioSession(cvSession);
  }

  if (importedPresets && Object.keys(importedPresets).length > 0) {
    setCustomPresets?.((prev) => {
      const next = mergeCustomPresetsMaps(prev, importedPresets);
      const result = safeLocalStorage.setJSON(PRESET_KEY, next);
      if (!result.ok) {
        setStatusWithTime?.(storageFailureMessage(result), "error");
      }
      return next;
    });
  }

  if (gpuWorkflow) {
    saveGpuWorkflowSettings(gpuWorkflow);
  }

  const mergedDirector = {
    ...loadDirectorSettingsFromStorage(),
    ...(directorSettings || {}),
  };
  saveDirectorSettingsToStorage(mergedDirector);

  if (openSoraSettings) {
    saveOpenSoraSettingsToStorage(openSoraSettings);
  }

  const migrated = migrateImportedProject(project, appVersion);
  if (audioSidecarBuffer && handoff?.audioAnalysis) {
    migrated.audioSidecarImported = true;
  }
  loadState(migrated);

  let handoffResult = { applied: false };
  if (handoff) {
    handoffResult = applyProjectHandoff(handoff, handoffActions);
  }

  const sidecarNote =
    handoff?.audioAnalysis?.sidecarImported && handoff?.audioSidecarName
      ? ` · audio sidecar ${handoff.audioSidecarName} cached`
      : "";

  const versionNote = bundleMeta?.bundleVersion ? ` v${bundleMeta.bundleVersion}` : "";
  const handoffNote = handoffResult.applied ? ` — ${handoffResult.message}` : "";
  setStatusWithTime?.(`Imported project bundle${versionNote}${handoffNote}${sidecarNote}`);

  return { ok: true, handoff: handoffResult, bundleMeta };
}
