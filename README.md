# AI Video Creator — Prompt Control Room

**Version 0.2.0**

A freestanding sibling to [AI Music Creator](https://github.com/Druttzen/ai-music-tool): a Next.js **prompt control room** for AI video workflows, optimized for **Sora-style long scene prompts** — visual style, camera motion, lighting, narrative beats, reference analyzers, presets, and paste-ready export blocks. Ships as a static web app and optional **Electron** Windows installer.

## Same idea, different medium

| Music tool | Video tool (this app) |
|------------|------------------------|
| Suno Style / Lyrics fields | **Main prompt** / **Scene list** |
| Genres, rhythm, sounds | **Visual style**, **camera**, **lighting** |
| BPM, song structure | **Duration**, **aspect**, **shot structure** |
| Lyric direction | **Narrative / beat direction** |
| Track/image analyzer DNA | **Reference frame / clip analyzer DNA** |
| Voice Character Studio | **Character look consistency** (roadmap) |
| Project bundles | **Shareable video project bundles** |

## Highlights (v0.2.0)

- **Send to Open-Sora** — Electron writes job JSON under `%APPDATA%/…/open-sora-jobs/` and spawns `scripts/run-open-sora-job.py` against your local `E:\Open-Sora` install (browser fallback downloads JSON).
- **Image-to-video (i2v)** — drop a reference image in Analyzers; Send attaches it as `i2v_head` ref when enabled.
- **Open-Sora autocomplete sync** — `npm run sync:open-sora-terms` imports camera/lighting/color/lens terms from your Open-Sora install into visual chips.
- **Open-Sora UI launch** — one-click `app_pro.py` Gradio UI from the desktop app.

## Highlights (v0.1.0)

- **Copied architecture** from AI Music Creator — workspace hooks, guided path, presets, persistence, Electron shell.
- **Sora-like engine** — long natural-language scene prompts instead of 1000-char Suno Style caps.
- **Factory video presets** — Cinematic Opening, Documentary Moment, Neon Night Chase, Anime Action Beat, Product Hero, Dream Sequence.
- **Blank-slate guided workflow** — step-by-step from preset → mood → visual controls → rules → story → narrative → polish → copy.

## Open-Sora engine (local)

This app targets your local install at **`E:\Open-Sora`**:

| AI Video Creator | Open-Sora |
|------------------|-------------|
| Main prompt (paste-ready) | `--prompt` for `scripts/diffusion/inference.py` |
| Scene list | Multi-beat / shot-list block |
| Visual / camera / lighting chips | Autocomplete terms (`camera_terms`, `lighting_terms`) |
| FAST / CINEMATIC / ULTRA | `app_pro.py` presets → steps, cfg, resolution |
| Export job JSON | `opensora_pipeline.OpenSoraConfig` compatible payload |

Use the **Open-Sora Engine** panel to set install path, quality preset, motion score, **Send to Open-Sora**, open `app_pro.py`, copy prompt/CLI, and load scene templates from your Open-Sora `templates/scene_templates.py`.

**Send flow (Electron):**

1. Build prompt from Idea / visual controls / image analyzer DNA.
2. Click **Send to Open-Sora** — job JSON + optional ref image written, pipeline started in background.
3. Logs land next to the job file (`job-<timestamp>.log`).

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js dev server |
| `npm run check` | Unit tests + lint + production build |
| `npm run test:e2e` | Playwright browser tests |
| `npm run sync:open-sora-terms` | Import autocomplete terms from local Open-Sora install |
| `npm run dist` | Windows Electron installer |

## Project layout

- `app/lib/video-config.js` — default project state + factory presets
- `app/lib/video-visual-styles.js` — visual style / camera / lighting chips
- `app/lib/sora-limits.js` — Sora prompt length guidance
- `app/hooks/` — workspace, pipeline, persistence (same pattern as music tool)
- `app/components/` — panels (labels adapted for video)

## Roadmap

- [ ] Sora-specific prompt builder (subject → action → environment → camera → light → constraints)
- [ ] Reference **video** analyzer (frame sampling, motion hints)
- [ ] Character look bible + consistency block
- [ ] Style-DNA from film stills / TMDB / YouTube metadata
- [ ] Output re-import loop (paste finished Sora output, diff, merge)
- [ ] Trim music-only modules carried over from the template

## Author

**DJ M@D** — same creator as AI Music Creator.

## License

Private — all rights reserved.
