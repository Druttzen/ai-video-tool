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
import {
  clampMediaDurationSec,
  MAX_MEDIA_DURATION_SEC,
  mediaNumFramesForDuration,
} from "./media-duration-limits";
import {
  buildClipPlanFromBeatTimes,
  resolveBeatTimesForRange,
} from "./music-video-sync-engine";

export { MAX_MEDIA_DURATION_SEC, MAX_MEDIA_DURATION_SEC as MAX_SONG_DURATION_SEC } from "./media-duration-limits";

/** @typedef {"full"|"highlight"} MusicVideoDurationMode */

export const MV_DURATION_MODES = {
  FULL: "full",
  HIGHLIGHT: "highlight",
};

/** @param {object|null} audioAnalysis */
export function rawSongDurationSec(audioAnalysis) {
  const d = Number(audioAnalysis?.duration);
  if (!Number.isFinite(d) || d <= 0) return 180;
  return Math.round(d * 10) / 10;
}

/**
 * @param {object|null} audioAnalysis
 * @returns {number}
 */
export function highlightDurationSec(audioAnalysis) {
  const raw = rawSongDurationSec(audioAnalysis);
  const start = Math.max(0, Number(audioAnalysis?.highlightStart) || 0);
  const end = Math.min(raw, Number(audioAnalysis?.highlightEnd) || raw);
  const span = Math.max(6, end - start);
  return Math.min(MAX_MEDIA_DURATION_SEC, Math.round(span * 10) / 10);
}

/**
 * @param {object|null} audioAnalysis
 * @param {MusicVideoDurationMode} [mode]
 */
export function resolveMusicVideoDurationSec(audioAnalysis, mode = MV_DURATION_MODES.FULL) {
  if (mode === MV_DURATION_MODES.HIGHLIGHT) {
    return highlightDurationSec(audioAnalysis);
  }
  return Math.min(MAX_MEDIA_DURATION_SEC, rawSongDurationSec(audioAnalysis));
}

/**
 * @param {object|null} audioAnalysis
 * @param {MusicVideoDurationMode} [mode]
 */
export function resolveMusicVideoDurationContext(audioAnalysis, mode = MV_DURATION_MODES.FULL) {
  const rawDurationSec = rawSongDurationSec(audioAnalysis);
  const highlightStart = Math.max(0, Number(audioAnalysis?.highlightStart) || 0);
  const highlightEnd = Math.min(rawDurationSec, Number(audioAnalysis?.highlightEnd) || rawDurationSec);

  if (mode === MV_DURATION_MODES.HIGHLIGHT) {
    const durationSec = highlightDurationSec(audioAnalysis);
    return {
      mode,
      durationSec,
      rangeStart: highlightStart,
      rangeEnd: Math.min(rawDurationSec, highlightStart + durationSec),
      rawDurationSec,
    };
  }

  const durationSec = Math.min(MAX_MEDIA_DURATION_SEC, rawDurationSec);
  return {
    mode,
    durationSec,
    rangeStart: 0,
    rangeEnd: durationSec,
    rawDurationSec,
  };
}

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
  return resolveMusicVideoDurationSec(audioAnalysis, MV_DURATION_MODES.FULL);
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
export function buildBeatSyncMarkers(audioAnalysis, mode = MV_DURATION_MODES.FULL) {
  const ctx = resolveMusicVideoDurationContext(audioAnalysis, mode);
  const bpm = parseBpmFromAnalysis(audioAnalysis);
  const beatInterval = 60 / bpm;

  const librosaBeats = resolveBeatTimesForRange(audioAnalysis, ctx.rangeStart, ctx.rangeEnd);
  if (librosaBeats?.length) {
    const clipPlan =
      audioAnalysis?.beatSync?.clipPlan?.length > 0
        ? audioAnalysis.beatSync.clipPlan
        : buildClipPlanFromBeatTimes(librosaBeats, ctx.rangeStart, ctx.rangeEnd);
    const intervals = librosaBeats.slice(1).map((t, i) => t - librosaBeats[i]);
    const avgInterval =
      intervals.length > 0
        ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length
        : beatInterval;
    return {
      bpm,
      duration: ctx.durationSec,
      beatInterval: Math.round(avgInterval * 1000) / 1000,
      markers: librosaBeats.map((t) => Math.round(t * 100) / 100),
      beatCount: librosaBeats.length,
      clipPlan,
      source: audioAnalysis?.beatSync?.source || "librosa",
      ctx,
    };
  }

  const markers = [];
  for (let t = ctx.rangeStart; t <= ctx.rangeEnd + 0.001; t += beatInterval) {
    markers.push(Math.round(t * 100) / 100);
  }
  return {
    bpm,
    duration: ctx.durationSec,
    beatInterval,
    markers,
    beatCount: markers.length,
    clipPlan: buildClipPlanFromBeatTimes(markers, ctx.rangeStart, ctx.rangeEnd),
    source: "grid",
    ctx,
  };
}

