/**
 * Build Open-Sora job + natural-language prompts for local inference.
 */
import { buildMoodWords } from "./music-helpers";
import {
  buildCameraRigPhrase,
  getColorPipelinePhrase,
  getOpenSoraConfigPresets,
  getLightingSetupPhrase,
  getShotTypePhrase,
  getStyleProfileByName,
} from "./open-sora-catalog";
import {
  OPEN_SORA_PRESETS,
  resolveConfigPresetPath,
  resolveResolutionTier,
} from "./open-sora-settings";
import { getDefaultOpenSoraInstallPath } from "./open-sora-paths";

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

function craftFragments(settings) {
  const parts = [];
  if (settings?.shotType) parts.push(getShotTypePhrase(settings.shotType));
  if (settings?.cameraPreset || settings?.lensKit) {
    parts.push(buildCameraRigPhrase(settings.cameraPreset, settings.lensKit, ""));
  }
  if (settings?.filmFormat) parts.push(`Film format: ${settings.filmFormat}.`);
  if (settings?.lightingSetup) parts.push(getLightingSetupPhrase(settings.lightingSetup));
  if (settings?.colorGrade) parts.push(getColorPipelinePhrase(settings.colorGrade));
  const style = getStyleProfileByName(settings?.styleProfile);
  if (style?.style) parts.push(style.style);
  return parts.filter(Boolean);
}

export function buildOpenSoraPrompt(p, settings = null) {
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
  const craft = craftFragments(settings);

  const paragraphs = [];

  if (idea) {
    paragraphs.push(sentence(idea));
  } else if (imageAnalysis?.summary) {
    paragraphs.push(sentence(imageAnalysis.summary));
  } else {
    const subject = [genres[0], theme].filter(Boolean).join(", ");
    if (subject) paragraphs.push(sentence(`A cinematic scene featuring ${subject}`));
  }

  if (structure) paragraphs.push(sentence(`Shot structure: ${structure}`));
  if (cameras.length) paragraphs.push(sentence(`The camera ${cameras.join(" then ")}`));
  if (lighting.length) paragraphs.push(sentence(`Lighting and atmosphere: ${lighting.join(", ")}`));
  if (genres.length) paragraphs.push(sentence(`Visual style: ${genres.join(", ")}`));
  for (const c of craft) paragraphs.push(sentence(c));
  if (imageAnalysis?.visualMood && !idea.includes(imageAnalysis.visualMood)) {
    paragraphs.push(sentence(`Visual mood from reference: ${imageAnalysis.visualMood}`));
  }
  if (moodWords) paragraphs.push(sentence(`Mood: ${moodWords}`));
  if (settings?.aspectRatio) paragraphs.push(sentence(`Aspect ratio ${settings.aspectRatio}`));
  if (settings?.durationSeconds || p.tempo) {
    const dur = settings?.durationSeconds || String(p.tempo || "").replace(/s$/i, "");
    if (dur) paragraphs.push(sentence(`Target duration ${dur} seconds at ${settings?.fps || 24} fps`));
  }
  if (vocal && vocal !== "Silent visual") paragraphs.push(sentence(`Audio direction: ${vocal}`));
  if (theme && !idea.includes(theme)) paragraphs.push(sentence(`Narrative theme: ${theme}`));
  if (rules) paragraphs.push(sentence(`Constraints: ${rules.replace(/\.\s+/g, ", ")}`));

  return paragraphs.filter(Boolean).join(" ");
}

