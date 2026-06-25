import { buildImagePaletteSuggestions } from "./analyzer-suggestions";
import { clamp, uniq } from "./music-helpers";

function rgbToHue(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = Math.round(h * 60);
  return h < 0 ? h + 360 : h;
}

function hueLabel(hue) {
  if (hue < 15 || hue >= 345) return "red";
  if (hue < 45) return "orange";
  if (hue < 75) return "yellow";
  if (hue < 165) return "green";
  if (hue < 195) return "cyan";
  if (hue < 255) return "blue";
  if (hue < 285) return "violet";
  return "magenta";
}

function resolveAspectLabel(width, height) {
  if (!width || !height) return "unknown";
  const ratio = width / height;
  if (ratio > 1.2) return "landscape";
  if (ratio < 0.85) return "portrait";
  return "square";
}

/**
 * Aggregate RGBA sample buffer (160px-wide downscale) into color/mood traits.
 * @param {Uint8ClampedArray} data ImageData.data from canvas getImageData
 */
export function computeImagePixelStats(data) {
  let r = 0;
  let g = 0;
  let b = 0;
  let brightness = 0;
  let saturation = 0;
  let contrast = 0;
  const luminances = [];
  const pixels = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    const rr = data[i];
    const gg = data[i + 1];
    const bb = data[i + 2];
    r += rr;
    g += gg;
    b += bb;
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    const lum = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
    brightness += lum;
    saturation += max === 0 ? 0 : ((max - min) / max) * 100;
    luminances.push(lum);
  }

  r = Math.round(r / pixels);
  g = Math.round(g / pixels);
  b = Math.round(b / pixels);
  brightness = brightness / pixels;
  saturation = saturation / pixels;
  const mean = brightness;
  for (const lum of luminances) contrast += Math.abs(lum - mean);
  contrast = contrast / luminances.length;

  const warm = r > b + 15;
  const cool = b > r + 15;
  const dark = brightness < 95;
  const bright = brightness > 165;
  const vivid = saturation > 45;
  const highContrast = contrast > 45;

  return {
    r,
    g,
    b,
    brightness,
    saturation,
    contrast,
    warm,
    cool,
    dark,
    bright,
    vivid,
    highContrast,
  };
}

/**
 * @param {string} fileName
 * @param {ReturnType<typeof computeImagePixelStats>} stats
 * @param {{ width?: number, height?: number }} [opts]
 */
export function buildImageAnalysis(fileName, stats, opts = {}) {
  const {
    r,
    g,
    b,
    brightness,
    saturation,
    contrast,
    warm,
    cool,
    dark,
    bright,
    vivid,
    highContrast,
  } = stats;

  const moodSuggestion = {
    darkness: clamp(dark ? 82 : bright ? 25 : 55),
    energy: clamp(vivid ? 78 : bright ? 62 : 45),
    aggression: clamp(highContrast ? 72 : dark ? 55 : 35),
    emotion: clamp(warm ? 70 : cool ? 45 : 55),
    complexity: clamp(highContrast ? 78 : saturation > 30 ? 58 : 35),
    space: clamp(bright ? 75 : cool ? 68 : 50),
  };

  const palette = buildImagePaletteSuggestions({
    dark,
    cool,
    warm,
    vivid,
    bright,
    highContrast,
  });

  const suggestedGenres = uniq(palette.suggestedGenres);
  const suggestedSounds = uniq(palette.suggestedSounds);
  const suggestedRhythms = uniq(palette.suggestedRhythms);

  const visualMood = `${dark ? "dark" : bright ? "bright" : "balanced"}, ${vivid ? "vivid" : "muted"}, ${highContrast ? "high-contrast" : "soft-contrast"}, ${warm ? "warm" : cool ? "cool" : "neutral"}`;
  const dominantHue = rgbToHue(r, g, b);
  const colorTemperature = warm ? "warm" : cool ? "cool" : "neutral";
  const aspectLabel = resolveAspectLabel(opts.width, opts.height);
  const aspectRatio =
    opts.width && opts.height ? Math.round((opts.width / opts.height) * 100) / 100 : null;

  const summary = `File: ${fileName}
Average color: rgb(${r}, ${g}, ${b})
Visual mood: ${visualMood}
Brightness: ${Math.round(brightness)}/255
Saturation: ${Math.round(saturation)}/100
Contrast: ${Math.round(contrast)}/100
Suggested genres: ${suggestedGenres.join(", ") || "Experimental"}
Suggested sounds: ${suggestedSounds.join(", ") || "Analog synths, atmospheric textures"}
Suggested rhythms: ${suggestedRhythms.join(", ") || "Minimal"}
Interpretation: turn the image into a ${visualMood} music style with matching texture, space, and energy.`;

  return {
    version: 2,
    fileName,
    source: "browser-canvas",
    analyzedAt: new Date().toISOString(),
    avgColor: `rgb(${r}, ${g}, ${b})`,
    dominantHue,
    hueLabel: hueLabel(dominantHue),
    colorTemperature,
    aspectRatio,
    aspectLabel,
    width: opts.width || null,
    height: opts.height || null,
    brightness,
    saturation,
    contrast,
    visualMood,
    suggestedGenres,
    suggestedSounds,
    suggestedRhythms,
    summary,
    moodSuggestion,
  };
}

/**
 * @param {Uint8ClampedArray} rgba
 * @param {string} fileName
 * @param {{ width?: number, height?: number }} [opts]
 */
export function analyzeImagePixelData(rgba, fileName, opts = {}) {
  return buildImageAnalysis(fileName, computeImagePixelStats(rgba), opts);
}
