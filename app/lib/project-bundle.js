/**
 * Portable project bundles — full workspace profile for share/import.
 * Includes project snapshot, custom style presets, character presets, and studio session.
 */

import { attachCharacterVoiceFieldsToProjectExport } from "./voice-character-studio-session";
import { loadGpuWorkflowSettings } from "./gpu-workflow-functions";
import { loadDirectorSettingsFromStorage } from "./director-settings";
import { loadOpenSoraSettingsFromStorage } from "./open-sora-settings";
import {
  extractCharacterVoicePresetsFromProject,
  normalizeCharacterPresetsMap,
} from "./voice-character-preset";
import {
  extractCharacterVoiceStudioSessionFromProject,
  normalizeCharacterVoiceStudioSession,
} from "./voice-character-studio-session";

export const PROJECT_BUNDLE_FORMAT = "ai-video-creator-bundle";
/** @deprecated Import-only alias — exports use PROJECT_BUNDLE_FORMAT */
export const PROJECT_BUNDLE_FORMAT_LEGACY = "ai-music-creator-bundle";
export const PROJECT_BUNDLE_FORMATS = [PROJECT_BUNDLE_FORMAT, PROJECT_BUNDLE_FORMAT_LEGACY];
export const PROJECT_BUNDLE_VERSION = 2;

function isKnownBundleFormat(format) {
  return PROJECT_BUNDLE_FORMATS.includes(String(format || ""));
}

/**
 * @param {unknown} presets
 */
export function normalizeCustomPresetsMap(presets) {
  if (!presets || typeof presets !== "object" || Array.isArray(presets)) return {};
  /** @type {Record<string, object>} */
  const out = {};
  for (const [name, value] of Object.entries(presets)) {
    const key = String(name || "").trim();
    if (!key || !value || typeof value !== "object") continue;
    out[key] = value;
  }
  return out;
}

/**
 * @param {Record<string, unknown>} project
 * @param {Record<string, object>} [customPresets]
 * @param {string} appVersion
 */
export function buildProjectBundleExport(project, customPresets = {}, appVersion = "") {
  const withVoice = attachCharacterVoiceFieldsToProjectExport(project);
  const { characterVoicePresets, characterVoiceStudioSession, ...projectCore } = withVoice;

  const bundle = {
    bundleFormat: PROJECT_BUNDLE_FORMAT,
    bundleVersion: PROJECT_BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: appVersion || String(project.appVersion || ""),
    project: projectCore,
  };

  const stylePresets = normalizeCustomPresetsMap(customPresets);
  if (Object.keys(stylePresets).length) bundle.customPresets = stylePresets;

  if (characterVoicePresets && Object.keys(characterVoicePresets).length) {
    bundle.characterVoicePresets = characterVoicePresets;
  }
  if (characterVoiceStudioSession) {
    bundle.characterVoiceStudioSession = characterVoiceStudioSession;
  }

  const gpuWorkflow = loadGpuWorkflowSettings();
  if (gpuWorkflow?.enabledIds?.length) {
    bundle.gpuWorkflow = gpuWorkflow;
  }

  const directorSettings = loadDirectorSettingsFromStorage();
  if (directorSettings && Object.keys(directorSettings).length) {
    bundle.directorSettings = directorSettings;
  }

  const openSoraSettings = loadOpenSoraSettingsFromStorage();
  if (openSoraSettings && Object.keys(openSoraSettings).length) {
    bundle.openSoraSettings = openSoraSettings;
  }

  return bundle;
}

/**
 * Accept bundled export or legacy flat project JSON.
 * @param {unknown} raw
 */
export function parseProjectBundleImport(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid project file");
  }

  if (isKnownBundleFormat(raw.bundleFormat)) {
    const project = raw.project && typeof raw.project === "object" ? { ...raw.project } : {};
    if (raw.appVersion) project.appVersion = raw.appVersion;

    if (raw.characterVoicePresets) {
      project.characterVoicePresets = raw.characterVoicePresets;
    }
    if (raw.characterVoiceStudioSession) {
      project.characterVoiceStudioSession = raw.characterVoiceStudioSession;
    }

    const handoff =
      raw.handoff && typeof raw.handoff === "object" ? { ...raw.handoff } : null;

    return {
      project,
      customPresets: normalizeCustomPresetsMap(raw.customPresets),
      gpuWorkflow: raw.gpuWorkflow && typeof raw.gpuWorkflow === "object" ? raw.gpuWorkflow : null,
      directorSettings:
        raw.directorSettings && typeof raw.directorSettings === "object" ? raw.directorSettings : null,
      openSoraSettings:
        raw.openSoraSettings && typeof raw.openSoraSettings === "object" ? raw.openSoraSettings : null,
      handoff,
      bundleMeta: {
        exportedAt: raw.exportedAt || null,
        bundleVersion: raw.bundleVersion ?? PROJECT_BUNDLE_VERSION,
        handoffSource: handoff?.source || null,
        handoffIntent: handoff?.intent || null,
      },
    };
  }

  /** Legacy flat project JSON (pre-bundle). */
  return {
    project: { ...raw },
    customPresets: normalizeCustomPresetsMap(raw.customPresets),
    gpuWorkflow: raw.gpuWorkflow && typeof raw.gpuWorkflow === "object" ? raw.gpuWorkflow : null,
    directorSettings: null,
    openSoraSettings: null,
    handoff: null,
    bundleMeta: null,
  };
}

/**
 * Merge imported custom presets into existing map (import wins on name clash).
 * @param {Record<string, object>} existing
 * @param {Record<string, object>} incoming
 */
export function mergeCustomPresetsMaps(existing, incoming) {
  return { ...existing, ...incoming };
}

/**
 * @param {unknown} raw
 */
export function summarizeProjectBundle(raw) {
  try {
    const { project, customPresets, bundleMeta } = parseProjectBundleImport(raw);
    const cvPresets = extractCharacterVoicePresetsFromProject(project);
    const cvSession = extractCharacterVoiceStudioSessionFromProject(project);
    return {
      ok: true,
      isBundle: isKnownBundleFormat(raw?.bundleFormat),
      appVersion: project.appVersion || null,
      guidedStep: typeof project.guidedStep === "number" ? project.guidedStep : 0,
      customPresetCount: Object.keys(customPresets).length,
      characterPresetCount: cvPresets ? Object.keys(cvPresets).length : 0,
      hasStudioSession: Boolean(
        cvSession && normalizeCharacterVoiceStudioSession(cvSession).voiceAnalysis,
      ),
      exportedAt: bundleMeta?.exportedAt ?? null,
    };
  } catch {
    return { ok: false };
  }
}
