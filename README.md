# AI Video Creator — Video Prompt Studio

**Version 1.0.6**

A **standalone** video prompt studio by DJ M@D (Bones Vibration). Built on the same architecture as [AI Music Creator](https://github.com/Druttzen/ai-music-tool), but fully focused on **AI video** — not tied to Open-Sora, Suno tokens, or any single cloud provider.

## Director Engine (native)

The default **Director Engine** is built into the app:

| Feature | What it does |
|---------|----------------|
| **Create tab** | Style profiles, Inspire me, step-by-step wizard, 7 scene templates, starter prompts |
| **Visual craft** | Shot type, camera body, lens, film format, color grade, lighting setup |
| **Render tab** | Export prompt + job JSON (works in browser) or optional local GPU render |
| **Advanced** | Optional local Python pipeline folder — power users only |

**No external install required.** Copy prompts into Sora, Runway, Kling, Pika, or any video AI. Export-only mode works everywhere.

Built-in vocabulary lives in `data/director-catalog.json` — owned by this app, not synced from third-party repos.

## Quick start

```bash
npm install
npm run dev          # browser — full prompt studio
npm run electron     # desktop — export + optional local render
```

## Workflow

1. Pick a factory preset or use **Inspire me**
2. Refine in **Idea**, **Visual Controls**, **Director craft**
3. Optional: drop a reference image in **Analyzers** (i2v when local render enabled)
4. **Director Engine → Render** → Copy prompt or Export job
5. Paste into your video AI of choice

## Music video — audio + picture (Path E)

Build a beat-synced music video from an **analyzed track** and **reference image** (no Suno paste required).

| Entry point | Where |
|-------------|--------|
| **Path E** button | Drag & Drop Analyzers (when both files are loaded) or **Suno → Music Video Studio** |
| **Workflow 5** | Quick Start — Music Video Paths 1–5 → **Run path 5** |

What Path E applies:

- **Beat sync** — BPM grid, timestamped shot structure, `Beat grid` scene scaffold in generated lyrics
- **Lip sync** — lip-sync rules and vocal performance beats when the track analysis suggests vocals (prompt-level; not frame-accurate mouth sync)
- **Duration sync** — project `tempo` and Director `durationSeconds` match song length (**full track capped at 480s**, or **highlight section only** via the Path E duration selector)
- **Auto i2v** — enables `useI2vWhenImage`; exported Director jobs attach the analyzed image as `ref_image_name` when you render/export

After Path E runs, the app **scrolls to Director** so you can export or render immediately.

### All music video paths (A–E)

| Path | Input | Use when |
|------|--------|----------|
| **A** | Analyzed audio only | Track → video fields |
| **B** | Suno Style + Lyrics paste | Paste-driven MV |
| **C** | Track + paste | Full sync with bracket structure |
| **D** | Manuscript chat | Write your own brief |
| **E** | Track + reference image | Beat sync, lip-sync scaffold, full-track duration, auto i2v |

## Prompt engines

| Engine | Use when |
|--------|----------|
| **Director** (default) | Native long-form scene prompts + export |
| **Sora-like** | Structured Style / Scene list blocks for cloud tools |

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js dev server |
| `npm run electron` | Desktop app |
| `npm run check` | Tests + lint + build |
| `npm run dist` | Windows installer (local build, no publish) |

## Desktop (Electron)

Packaged Windows builds include **auto-update** via `electron-updater` (same flow as [AI Music Creator](https://github.com/Druttzen/ai-music-tool)):

- **Desktop update controls** — “Check for updates” and “Restart to install” in the header status panel (packaged app only).
- **Startup check** — ~8 seconds after launch, the app checks GitHub Releases for a newer version, downloads in the background, and prompts when ready.
- **Release workflow** — push a `v*` tag to publish the Windows installer and `latest.yml` for auto-update (see `.github/workflows/release.yml`).

```bash
npm run dist
```

Runs `npm run build`, regenerates **`build/AI_Video_Creator_README.pdf`** from this README (`npm run build:readme-pdf`), prepares `out/` for Electron (`npm run prepare:electron-dist`), then **electron-builder**. Installer output under `electron-dist/`.

Publish a release from CI:

```bash
git tag v1.0.1
git push origin v1.0.1
```

### Electron auto-update

Packaged builds check **GitHub Releases** for `Druttzen/ai-video-tool` on startup. Updates require a published release with `latest.yml` from `electron-builder --publish` (the release workflow does this automatically). Dev/`npm run electron` skips update checks.

If `electron-dist/win-unpacked` is locked, `prepare:electron-dist` falls back to `electron-dist-fresh`, `electron-dist-v{version}`, or a timestamped folder. Close any running **AI Video Creator** instance before rebuilding.

## Project layout

- `data/director-catalog.json` — native templates, vocabulary, quality presets
- `app/lib/director-*.js` — prompt builder, wizard, inspiration, settings
- `app/lib/audio-visual-music-video.js` — Path E: audio + image → beat-sync MV patch and Director duration sync
- `app/components/center-director-panel.jsx` — unified Create / Render / Advanced UI
- `scripts/run-director-job.py` — optional local GPU backend runner

## All-in-one setup (desktop)

The **Setup Hub** panel (top of workspace) scans your environment and links optional local render tools:

| Module | Purpose |
|--------|---------|
| **Python** | Required for local GPU diffusion render |
| **Pipeline folder** | Open-Sora-compatible install with `inference.py` — set in Director → Advanced or link via Setup Hub |
| **GPU scan** | VRAM tier, CUDA/Vulkan/DirectML — feeds GPU Workflow preflight |
| **Open-Sora panel** | Legacy pipeline path + local job runner (optional) |
| **FFmpeg** | Optional bundled `resources/tools/ffmpeg` or PATH |

**Apply maxed profile** (desktop only) when scan finds Python + pipeline:

- Links Open-Sora install path → Director `localPipelinePath`
- Sets `renderBackend` to `local-python`
- Enables all GPU workflow functions + auto-run on paths and before render

Bundled placeholders (optional pack-in for installers): `resources/python`, `resources/tools/ffmpeg`.

### Open-Sora paths (all platforms)

| OS | Default probe path | Override |
|----|-------------------|----------|
| **Windows** | `E:\Open-Sora` | Setup Hub link path or `OPEN_SORA_ROOT` env |
| **macOS / Linux** | `~/Open-Sora` | Same — clone repo into home folder or set env |

```bash
# CLI smoke (no Electron) — exit 0 when Python + pipeline found
npm run smoke:desktop
npm run smoke:desktop -- --pipeline ~/Open-Sora --json

# Local MP4 prerequisite check + optional job JSON
npm run smoke:local-mp4
npm run smoke:local-mp4 -- --pipeline E:\Open-Sora --write-job ./director-smoke.json
```

Setup Hub **remembers your last scan** and shows a **Fix for local MP4** checklist with panel links when Python or pipeline is missing.

### Addon auto-update (desktop)

Setup Hub can **check and install updates** for local render dependencies:

| Addon | Auto-update behavior |
|-------|----------------------|
| **Open-Sora** | `git clone` or `git pull` + optional `pip install -r requirements.txt` |
| **Python** | Windows embeddable zip → `%AppData%/…/addons/python/` |
| **FFmpeg** | Static Windows build → `%AppData%/…/addons/ffmpeg/` |

- Toggle **Auto-update … after each environment scan** in Setup Hub
- Or use **Check addon updates** / **Update all addons**
- CLI: `npm run addons:check`

Manifest: `data/addon-updates-manifest.json` (pinned URLs/versions).

### Project bundles

Exports use **`ai-video-creator-bundle`** (`ai-video-bundle.json`). Imports still accept legacy **`ai-music-creator-bundle`** from AI Music Creator.

## Legacy note

Older builds referenced Open-Sora at `E:\Open-Sora`. v1.0 removes that as a product dependency. Saved projects using `Open-Sora` engine auto-migrate to `Director`. Optional local pipeline path in Advanced tab replaces hard-coded install paths.

## Author

**DJ M@D** — Bones Vibration

## License

See repository license file.
