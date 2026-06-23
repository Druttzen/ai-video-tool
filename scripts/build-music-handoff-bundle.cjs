#!/usr/bin/env node
/**
 * Example: build a music-tool handoff bundle for testing import in AI Video Creator.
 * Usage:
 *   node scripts/build-music-handoff-bundle.cjs --out ./handoff-test.aivbundle.json
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function parseArgs(argv) {
  const outIdx = argv.indexOf("--out");
  return {
    out:
      outIdx >= 0
        ? path.resolve(argv[outIdx + 1])
        : path.join(ROOT, "tests", "fixtures", "music-handoff-path-e.aivbundle.json"),
  };
}

function main() {
  const { out } = parseArgs(process.argv.slice(2));
  const bundle = {
    bundleFormat: "ai-music-creator-bundle",
    bundleVersion: 2,
    exportedAt: new Date().toISOString(),
    appVersion: "1.0.28",
    project: {
      idea: "Music handoff fixture — neon alley performance",
      tempo: "128",
      structure: "intro → verse → chorus lift → outro",
      selectedGenres: ["Music video", "Electronic"],
      selectedRhythms: ["Tracking shot"],
      selectedSounds: ["Neon night"],
      vocal: "Lead vocal",
      rules: "cut on beat, music-video pacing",
      lyricTheme: "city night drive",
      durationSeconds: "30",
    },
    handoff: {
      source: "ai-music-creator",
      intent: "music-video-path-e",
      musicAppVersion: "0.9.10",
      durationMode: "full",
      audioAnalysis: {
        fileName: "fixture-track.wav",
        bpm: 128,
        durationSec: 30,
        highlightStart: 8,
        highlightEnd: 22,
        beatSync: {
          source: "fixture",
          beatCount: 64,
          clipPlan: [{ start: 0, end: 5, label: "intro" }],
        },
      },
      imageAnalysis: {
        suggestedGenres: ["Cinematic"],
        suggestedSounds: ["Neon"],
        suggestedRhythms: ["Handheld"],
      },
      audioSidecarName: null,
    },
    directorSettings: {
      renderBackend: "local-python",
      localRenderEngine: "diffusers-wan",
      durationSeconds: "30",
      useI2vWhenImage: true,
    },
  };

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  console.log(`Wrote handoff bundle: ${out}`);
}

main();
