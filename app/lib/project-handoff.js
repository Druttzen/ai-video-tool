/**
 * Cross-app handoff — AI Music Creator → AI Video Creator.
 */

import { MV_DURATION_MODES } from "./audio-visual-music-video";
import { buildMusicVideoPatchFromAudioAndImage } from "./music-video-bridge";
import { saveDirectorSettingsToStorage } from "./director-settings";
import { scrollToDirectorPanelAfterApply } from "./music-video-workflows";

export const HANDOFF_SOURCE_MUSIC = "ai-music-creator";

export const HANDOFF_INTENTS = {
  MUSIC_VIDEO_PATH_E: "music-video-path-e",
  MUSIC_VIDEO_TRACK: "music-video-track",
  PROJECT_ONLY: "project-only",
};

/**
 * @typedef {object} ProjectHandoff
 * @property {string} source
 * @property {string} intent
 * @property {string} [exportedAt]
 * @property {string} [musicAppVersion]
 * @property {object} [audioAnalysis]
 * @property {object} [imageAnalysis]
 * @property {string} [audioSidecarName] — sibling WAV/MP3 next to bundle file
 * @property {string} [sunoPasteStyle]
 * @property {string} [sunoPasteLyrics]
 * @property {string} [durationMode]
 */

/**
 * @param {unknown} handoff
 */
export function normalizeProjectHandoff(handoff) {
  if (!handoff || typeof handoff !== "object") return null;
  const source = String(handoff.source || "").trim();
  const intent = String(handoff.intent || HANDOFF_INTENTS.PROJECT_ONLY).trim();
  if (!source) return null;
  return {
    source,
    intent,
    exportedAt: handoff.exportedAt || null,
    musicAppVersion: handoff.musicAppVersion || handoff.appVersion || null,
    audioAnalysis:
      handoff.audioAnalysis && typeof handoff.audioAnalysis === "object"
        ? { ...handoff.audioAnalysis }
        : null,
    imageAnalysis:
      handoff.imageAnalysis && typeof handoff.imageAnalysis === "object"
        ? { ...handoff.imageAnalysis }
        : null,
    audioSidecarName: handoff.audioSidecarName ? String(handoff.audioSidecarName) : null,
    sunoPasteStyle: handoff.sunoPasteStyle ? String(handoff.sunoPasteStyle) : "",
    sunoPasteLyrics: handoff.sunoPasteLyrics ? String(handoff.sunoPasteLyrics) : "",
    durationMode:
      handoff.durationMode === MV_DURATION_MODES.HIGHLIGHT
        ? MV_DURATION_MODES.HIGHLIGHT
        : MV_DURATION_MODES.FULL,
  };
}

/**
 * Build handoff block for music-tool export (bundle v2).
 * @param {object} params
 */
export function buildMusicToolHandoffBlock(params = {}) {
  return {
    source: HANDOFF_SOURCE_MUSIC,
    intent: params.intent || HANDOFF_INTENTS.MUSIC_VIDEO_PATH_E,
    exportedAt: new Date().toISOString(),
    musicAppVersion: params.musicAppVersion || params.appVersion || "",
    audioAnalysis: params.audioAnalysis || null,
    imageAnalysis: params.imageAnalysis || null,
    audioSidecarName: params.audioSidecarName || null,
    sunoPasteStyle: params.sunoPasteStyle || "",
    sunoPasteLyrics: params.sunoPasteLyrics || "",
    durationMode: params.durationMode || MV_DURATION_MODES.FULL,
  };
}

/**
 * Apply handoff after bundle import (analyzers + optional Path E patch).
 * @param {ProjectHandoff|null} handoff
 * @param {object} actions
 */
export function applyProjectHandoff(handoff, actions) {
  const normalized = normalizeProjectHandoff(handoff);
  if (!normalized) {
    return { ok: true, applied: false };
  }

  const {
    setAudioAnalysis,
    setImageAnalysis,
    applyAnalyzerPatch,
    patch,
    formatTime = (n) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`,
  } = actions;

  if (normalized.audioAnalysis && setAudioAnalysis) {
    setAudioAnalysis(normalized.audioAnalysis);
  }
  if (normalized.imageAnalysis && setImageAnalysis) {
    setImageAnalysis(normalized.imageAnalysis);
  }

  if (normalized.sunoPasteStyle || normalized.sunoPasteLyrics) {
    patch?.({
      sunoPasteStyle: normalized.sunoPasteStyle,
      sunoPasteLyrics: normalized.sunoPasteLyrics,
      sunoPasteActive: Boolean(normalized.sunoPasteStyle || normalized.sunoPasteLyrics),
    });
  }

  let pathEPatch = null;
  if (
    normalized.intent === HANDOFF_INTENTS.MUSIC_VIDEO_PATH_E &&
    normalized.audioAnalysis &&
    normalized.imageAnalysis &&
    applyAnalyzerPatch
  ) {
    pathEPatch = buildMusicVideoPatchFromAudioAndImage(
      normalized.audioAnalysis,
      normalized.imageAnalysis,
      formatTime,
      { durationMode: normalized.durationMode },
    );
    const { directorSettingsPatch, ...projectPatch } = pathEPatch;
    applyAnalyzerPatch(projectPatch);
    if (directorSettingsPatch) {
      saveDirectorSettingsToStorage(directorSettingsPatch);
    }
  }

  if (normalized.intent !== HANDOFF_INTENTS.PROJECT_ONLY) {
    scrollToDirectorPanelAfterApply();
  }

  const labels = {
    [HANDOFF_INTENTS.MUSIC_VIDEO_PATH_E]: "Music → Video handoff (Path E beat-sync)",
    [HANDOFF_INTENTS.MUSIC_VIDEO_TRACK]: "Music → Video handoff (track)",
    [HANDOFF_INTENTS.PROJECT_ONLY]: "Music → Video handoff",
  };

  return {
    ok: true,
    applied: true,
    intent: normalized.intent,
    pathE: Boolean(pathEPatch),
    message: labels[normalized.intent] || labels[HANDOFF_INTENTS.PROJECT_ONLY],
  };
}
