# Music Tool → Video Tool handoff (bundle v2)

AI Music Creator exports a **bundle v2** JSON that AI Video Creator imports automatically (Load bundle, file association `*.aivbundle.json`, or `aivideo://` on Windows).

## Export from AI Music Creator

Add a **Send to Video Creator** action that writes:

1. `{project-name}.aivbundle.json` — bundle file  
2. `{project-name}.wav` — optional audio sidecar (same folder)

### Minimal bundle shape

```json
{
  "bundleFormat": "ai-music-creator-bundle",
  "bundleVersion": 2,
  "exportedAt": "2026-06-20T12:00:00.000Z",
  "appVersion": "1.0.0",
  "project": { },
  "customPresets": { },
  "handoff": {
    "source": "ai-music-creator",
    "intent": "music-video-path-e",
    "musicAppVersion": "1.0.0",
    "audioAnalysis": { },
    "imageAnalysis": { },
    "audioSidecarName": "my-track.wav",
    "sunoPasteStyle": "",
    "sunoPasteLyrics": "",
    "durationMode": "full"
  },
  "directorSettings": {
    "renderBackend": "local-python",
    "localRenderEngine": "diffusers-wan",
    "durationSeconds": "180"
  }
}
```

### `handoff.intent` values

| Intent | Video tool behavior |
|--------|---------------------|
| `music-video-path-e` | Apply Path E beat-sync patch + scroll to Director |
| `music-video-track` | Load audio analysis only |
| `project-only` | Import project fields, no auto Path E |

### JS helper (copy into music-tool)

Use the same helpers as video-tool:

- `buildMusicToolHandoffBlock()` — `app/lib/project-handoff.js`
- `buildProjectBundleExport()` — wrap with `handoff` key before write

Or run the example CLI:

```bash
node scripts/build-music-handoff-bundle.cjs --help
```

## Import in AI Video Creator

- **Load** toolbar → JSON bundle  
- Double-click `*.aivbundle.json` (desktop)  
- Second instance passes bundle path to running app  

On import with `music-video-path-e`, the app applies beat-sync fields and opens Director. Use **Produce video** or **Local GPU render** with engine **Wan 2.1 (Diffusers)** for native Windows CUDA (no WSL).

## Local render default

Imported bundles may set:

```json
"directorSettings": {
  "localRenderEngine": "diffusers-wan",
  "renderBackend": "local-python"
}
```

Open-Sora remains available as `localRenderEngine: "open-sora"`.
