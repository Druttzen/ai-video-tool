/**
 * Suno track → matching music video — project patches for workspace merge.
 */
import { uniq } from "./music-helpers";
import {
  applyMoodPatch,
  mergeAnalyzerRuleLine,
  mergeAudioHighlightIntoIdea,
  mergeAudioHighlightIntoNotes,
  mergeGuidedGenres,
  mergeGuidedRhythms,
  mergeGuidedSounds,
} from "./analyzer-guided-merge";
import {
  buildMusicVideoIdea,
  mapAudioAnalysisToMusicVideo,
  mapSunoPasteToMusicVideo,
} from "./suno-to-video-mapper";

function compactSunoTrackRule(audioAnalysis) {
  if (!audioAnalysis) return "";
  const bpm = audioAnalysis.estimatedBpm ? `${audioAnalysis.estimatedBpm} BPM` : "";
  const key = audioAnalysis.estimatedKey || "";
  const genres = (audioAnalysis.suggestedGenres || []).slice(0, 2).join("+");
  return `SUNO-TRACK: ${[bpm, key, genres].filter(Boolean).join(" · ")}`.trim();
}

/**
 * Full project patch from analyzed Suno/audio track → music video fields.
 * @param {object} audioAnalysis
 * @param {(n: number) => string} formatTime
 */
export function buildMusicVideoPatchFromAudio(audioAnalysis, formatTime) {
  const mapped = mapAudioAnalysisToMusicVideo(audioAnalysis);
  const rule = compactSunoTrackRule(audioAnalysis);

  return {
    selectedGenres: (prev) => mergeGuidedGenres(prev, mapped.selectedGenres),
    selectedSounds: (prev) => mergeGuidedSounds(prev, mapped.selectedSounds),
    selectedRhythms: (prev) => mergeGuidedRhythms(prev, mapped.selectedRhythms),
    vocal: mapped.vocal,
    tempo: mapped.tempo,
    structure: mapped.structure,
    lyricTheme: mapped.lyricTheme,
    rules: (prev) => mergeAnalyzerRuleLine(prev, "suno", rule || "SUNO-TRACK: sync cuts to reference audio"),
    idea: (prev) =>
      buildMusicVideoIdea({
        audioAnalysis,
        lyricTheme: mapped.lyricTheme,
        structure: mapped.structure,
      }) || mergeAudioHighlightIntoIdea(prev, audioAnalysis, formatTime),
    notes: (prev) => mergeAudioHighlightIntoNotes(prev, audioAnalysis, formatTime) || mapped.notes,
    mood: (prev) =>
      audioAnalysis.moodSuggestion ? applyMoodPatch(prev, audioAnalysis.moodSuggestion) : prev,
    promptEngine: "Director",
    lyricMode: "Multi-beat scene",
  };
}

/** Project patch from pasted Suno Style + Lyrics. */
export function buildMusicVideoPatchFromSunoPaste(styleText, lyricsText) {
  const mapped = mapSunoPasteToMusicVideo(styleText, lyricsText);
  return {
    ...mapped,
    selectedGenres: mapped.selectedGenres,
    selectedSounds: mapped.selectedSounds,
    selectedRhythms: mapped.selectedRhythms,
    idea: buildMusicVideoIdea({
      styleText,
      lyricTheme: mapped.lyricTheme,
      structure: mapped.structure,
    }),
    promptEngine: "Director",
    lyricMode: "Multi-beat scene",
  };
}

/**
 * Merge analyzed track + Suno paste into one music video project.
 * @param {object|null} audioAnalysis
 * @param {string} styleText
 * @param {string} lyricsText
 * @param {(n: number) => string} formatTime
 */
export function buildMusicVideoPatchFromBoth(audioAnalysis, styleText, lyricsText, formatTime) {
  const fromAudio = audioAnalysis
    ? buildMusicVideoPatchFromAudio(audioAnalysis, formatTime)
    : {};
  const fromPaste = mapSunoPasteToMusicVideo(styleText, lyricsText);

  const mergedGenres = uniq([
    ...(fromPaste.selectedGenres || []),
    ...(typeof fromAudio.selectedGenres === "function"
      ? fromAudio.selectedGenres([])
      : fromAudio.selectedGenres || []),
  ]).slice(0, 3);

  const mergedSounds = uniq([
    ...(fromPaste.selectedSounds || []),
    ...(typeof fromAudio.selectedSounds === "function"
      ? fromAudio.selectedSounds([])
      : fromAudio.selectedSounds || []),
  ]).slice(0, 6);

  const mergedRhythms = uniq([
    ...(fromPaste.selectedRhythms || []),
    ...(typeof fromAudio.selectedRhythms === "function"
      ? fromAudio.selectedRhythms([])
      : fromAudio.selectedRhythms || []),
  ]).slice(0, 4);

  return {
    selectedGenres: mergedGenres,
    selectedSounds: mergedSounds,
    selectedRhythms: mergedRhythms,
    vocal: fromPaste.vocal || (fromAudio.vocal ?? "Music-driven"),
    tempo: fromPaste.tempo || fromAudio.tempo,
    structure: fromPaste.structure || fromAudio.structure,
    lyricStructure: fromPaste.lyricStructure,
    lyricTheme: fromPaste.lyricTheme || fromAudio.lyricTheme,
    generatedLyrics: fromPaste.generatedLyrics || "",
    sunoPasteStyle: styleText,
    sunoPasteLyrics: lyricsText,
    rules: (prev) => {
      let next = typeof fromAudio.rules === "function" ? fromAudio.rules(prev) : prev;
      if (fromPaste.rules) {
        next = next ? `${next}\n${fromPaste.rules}` : fromPaste.rules;
      }
      return next;
    },
    idea: buildMusicVideoIdea({
      audioAnalysis,
      styleText,
      lyricTheme: fromPaste.lyricTheme || fromAudio.lyricTheme,
      structure: fromPaste.structure || fromAudio.structure,
    }),
    notes: (prev) => {
      const audioNotes =
        typeof fromAudio.notes === "function" ? fromAudio.notes(prev) : fromAudio.notes;
      const pasteNote = styleText ? `Suno Style pasted:\n${styleText.slice(0, 400)}` : "";
      return [audioNotes, pasteNote].filter(Boolean).join("\n\n") || prev;
    },
    mood: fromAudio.mood,
    promptEngine: "Director",
    lyricMode: "Multi-beat scene",
  };
}
