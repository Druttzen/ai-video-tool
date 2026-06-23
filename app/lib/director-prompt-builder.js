/**
 * Director Engine — native prompt + job builder for AI Video Creator.
 */
import { buildMoodWords } from "./music-helpers";
import {
  buildCameraRigPhrase,
  getColorPipelinePhrase,
  getLightingSetupPhrase,
  getShotTypePhrase,
  getStyleProfileByName,
} from "./director-catalog";
import { buildOutputEncodingHints } from "./director-output-settings";
import { buildGraphicsStackPayload } from "./graphics-api";

const RESOLUTION_CONFIG_MAP = {
  "256px": "configs/diffusion/inference/t2i2v_256px.py",
  "384px": "configs/diffusion/inference/t2i2v_256px.py",
  "512px": "configs/diffusion/inference/t2i2v_512px.py",
  "768px": "configs/diffusion/inference/t2i2v_768px.py",
  "1024px": "configs/diffusion/inference/t2i2v_768px.py",
};

export function resolveDirectorResolutionTier(settings) {
  return settings?.resolution || settings?.resolutionTier || "512px";
}

export function resolveDirectorConfigPath(resolutionTier) {
  return RESOLUTION_CONFIG_MAP[resolutionTier] || RESOLUTION_CONFIG_MAP["512px"];
}

function normalize(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function sentence(s) {
  const t = normalize(s);
  if (!t) return "";
  return t.endsWith(".") ? t : `${t}.`;
}

function craftLines(settings) {
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

export function buildDirectorPrompt(p, settings = null) {
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

  if (idea) paragraphs.push(sentence(idea));
  else if (imageAnalysis?.summary) paragraphs.push(sentence(imageAnalysis.summary));
  else {
    const subject = [genres[0], theme].filter(Boolean).join(", ");
    if (subject) paragraphs.push(sentence(`A cinematic scene featuring ${subject}`));
  }

  if (structure) paragraphs.push(sentence(`Shot structure: ${structure}`));
  if (cameras.length) paragraphs.push(sentence(`Camera: ${cameras.join(" then ")}`));
  if (lighting.length) paragraphs.push(sentence(`Lighting: ${lighting.join(", ")}`));
  if (genres.length) paragraphs.push(sentence(`Visual style: ${genres.join(", ")}`));
  for (const c of craftLines(settings)) paragraphs.push(sentence(c));
  if (imageAnalysis?.visualMood && !idea.includes(imageAnalysis.visualMood)) {
    paragraphs.push(sentence(`Reference mood: ${imageAnalysis.visualMood}`));
  }
  if (moodWords) paragraphs.push(sentence(`Mood: ${moodWords}`));
  if (settings?.aspectRatio) paragraphs.push(sentence(`Aspect ratio ${settings.aspectRatio}`));
  if (settings?.outputWidth && settings?.outputHeight) {
    paragraphs.push(
      sentence(`Output ${settings.outputWidth}×${settings.outputHeight}px at ${settings.bitrateMbps || 8} Mbit/s`),
    );
  }
  if (settings?.durationSeconds || p.tempo) {
    const dur = settings?.durationSeconds || String(p.tempo || "").replace(/s$/i, "");
    if (dur) paragraphs.push(sentence(`Duration ${dur}s at ${settings?.fps || 24} fps`));
  }
  if (vocal && vocal !== "Silent visual") paragraphs.push(sentence(`Audio: ${vocal}`));
  if (theme && !idea.includes(theme)) paragraphs.push(sentence(`Theme: ${theme}`));
  if (rules) paragraphs.push(sentence(`Constraints: ${rules.replace(/\.\s+/g, ", ")}`));

  return paragraphs.filter(Boolean).join(" ");
}

export function buildDirectorSceneList(p) {
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

export function buildDirectorJobPayload(p, settings, opts = {}) {
  const prompt = buildDirectorPrompt(p, settings);
  const sceneList = buildDirectorSceneList(p);
  const fullPrompt = sceneList ? `${prompt}\n\n${sceneList}` : prompt;
  const useI2v =
    opts.useI2v !== false && settings?.useI2vWhenImage !== false && Boolean(opts.imagePayload?.base64);
  const estimatedBuildSeconds = opts.estimatedBuildSeconds ?? null;

  const resolutionTier = resolveDirectorResolutionTier(settings);

  const job = {
    kind: "director_video_job",
    app: "ai-video-tool",
    engine: "Director",
    prompt: fullPrompt,
    sceneList,
    renderBackend: settings?.renderBackend || "export",
    aspectRatio: settings?.aspectRatio || "16:9",
    resolutionTier,
    resolution: resolutionTier,
    configPath: resolveDirectorConfigPath(resolutionTier),
    hardwareTier: settings?.hardwareTier || null,
    estimatedBuildSeconds,
    output: buildOutputEncodingHints(settings),
    graphicsStack: buildGraphicsStackPayload(settings),
    numSteps: settings?.numSteps ?? 40,
    numFrames: settings?.numFrames ?? 129,
    cfg: settings?.cfg ?? 7.5,
    motionScore: settings?.motionScore ?? 4,
    seed: settings?.seed ?? 0,
    fps: settings?.fps ?? 24,
    styleProfile: settings?.styleProfile || "cinematic",
    craft: {
      shotType: settings?.shotType || "",
      cameraPreset: settings?.cameraPreset || "",
      lensKit: settings?.lensKit || "",
      filmFormat: settings?.filmFormat || "",
      colorGrade: settings?.colorGrade || "",
      lightingSetup: settings?.lightingSetup || "",
    },
    localPipelinePath: settings?.localPipelinePath || "",
    pythonPath: settings?.localPythonPath || "python",
    localRenderEngine: settings?.localRenderEngine || "diffusers-wan",
    wanModelId: settings?.wanModelId || "",
  };

  if (useI2v) {
    job.i2v = true;
    job.ref_image_name = opts.imagePayload.name;
  }

  const batchCount = Number(settings?.gpuSeedVariationCount) || 0;
  if (batchCount > 1) {
    const baseSeed = Number(settings?.seed) || Math.floor(Date.now() % 1_000_000);
    job.gpuSeeds = Array.from({ length: Math.min(batchCount, 4) }, (_, i) => baseSeed + i);
    job.seed = job.gpuSeeds[0];
  }

  return job;
}

export function buildDirectorFieldSlices(p, settings = null) {
  return {
    style: buildDirectorPrompt(p, settings),
    lyrics: buildDirectorSceneList(p),
  };
}

// Legacy aliases for migration
export const buildOpenSoraPrompt = buildDirectorPrompt;
export const buildOpenSoraJobPayload = buildDirectorJobPayload;
export const buildOpenSoraFieldSlices = buildDirectorFieldSlices;
export const buildOpenSoraSceneList = buildDirectorSceneList;