/**
 * Shot structure with timestamps for beat-aligned cuts.
 * @param {object|null} audioAnalysis
 * @param {(n: number) => string} [formatTimeFn]
 */
export function buildBeatSyncStructure(
  audioAnalysis,
  formatTimeFn = formatTime,
  mode = MV_DURATION_MODES.FULL,
) {
  const ctx = resolveMusicVideoDurationContext(audioAnalysis, mode);
  const duration = ctx.durationSec;
  const base = ctx.rangeStart;
  const rangeEnd = ctx.rangeEnd;
  const hiStart =
    mode === MV_DURATION_MODES.HIGHLIGHT
      ? base + Math.min(6, duration * 0.12)
      : Math.max(base, Number(audioAnalysis?.highlightStart) || base + duration * 0.38);
  const hiEnd =
    mode === MV_DURATION_MODES.HIGHLIGHT
      ? Math.min(rangeEnd, hiStart + Math.max(12, duration * 0.45))
      : Math.min(rangeEnd, Number(audioAnalysis?.highlightEnd) || hiStart + 24);
  const introEnd = base + Math.min(12, duration * 0.08);
  const verseEnd = base + Math.min(duration * 0.35, Math.max(introEnd + 8, hiStart - 4));
  const bridgeStart = base + Math.min(duration * 0.72, duration - 18);

  const sections = [
    { start: base, end: introEnd, label: "establishing wide" },
    { start: introEnd, end: Math.max(introEnd + 8, verseEnd), label: "verse performance medium" },
    { start: hiStart, end: hiEnd, label: "chorus lift on downbeat" },
  ];

  if (duration > 75 && bridgeStart < rangeEnd - 10) {
    sections.push({
      start: bridgeStart,
      end: Math.min(rangeEnd - 6, bridgeStart + 16),
      label: "visual break",
    });
  }

  sections.push({ start: Math.max(base, rangeEnd - 8), end: rangeEnd, label: "outro hold" });

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
export function buildBeatSyncLyricsScaffold(
  audioAnalysis,
  imageAnalysis,
  formatTimeFn = formatTime,
  mode = MV_DURATION_MODES.FULL,
) {
  const ctx = resolveMusicVideoDurationContext(audioAnalysis, mode);
  const duration = ctx.durationSec;
  const bpm = parseBpmFromAnalysis(audioAnalysis);
  const { beatInterval } = buildBeatSyncMarkers(audioAnalysis, mode);
  const fileName = audioAnalysis?.fileName || "track";
  const mood = imageAnalysis?.visualMood || (audioAnalysis?.suggestedMoods || []).slice(0, 2).join(", ");
  const hiStart =
    mode === MV_DURATION_MODES.HIGHLIGHT
      ? ctx.rangeStart + Math.min(6, duration * 0.12)
      : Math.max(ctx.rangeStart, Number(audioAnalysis?.highlightStart) || ctx.rangeStart + duration * 0.4);
  const hiEnd =
    mode === MV_DURATION_MODES.HIGHLIGHT
      ? Math.min(ctx.rangeEnd, hiStart + Math.max(12, duration * 0.45))
      : Math.min(ctx.rangeEnd, Number(audioAnalysis?.highlightEnd) || hiStart + 28);
  const rangeLabel =
    mode === MV_DURATION_MODES.HIGHLIGHT
      ? `highlight ${formatTimeFn(ctx.rangeStart)}–${formatTimeFn(ctx.rangeEnd)}`
      : `full track ${formatTimeFn(duration)}`;

  const lines = [
    `[Meta: Beat-sync MV "${fileName}" — ${rangeLabel} @ ${bpm} BPM | cut every ${beatInterval.toFixed(2)}s]`,
    `[Beat grid: ${bpm} BPM — hard cut on downbeat${mode === MV_DURATION_MODES.HIGHLIGHT ? " (highlight window)" : ""}]`,
    "",
    `[Intro — ${formatTimeFn(ctx.rangeStart)}–${formatTimeFn(ctx.rangeStart + Math.min(12, duration * 0.08))} | B-roll on beat]`,
    mood ? `(visual mood: ${mood})` : "(match reference image palette and wardrobe)",
    "",
    `[Verse — ${formatTimeFn(ctx.rangeStart + Math.min(12, duration * 0.08))}–${formatTimeFn(hiStart)} | performance medium]`,
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
      `[Bridge lip-sync — ${formatTimeFn(Math.min(ctx.rangeStart + duration * 0.72, ctx.rangeEnd - 20))}–${formatTimeFn(Math.min(ctx.rangeEnd - 6, ctx.rangeStart + duration * 0.88))}]`,
      "(phrase-level sync — no mumbled filler)",
    );
  } else {
    lines.push(
      "",
      `[Instrumental bed — ${formatTimeFn(ctx.rangeStart)}–${formatTimeFn(ctx.rangeEnd)} | no lip-sync]`,
    );
  }

  lines.push(
    "",
    `[Outro — ${formatTimeFn(Math.max(ctx.rangeStart, ctx.rangeEnd - 8))}–${formatTimeFn(ctx.rangeEnd)} | fade hold on final bar]`,
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
 * @param {{ enableI2v?: boolean }} [opts]
 */
export function syncDirectorSettingsToSong(audioAnalysis, baseSettings = null, opts = {}) {
  const settings = baseSettings || loadDirectorSettingsFromStorage();
  const durationSec = clampMediaDurationSec(
    resolveMusicVideoDurationSec(audioAnalysis, opts.durationMode || MV_DURATION_MODES.FULL),
  );
  const fps = Number(settings.fps) || 24;
  const numFrames = mediaNumFramesForDuration(durationSec, fps);

  return {
    ...settings,
    durationSeconds: String(durationSec),
    numFrames,
    ...(opts.enableI2v ? { useI2vWhenImage: true } : {}),
  };
}

/**
 * @param {object|null} audioAnalysis
 * @param {object|null} imageAnalysis
 * @param {(n: number) => string} formatTimeFn
 */
export function buildAudioVisualMusicVideoPlan(
  audioAnalysis,
  imageAnalysis,
  formatTimeFn = formatTime,
  durationMode = MV_DURATION_MODES.FULL,
) {
  const ctx = resolveMusicVideoDurationContext(audioAnalysis, durationMode);
  const durationSec = ctx.durationSec;
  const bpm = parseBpmFromAnalysis(audioAnalysis);
  const beatSync = buildBeatSyncMarkers(audioAnalysis, durationMode);
  const structure = buildBeatSyncStructure(audioAnalysis, formatTimeFn, durationMode);
  const generatedLyrics = buildBeatSyncLyricsScaffold(
    audioAnalysis,
    imageAnalysis,
    formatTimeFn,
    durationMode,
  );
  const lipSyncRules = buildLipSyncRules(audioAnalysis);
  const vocal = hasVocalsLikely(audioAnalysis) ? "Voiceover" : "Music-driven";

  return {
    durationSec,
    durationMode,
    durationContext: ctx,
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
    directorSettings: syncDirectorSettingsToSong(audioAnalysis, null, {
      enableI2v: Boolean(imageAnalysis),
      durationMode,
    }),
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
export function buildMusicVideoPatchFromAudioAndImage(
  audioAnalysis,
  imageAnalysis,
  formatTimeFn,
  opts = {},
) {
  const durationMode = opts.durationMode || MV_DURATION_MODES.FULL;
  const plan = buildAudioVisualMusicVideoPlan(
    audioAnalysis,
    imageAnalysis,
    formatTimeFn,
    durationMode,
  );
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
  const beatRule = `BEAT-SYNC: ${plan.bpm} BPM, ${plan.beatSync.beatCount} beats (${plan.beatSync.source || "grid"}) over ${plan.durationSec}s — cut on beat`;
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
      const rangeLabel =
        plan.durationMode === MV_DURATION_MODES.HIGHLIGHT
          ? `Highlight ${formatTimeFn(plan.durationContext.rangeStart)}–${formatTimeFn(plan.durationContext.rangeEnd)} (${plan.durationSec}s)`
          : `Full track ${formatTimeFn(plan.durationSec)}`;
      return `${withImage}. ${rangeLabel} @ ${plan.bpm} BPM — beat-sync cuts${hasVocalsLikely(audioAnalysis) ? ", lip-sync on vocals" : ""}. Reference image palette drives wardrobe and grade.`;
    },
    notes: (prev) => {
      const audioNotes = mergeAudioHighlightIntoNotes(prev, audioAnalysis, formatTimeFn);
      const imageNote = imageAnalysis?.summary
        ? `Reference image:\n${imageAnalysis.summary}`
        : "";
      const targetLabel =
        plan.durationMode === MV_DURATION_MODES.HIGHLIGHT ? "highlight section" : "full track";
      const clipNote =
        plan.beatSync.clipPlan?.length > 0
          ? `Clip plan: ${plan.beatSync.clipPlan.length} segments (${plan.beatSync.clipPlan[0].duration}s–${plan.beatSync.clipPlan[plan.beatSync.clipPlan.length - 1].duration}s each).`
          : "";
      const syncNote = `Video length synced to ${targetLabel}: ${plan.durationSec}s (${plan.beatSync.beatCount} beats @ ${plan.bpm} BPM, ${plan.beatSync.source || "grid"}). ${clipNote}`.trim();
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
