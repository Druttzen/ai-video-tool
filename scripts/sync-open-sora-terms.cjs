/**
 * Sync autocomplete term lists from a local Open-Sora install into data/open-sora-terms.json
 * Usage: node scripts/sync-open-sora-terms.cjs [path-to-Open-Sora]
 */
const fs = require("fs");
const path = require("path");

const OPEN_SORA_ROOT = process.argv[2] || process.env.OPEN_SORA_ROOT || "E:\\Open-Sora";
const OUT = path.join(__dirname, "..", "data", "open-sora-terms.json");

const FILES = [
  { file: "autocomplete/camera_terms.py", key: "cameraMoves", var: "CAMERA_MOVES" },
  { file: "autocomplete/lighting_terms.py", key: "lightingTerms", var: "LIGHTING_TERMS" },
  { file: "autocomplete/color_profiles.py", key: "colorProfiles", var: "COLOR_PROFILES" },
  { file: "autocomplete/camera_presets.py", key: "cameraPresets", var: "CAMERA_PRESETS" },
  { file: "autocomplete/lens_kits.py", key: "lensKits", var: "LENS_KITS" },
  { file: "autocomplete/film_formats.py", key: "filmFormats", var: "FILM_FORMATS" },
];

function parsePythonList(source, varName) {
  const re = new RegExp(`${varName}\\s*=\\s*\\[([\\s\\S]*?)\\]`, "m");
  const m = source.match(re);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function titleCase(s) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function main() {
  const out = {
    syncedAt: new Date().toISOString(),
    sourceRoot: OPEN_SORA_ROOT,
    cameraMoves: [],
    lightingTerms: [],
    colorProfiles: [],
    cameraPresets: [],
    lensKits: [],
    filmFormats: [],
  };

  for (const { file, key, var: varName } of FILES) {
    const full = path.join(OPEN_SORA_ROOT, file);
    if (!fs.existsSync(full)) {
      console.warn(`skip missing: ${full}`);
      continue;
    }
    const src = fs.readFileSync(full, "utf8");
    out[key] = parsePythonList(src, varName);
    console.log(`${key}: ${out[key].length} terms`);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`Wrote ${OUT}`);
}

main();
