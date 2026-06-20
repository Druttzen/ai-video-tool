/**
 * Build a beat-synced, lip-sync-ready music video plan from analyzed audio + image.
 */
import { formatTime } from "./audio-analyzer";
import {
  applyMoodPatch,
  compactImageStyleRule,
  mergeAnalyzerRuleLine,
  mergeAudioHighlightIntoIdea,
  mergeAudioHighlightIntoNotes,
  mergeGuidedGenres,
  mergeGuidedRhythms,
  mergeGuidedSounds,
  mergeImageMoodIntoIdea,
} from "./analyzer-guided-merge";
import { uniq } from "./music-helpers";
import {
  buildMusicVideoIdea,
  mapAudioAnalysisToMusicVideo,
  mapSunoGenresToVisual,
  mapSunoRhythmsToCamera,
  mapSunoSoundsToLighting,
} from "./suno-to-video-mapper";
import { loadDirectorSettingsFromStorage } from "./director-settings";

const MAX_SONG_DURATION_SEC = 120;

/** @param {object|null} audioAnalysis */
export function parseBpmFromAnalysis(audioAnalysis) {
  if (typeof audioAnalysis?.bpm === "number" && audioAnalysis.bpm > 0) {
    return audioAnalysis.bpm;
  }
  const match = String(audioAnalysis?.estimatedBpm || "").match(/(\d+)/);
  return match ? Number(match[1]) : 120;
}

/** @param {object|null} audioAnalysis */
export function songDurationSec(audioAnalysis) {
  const d = Number(audioAnalysis?.duration);
  if (!Number.isFinite(d) || d <= 0) return 180;
  return Math.min(MAX_SONG_DURATION_SEC, Math.round(d * 10) / 10);
}

/** @param {object|null} audioAnalysis */
export function hasVocalsLikely(audioAnalysis) {
  const vocals = String(audioAnalysis?.vocals || "").toLowerCase();
  if (vocals.includes("instrumental")) return false;
  if (vocals.includes("vocals likely")) return true;
  return vocals.includes("mixed") ? true : false;
}

/**
 * @param {object|null} audioAnalysis
 * @returns {{ bpm: number, duration: number, beatInterval: number, markers: number[], beatCount: number }}
 */
export function buildBeatSyncMarkers(audioAnalysis) {
  const duration = songDurationSec(audioAnalysis);
  const bpm = parseBpmFromAnalysis(audioAnalysis);
  const beatInterval = 60 / bpm;
  const markers = [];
  for (let t = 0; t <= duration + 0.001; t += beatInterval) {
    markers.push(Math.round(t * 100) / 100);
  }
  return { bpm, duration, beatInterval, markers, beatCount: markers.length };
}

/**
 * Shot structure with timestamps for beat-aligned cuts.
 * @param {object|null} audioAnalysis
 * @param {(n: number) => string} [formatTimeFn]
 */
export function buildBeatSyncStructure(audioAnalysis, formatTimeFn = formatTime) {
  const duration = songDurationSec(audioAnalysis);
  const hiStart = Math.max(0, Number(audioAnalysis?.highlightStart) || duration * 0.38);
  const hiEnd = Math.min(duration, Number(audioAnalysis?.highlightEnd) || hiStart + 24);
  const introEnd = Math.min(12, duration * 0.08);
  const verseEnd = Math.min(duration * 0.35, hiStart - 4);
  const bridgeStart = Math.min(duration * 0.72, hiEnd + 8);

  const sections = [
    { start: 0, end: introEnd, label: "establishing wide" },
    { start: introEnd, end: Math.max(introEnd + 8, verseEnd), label: "verse performance medium" },
    { start: hiStart, end: hiEnd, label: "chorus lift on downbeat" },
  ];

  if (duration > 75 && bridgeStart < duration - 10) {
    sections.push({ start: bridgeStart, end: Math.min(duration - 6, bridgeStart + 16), label: "visual break" });
  }

  sections.push({ start: Math.max(0, duration - 8), end: duration, label: "outro hold" });

  return sections
    .filter((s) => s.end > s.start)
    .map((s) => `${formatTimeFn(s.start)} ${s.label}`)
    .join(" → ");
}

/**
 * @param {object|null} audioAnalysis
 * @param {object|null} imageAnalysis
 * @param {(n: number) => string} [formatTimeFn]
 */
