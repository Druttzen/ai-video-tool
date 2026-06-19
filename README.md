# AI Video Creator — Video Prompt Studio

**Version 1.0.0**

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
| `npm run dist` | Windows installer |

## Project layout

- `data/director-catalog.json` — native templates, vocabulary, quality presets
- `app/lib/director-*.js` — prompt builder, wizard, inspiration, settings
- `app/components/center-director-panel.jsx` — unified Create / Render / Advanced UI
- `scripts/run-director-job.py` — optional local GPU backend runner

## Legacy note

Older builds referenced Open-Sora at `E:\Open-Sora`. v1.0 removes that as a product dependency. Saved projects using `Open-Sora` engine auto-migrate to `Director`. Optional local pipeline path in Advanced tab replaces hard-coded install paths.

## Author

**DJ M@D** — Bones Vibration

## License

See repository license file.
