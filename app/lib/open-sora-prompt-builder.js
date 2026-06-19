/**
 * Build Open-Sora job + natural-language prompts for local inference.
 */
import { buildMoodWords } from "./music-helpers";
import { OPEN_SORA_PRESETS } from "./open-sora-settings";

function normalize(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

function sentence(s) {
  const t = normalize(s);
  if (!t) return "";
  return t.endsWith(".") ? t : `${t}.`;
}

/**
 * @param {object} p
 * @param {object|null} [p.imageAnalysis]
 */
export function buildOpenSoraPrompt(p) {
  const idea = normalize(p.idea);
  const genres = (p.selectedGenres || []).slice(0, 3);
  const cameras = (p.selectedRhythms || []).slice(0, 2);
  const lighting = (p.selectedSounds || []).slice(0, 3);
  const moodWords = buildMoodWords(p.mood);
  const rules = normalize(p.rules);
  const structure = normalize(p.structure);
  const vocal = normalize(p.vocal);
  const theme = normalize(p.lyricTheme);
  const imageAnalysis = p.imageAnalysis;

  const paragraphs = [];

  if (idea) {
    paragraphs.push(sentence(idea));
  } else if (imageAnalysis?.summary) {
    paragraphs.push(sentence(imageAnalysis.summary));
  } else {
    const subject = [genres[0], theme].filter(Boolean).join(", ");
    if (subject) paragraphs.push(sentence(`A cinematic scene featuring ${subject}`));
  }

  if (structure) {
    paragraphs.push(sentence(`Shot structure: ${structure}`));
  }

  if (cameras.length) {
    paragraphs.push(sentence(`The camera ${cameras.join(" then ")}`));
  }

  if (lighting.length) {
    paragraphs.push(sentence(`Lighting and atmosphere: ${lighting.join(", ")}`));
  }

  if (genres.length) {
    paragraphs.push(sentence(`Visual style: ${genres.join(", ")}`));
  }

  if (imageAnalysis?.visualMood && !idea.includes(imageAnalysis.visualMood)) {
    paragraphs.push(sentence(`Visual mood from reference: ${imageAnalysis.visualMood}`));
  }

  if (moodWords) {
    paragraphs.push(sentence(`Mood: ${moodWords}`));
  }

  if (vocal && vocal !== "Silent visual") {
    paragraphs.push(sentence(`Audio direction: ${vocal}`));
  }

  if (theme && !idea.includes(theme)) {
    paragraphs.push(sentence(`Narrative theme: ${theme}`));
  }

  if (rules) {
    paragraphs.push(sentence(`Constraints: ${rules.replace(/\.\s+/g, ", ")}`));
  }

  return paragraphs.filter(Boolean).join(" ");
}

export function buildOpenSoraSceneList(p) {
  const vocal = p.vocal || "Silent visual";
  if (vocal === "Silent visual" && !p.generatedLyrics && !p.lyricTheme) {
    return "";
  }

  const generated = normalize(p.generatedLyrics);
  if (generated) return generated;

  const theme = normalize(p.lyricTheme);
  const structure = normalize(p.lyricStructure || p.structure);
  if (!theme && !structure) return "";

  const lines = [];
  if (theme) lines.push(`[Theme: ${theme}]`);
  if (structure) {
    for (const beat of structure.split(/\s*→\s*/)) {
      const b = normalize(beat);
      if (b) lines.push(`[${b}]`);
    }
  }
  return lines.join("\n");
}

/**
 * @param {object} p project fields
 * @param {object} settings open-sora settings
 * @param {{ imagePayload?: { base64: string, name: string }|null, useI2v?: boolean }} [opts]
 */
export function buildOpenSoraJobPayload(p, settings, opts = {}) {
  const prompt = buildOpenSoraPrompt(p);
  const preset = OPEN_SORA_PRESETS[settings?.preset] || null;
  const steps = settings?.steps ?? preset?.steps ?? 16;
  const cfg = settings?.cfg ?? preset?.cfg ?? 7.5;
  const resolution = settings?.resolution ?? preset?.resolution ?? "640x360";
  const fps = settings?.fps ?? 16;
  const seed = settings?.seed ?? 0;
  const motionScore = settings?.motionScore ?? 4;
  const useI2v =
    opts.useI2v !== false &&
    settings?.useI2vWhenImage !== false &&
    Boolean(opts.imagePayload?.base64);

  const job = {
    kind: "open_sora_job",
    app: "ai-video-tool",
    prompt,
    sceneList: buildOpenSoraSceneList(p),
    installPath: settings?.installPath || "E:\\Open-Sora",
    pythonPath: settings?.pythonPath || "python",
    steps,
    cfg,
    seed,
    resolution,
    fps,
    device: settings?.device || "cuda",
    save_dir: "outputs",
    extra_options: {
      "sampling_option.sampler": settings?.sampler || "ddim",
      motion_score: motionScore,
      fps_save: fps,
    },
    cli_hint: buildOpenSoraCliHint({
      prompt,
      steps,
      cfg,
      seed,
      resolution,
      motionScore,
      installPath: settings?.installPath,
      useI2v,
    }),
  };

  if (useI2v) {
    job.cond_type = "i2v_head";
    job.ref_image_name = opts.imagePayload.name;
    job.i2v = true;
  }

  return job;
}

export function buildOpenSoraCliHint({
  prompt,
  steps,
  cfg,
  seed,
  resolution,
  motionScore = 4,
  installPath = "E:\\Open-Sora",
  useI2v = false,
}) {
  const escaped = prompt.replace(/"/g, '\\"');
  const [width, height] = String(resolution).split("x");
  const lines = [`cd ${installPath}`];
  if (useI2v) {
    lines.push(
      `python scripts/diffusion/inference.py configs/diffusion/inference/256px.py --cond_type i2v_head --ref <ref.png> --prompt "${escaped}" --seed ${seed || 42} --motion-score ${motionScore}`,
    );
  } else {
    lines.push(
      `python scripts/diffusion/inference.py configs/diffusion/inference/256px.py --prompt "${escaped}" --seed ${seed || 42} --motion-score ${motionScore}`,
    );
  }
  lines.push(`# pipeline: steps=${steps} cfg=${cfg} resolution=${width}x${height}`);
  lines.push(`# or: python scripts/run-open-sora-job.py job.json`);
  return lines.join("\n");
}

export function buildOpenSoraFieldSlices(p) {
  return {
    style: buildOpenSoraPrompt(p),
    lyrics: buildOpenSoraSceneList(p),
  };
}