export function buildBeatSyncLyricsScaffold(audioAnalysis, imageAnalysis, formatTimeFn = formatTime) {
  const duration = songDurationSec(audioAnalysis);
  const bpm = parseBpmFromAnalysis(audioAnalysis);
  const { beatInterval } = buildBeatSyncMarkers(audioAnalysis);
  const fileName = audioAnalysis?.fileName || "track";
  const mood = imageAnalysis?.visualMood || (audioAnalysis?.suggestedMoods || []).slice(0, 2).join(", ");
  const hiStart = Math.max(0, Number(audioAnalysis?.highlightStart) || duration * 0.4);
  const hiEnd = Math.min(duration, Number(audioAnalysis?.highlightEnd) || hiStart + 28);

  const lines = [
    `[Meta: Beat-sync MV "${fileName}" — ${formatTimeFn(duration)} @ ${bpm} BPM | cut every ${beatInterval.toFixed(2)}s]`,
    `[Beat grid: ${bpm} BPM across full track — hard cut on downbeat]`,
    "",
    `[Intro — ${formatTimeFn(0)}–${formatTimeFn(Math.min(12, duration * 0.08))} | B-roll on beat]`,
    mood ? `(visual mood: ${mood})` : "(match reference image palette and wardrobe)",
    "",
    `[Verse — ${formatTimeFn(Math.min(12, duration * 0.08))}–${formatTimeFn(hiStart)} | performance medium]`,
    "(camera moves on bar changes — sync motion to kick)",
    "",
    `[Chorus — ${formatTimeFn(hiStart)}–${formatTimeFn(hiEnd)} | energy lift on downbeat]`,
    "(wider framing — accent hits on snare/backbeat)",
  ];

  if (hasVocalsLikely(audioAnalysis)) {
    lines.push(
      "",
      `[Vocal performance — ${formatTimeFn(hiStart)}–${formatTimeFn(hiEnd)} | lip-sync locked to bed]`,
      "(mouth movement on syllables — hold eye-line in close-ups)",
      `[Bridge lip-sync — ${formatTimeFn(Math.min(duration * 0.72, duration - 20))}–${formatTimeFn(Math.min(duration - 6, duration * 0.88))}]`,
      "(phrase-level sync — no mumbled filler)",
    );
  } else {
    lines.push("", `[Instrumental bed — ${formatTimeFn(0)}–${formatTimeFn(duration)} | no lip-sync]`);
  }

  lines.push(
    "",
    `[Outro — ${formatTimeFn(Math.max(0, duration - 8))}–${formatTimeFn(duration)} | fade hold on final bar]`,
  );

  return lines.join("\n");
}

/** @param {object|null} audioAnalysis */
export function buildLipSyncRules(audioAnalysis) {
  if (!hasVocalsLikely(audioAnalysis)) {
    return "instrumental bed — no lip-sync, music-driven B-roll, cut on beat, stable anatomy";
  }
  return [
    "lip-sync vocal phrases to reference track",
    "mouth movement on downbeats and syllable accents",
    "cut on beat between performance and B-roll",
    "consistent wardrobe and face identity",
    "no watermark, stable anatomy",
  ].join(", ");
}

/**
 * Director settings patch: output duration and frame budget aligned to song length.
 * @param {object|null} audioAnalysis
 * @param {object|null} [baseSettings]
 */
export function syncDirectorSettingsToSong(audioAnalysis, baseSettings = null) {
  const settings = baseSettings || loadDirectorSettingsFromStorage();
  const durationSec = songDurationSec(audioAnalysis);
  const fps = Number(settings.fps) || 24;
  const numFrames = Math.max(17, Math.min(513, Math.round(durationSec * fps)));

  return {
    ...settings,
    durationSeconds: String(durationSec),
    numFrames,
  };
}

/**
 * @param {object|null} audioAnalysis
 * @param {object|null} imageAnalysis
 * @param {(n: number) => string} formatTimeFn
 */
export function buildAudioVisualMusicVideoPlan(audioAnalysis, imageAnalysis, formatTimeFn = formatTime) {
  const durationSec = songDurationSec(audioAnalysis);
  const bpm = parseBpmFromAnalysis(audioAnalysis);
  const beatSync = buildBeatSyncMarkers(audioAnalysis);
  const structure = buildBeatSyncStructure(audioAnalysis, formatTimeFn);
  const generatedLyrics = buildBeatSyncLyricsScaffold(audioAnalysis, imageAnalysis, formatTimeFn);
  const lipSyncRules = buildLipSyncRules(audioAnalysis);
  const vocal = hasVocalsLikely(audioAnalysis) ? "Voiceover" : "Music-driven";

  return {
    durationSec,
    bpm,
    beatSync,
    structure,
    generatedLyrics,
    lipSyncRules,
    vocal,
    tempo: `${durationSec}s`,
    lyricTheme:
      [
        imageAnalysis?.visualMood,
        ...(audioAnalysis?.suggestedMoods || []).slice(0, 2),
      ]
        .filter(Boolean)
        .join(", ") || "beat-sync music video",
    directorSettings: syncDirectorSettingsToSong(audioAnalysis),
  };
}