export function buildOpenSoraSceneList(p) {
  const vocal = p.vocal || "Silent visual";
  if (vocal === "Silent visual" && !p.generatedLyrics && !p.lyricTheme) return "";

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

export function buildOpenSoraJobPayload(p, settings, opts = {}) {
  const catalogPresets = getOpenSoraConfigPresets();
  const prompt = buildOpenSoraPrompt(p, settings);
  const sceneList = buildOpenSoraSceneList(p);
  const preset = OPEN_SORA_PRESETS[settings?.preset] || null;
  const numSteps = settings?.numSteps ?? preset?.numSteps ?? 50;
  const numFrames = settings?.numFrames ?? preset?.numFrames ?? 129;
  const cfg = settings?.cfg ?? preset?.cfg ?? 7.5;
  const fps = settings?.fps ?? 24;
  const seed = settings?.seed ?? 0;
  const motionScore = settings?.motionScore ?? 4;
  const configPreset = settings?.configPreset || "t2i2v_256px";
  const configPath = resolveConfigPresetPath(settings, catalogPresets);
  const resolutionTier = resolveResolutionTier(settings, catalogPresets);
  const useI2v =
    opts.useI2v !== false &&
    settings?.useI2vWhenImage !== false &&
    Boolean(opts.imagePayload?.base64);

  const fullPrompt = sceneList ? `${prompt}\n\n${sceneList}` : prompt;

  const job = {
    kind: "open_sora_job",
    app: "ai-video-tool",
    prompt: fullPrompt,
    sceneList,
    installPath: settings?.installPath || getDefaultOpenSoraInstallPath(),
    pythonPath: settings?.pythonPath || "python",
    configPreset,
    configPath,
    aspectRatio: settings?.aspectRatio || "16:9",
    resolutionTier,
    numSteps,
    numFrames,
    steps: numSteps,
    cfg,
    seed,
    resolution: settings?.resolution || "640x360",
    fps,
    motionScore,
    device: settings?.device || "cuda",
    save_dir: "outputs",
    refinePrompt: Boolean(settings?.refinePrompt),
    styleProfile: settings?.styleProfile || "cinematic",
    craft: {
      shotType: settings?.shotType || "",
      cameraPreset: settings?.cameraPreset || "",
      lensKit: settings?.lensKit || "",
      filmFormat: settings?.filmFormat || "",
      colorGrade: settings?.colorGrade || "",
      lightingSetup: settings?.lightingSetup || "",
    },
    extra_options: { motion_score: motionScore, fps_save: fps },
    cli_hint: buildOpenSoraCliHint({
      prompt: fullPrompt,
      configPath,
      aspectRatio: settings?.aspectRatio || "16:9",
      resolutionTier,
      numSteps,
      numFrames,
      cfg,
      seed,
      motionScore,
      fps,
      installPath: settings?.installPath,
      useI2v,
      refinePrompt: settings?.refinePrompt,
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
  configPath = "configs/diffusion/inference/t2i2v_256px.py",
  aspectRatio = "16:9",
  resolutionTier = "256px",
  numSteps = 50,
  numFrames = 129,
  cfg = 7.5,
  seed = 42,
  motionScore = 4,
  fps = 24,
  installPath = getDefaultOpenSoraInstallPath(),
  useI2v = false,
  refinePrompt = false,
}) {
  const escaped = prompt.replace(/"/g, '\\"');
  const lines = [`cd ${installPath}`];
  const base = `torchrun --nproc_per_node 1 --standalone scripts/diffusion/inference.py ${configPath} --prompt "${escaped}" --seed ${seed || 42} --aspect_ratio ${aspectRatio} --resolution ${resolutionTier} --sampling_option.num_steps ${numSteps} --sampling_option.num_frames ${numFrames} --sampling_option.guidance ${cfg} --motion-score ${motionScore} --fps_save ${fps}`;
  lines.push(useI2v ? `${base} --cond_type i2v_head --ref <ref.png>` : base);
  if (refinePrompt) lines.push("# add: --refine-prompt");
  lines.push("# or: python scripts/run-open-sora-job.py job.json");
  return lines.join("\n");
}

export function buildOpenSoraFieldSlices(p, settings = null) {
  return {
    style: buildOpenSoraPrompt(p, settings),
    lyrics: buildOpenSoraSceneList(p),
  };
}