function compactAudioVisualRule(audioAnalysis, imageAnalysis, plan) {
  const img = compactImageStyleRule(imageAnalysis);
  const bpm = audioAnalysis?.estimatedBpm || `${plan.bpm} BPM`;
  return `AV-MV: ${bpm} · ${plan.durationSec}s · beat-sync · ${hasVocalsLikely(audioAnalysis) ? "lip-sync" : "instrumental"} · ${img}`.trim();
}

/**
 * Workspace patch: analyzed audio + analyzed image → beat-sync music video project.
 * @param {object} audioAnalysis
 * @param {object} imageAnalysis
 * @param {(n: number) => string} formatTimeFn
 */
export function buildMusicVideoPatchFromAudioAndImage(audioAnalysis, imageAnalysis, formatTimeFn) {
  const plan = buildAudioVisualMusicVideoPlan(audioAnalysis, imageAnalysis, formatTimeFn);
  const fromAudio = mapAudioAnalysisToMusicVideo(audioAnalysis);
  const imageGenres = mapSunoGenresToVisual([
    ...(imageAnalysis?.suggestedGenres || []),
    ...(imageAnalysis?.suggestedSubgenres || []),
  ]);
  const imageSounds = mapSunoSoundsToLighting([
    ...(imageAnalysis?.suggestedSounds || []),
    ...(imageAnalysis?.suggestedInstruments || []),
  ]);
  const imageRhythms = mapSunoRhythmsToCamera(imageAnalysis?.suggestedRhythms || []);

  const mergedGenres = uniq([...(fromAudio.selectedGenres || []), ...imageGenres]).slice(0, 3);
  if (!mergedGenres.includes("Music video")) mergedGenres.unshift("Music video");

  const ruleLine = compactAudioVisualRule(audioAnalysis, imageAnalysis, plan);
  const beatRule = `BEAT-SYNC: ${plan.bpm} BPM, ${plan.beatSync.beatCount} downbeats over ${plan.durationSec}s — cut on beat`;
  const lipRule = hasVocalsLikely(audioAnalysis)
    ? "LIP-SYNC: lock mouth to vocal phrases in chorus and verse performance shots"
    : "LIP-SYNC: off — instrumental bed, music-driven visuals only";

  return {
    selectedGenres: (prev) => mergeGuidedGenres(prev, mergedGenres),
    selectedSounds: (prev) =>
      mergeGuidedSounds(prev, uniq([...(fromAudio.selectedSounds || []), ...imageSounds]).slice(0, 6)),
    selectedRhythms: (prev) =>
      mergeGuidedRhythms(prev, uniq([...(fromAudio.selectedRhythms || []), ...imageRhythms]).slice(0, 4)),
    vocal: plan.vocal,
    tempo: plan.tempo,
    structure: plan.structure,
    lyricStructure: plan.structure,
    lyricTheme: plan.lyricTheme,
    generatedLyrics: plan.generatedLyrics,
    rules: (prev) => {
      let next = mergeAnalyzerRuleLine(prev, "av-mv", ruleLine);
      next = mergeAnalyzerRuleLine(next, "beat", beatRule);
      next = mergeAnalyzerRuleLine(next, "lip", lipRule);
      next = next ? `${next}\n${plan.lipSyncRules}` : plan.lipSyncRules;
      return next;
    },
    idea: (prev) => {
      const base =
        buildMusicVideoIdea({
          audioAnalysis,
          lyricTheme: plan.lyricTheme,
          structure: plan.structure,
        }) || mergeAudioHighlightIntoIdea(prev, audioAnalysis, formatTimeFn);
      const withImage = mergeImageMoodIntoIdea(base, imageAnalysis?.visualMood);
      return `${withImage}. Full track ${formatTimeFn(plan.durationSec)} @ ${plan.bpm} BPM — beat-sync cuts${hasVocalsLikely(audioAnalysis) ? ", lip-sync on vocals" : ""}. Reference image palette drives wardrobe and grade.`;
    },
    notes: (prev) => {
      const audioNotes = mergeAudioHighlightIntoNotes(prev, audioAnalysis, formatTimeFn);
      const imageNote = imageAnalysis?.summary
        ? `Reference image:\n${imageAnalysis.summary}`
        : "";
      const syncNote = `Video length synced to song: ${plan.durationSec}s (${plan.beatSync.beatCount} beats @ ${plan.bpm} BPM).`;
      return [audioNotes, imageNote, syncNote].filter(Boolean).join("\n\n") || prev;
    },
    mood: (prev) => {
      let next = prev;
      if (audioAnalysis?.moodSuggestion) next = applyMoodPatch(next, audioAnalysis.moodSuggestion);
      if (imageAnalysis?.moodSuggestion) next = applyMoodPatch(next, imageAnalysis.moodSuggestion);
      return next;
    },
    promptEngine: "Director",
    lyricMode: "Multi-beat scene",
    directorSettingsPatch: plan.directorSettings,
  };
}
