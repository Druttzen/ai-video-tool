/**
 * Sync full Open-Sora catalog into data/open-sora-catalog.json
 * Usage: node scripts/sync-open-sora-catalog.cjs [path-to-Open-Sora]
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const OPEN_SORA_ROOT = process.argv[2] || process.env.OPEN_SORA_ROOT || "E:\\Open-Sora";
const OUT = path.join(__dirname, "..", "data", "open-sora-catalog.json");
const TERMS_OUT = path.join(__dirname, "..", "data", "open-sora-terms.json");

const LIST_FILES = [
  { file: "autocomplete/camera_terms.py", key: "cameraMoves", var: "CAMERA_MOVES" },
  { file: "autocomplete/lighting_terms.py", key: "lightingTerms", var: "LIGHTING_TERMS" },
  { file: "autocomplete/color_profiles.py", key: "colorProfiles", var: "COLOR_PROFILES" },
  { file: "autocomplete/camera_presets.py", key: "cameraPresets", var: "CAMERA_PRESETS" },
  { file: "autocomplete/lens_kits.py", key: "lensKits", var: "LENS_KITS" },
  { file: "autocomplete/film_formats.py", key: "filmFormats", var: "FILM_FORMATS" },
];

const CONFIG_PRESETS = [
  {
    id: "t2i2v_256px",
    label: "T2I→Video 256px (recommended)",
    path: "configs/diffusion/inference/t2i2v_256px.py",
    resolutionTier: "256px",
  },
  {
    id: "256px",
    label: "Direct T2V/I2V 256px",
    path: "configs/diffusion/inference/256px.py",
    resolutionTier: "256px",
  },
  {
    id: "t2i2v_768px",
    label: "T2I→Video 768px (multi-GPU)",
    path: "configs/diffusion/inference/t2i2v_768px.py",
    resolutionTier: "768px",
  },
  {
    id: "768px",
    label: "Direct T2V/I2V 768px",
    path: "configs/diffusion/inference/768px.py",
    resolutionTier: "768px",
  },
  {
    id: "high_compression",
    label: "High compression DC-AE",
    path: "configs/diffusion/inference/high_compression.py",
    resolutionTier: "256px",
  },
];

const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "2.39:1", "21:9", "5:8", "3:2", "1.85:1", "2:1"];

function parsePythonList(source, varName) {
  const re = new RegExp(`${varName}\\s*=\\s*\\[([\\s\\S]*?)\\]`, "m");
  const m = source.match(re);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function parsePythonDict(source, varName) {
  const re = new RegExp(`${varName}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`, "m");
  const m = source.match(re);
  if (!m) return {};
  const out = {};
  const entryRe = /"([^"]+)":\s*"((?:\\.|[^"\\])*)"/g;
  let em;
  while ((em = entryRe.exec(m[1])) !== null) {
    out[em[1]] = em[2].replace(/\\"/g, '"');
  }
  return out;
}

function pyJson(statements) {
  const script = [
    "import json, sys",
    `sys.path.insert(0, ${JSON.stringify(OPEN_SORA_ROOT.replace(/\\/g, "/"))})`,
    statements,
  ].join("\n");
  const tmp = path.join(__dirname, ".sync-open-sora-tmp.py");
  try {
    fs.writeFileSync(tmp, script, "utf8");
    const raw = execSync(`python "${tmp}"`, {
      cwd: OPEN_SORA_ROOT,
      encoding: "utf8",
      timeout: 15000,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    return JSON.parse(raw.trim());
  } catch (e) {
    console.warn("python export failed:", e.message?.slice(0, 120));
    return null;
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {}
  }
}

function readCsvPrompts(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];
  const header = lines[0].split(",");
  const textIdx = header.findIndex((h) => /text|prompt/i.test(h));
  const refIdx = header.findIndex((h) => /ref|image|path/i.test(h));
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const text = cols[textIdx >= 0 ? textIdx : 0]?.trim().replace(/^"|"$/g, "") || "";
    const ref = refIdx >= 0 ? cols[refIdx]?.trim().replace(/^"|"$/g, "") : "";
    return ref ? { text, ref } : { text };
  }).filter((r) => r.text);
}

function main() {
  const catalog = {
    syncedAt: new Date().toISOString(),
    sourceRoot: OPEN_SORA_ROOT,
    config: null,
    cameraMoves: [],
    lightingTerms: [],
    colorProfiles: [],
    cameraPresets: [],
    lensKits: [],
    filmFormats: [],
    sceneTemplates: {},
    styleProfiles: [],
    shotTypes: {},
    lightingSetups: {},
    colorPipelines: {},
    cameraRig: { cameras: [], lenses: [], moves: [] },
    randomInspiration: {
      topics: [],
      envs: [],
      cameras: [],
      moods: [],
      lengths: ["6", "8", "10", "12"],
      fps: ["24", "30", "60"],
      ratios: ["16:9", "9:16", "21:9"],
    },
    examplePrompts: [],
    configPresets: CONFIG_PRESETS,
    aspectRatios: ASPECT_RATIOS,
    motionScore: { min: 1, max: 15, default: 4, dynamic: "dynamic" },
  };

  const configPath = path.join(OPEN_SORA_ROOT, "config.json");
  if (fs.existsSync(configPath)) {
    try {
      catalog.config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch {
      catalog.config = null;
    }
  }

  for (const { file, key, var: varName } of LIST_FILES) {
    const full = path.join(OPEN_SORA_ROOT, file);
    if (!fs.existsSync(full)) {
      console.warn(`skip missing: ${full}`);
      continue;
    }
    const src = fs.readFileSync(full, "utf8");
    catalog[key] = parsePythonList(src, varName);
    console.log(`${key}: ${catalog[key].length}`);
  }

  catalog.sceneTemplates =
    pyJson(
      "from templates.scene_templates import SCENE_TEMPLATES\nprint(json.dumps(SCENE_TEMPLATES, ensure_ascii=False))",
    ) || {};

  catalog.styleProfiles =
    pyJson(`
from chat_assistant import STYLES
print(json.dumps([{"name": s.name, "label": s.label, "style": s.style} for s in STYLES], ensure_ascii=False))
`) || [
      {
        name: "cinematic",
        label: "Cinematic",
        style:
          "cinematic, ultra detailed, 4K, natural lighting, volumetric fog, dynamic camera movement, shallow depth of field, filmic color grading",
      },
      {
        name: "documentary",
        label: "Documentary",
        style:
          "documentary style, handheld camera, natural lighting, realistic colors, subtle camera motion, real-world look",
      },
      {
        name: "stylized",
        label: "Stylized",
        style:
          "stylized, vivid colors, high contrast, expressive lighting, artistic exaggeration, bold composition",
      },
    ];

  const shotSrc = path.join(OPEN_SORA_ROOT, "builders/shot_types.py");
  if (fs.existsSync(shotSrc)) {
    catalog.shotTypes = parsePythonDict(fs.readFileSync(shotSrc, "utf8"), "SHOT_TYPES");
  }

  const lightSrc = path.join(OPEN_SORA_ROOT, "builders/lighting_designer.py");
  if (fs.existsSync(lightSrc)) {
    catalog.lightingSetups = parsePythonDict(fs.readFileSync(lightSrc, "utf8"), "LIGHTING_SETUPS");
  }

  const colorSrc = path.join(OPEN_SORA_ROOT, "builders/color_pipeline.py");
  if (fs.existsSync(colorSrc)) {
    catalog.colorPipelines = parsePythonDict(fs.readFileSync(colorSrc, "utf8"), "COLOR_PIPELINES");
  }

  const rigSrc = path.join(OPEN_SORA_ROOT, "builders/camera_rig_builder.py");
  if (fs.existsSync(rigSrc)) {
    const rigText = fs.readFileSync(rigSrc, "utf8");
    catalog.cameraRig = {
      cameras: parsePythonList(rigText, "CAMERA_RIG_CAMERAS"),
      lenses: parsePythonList(rigText, "CAMERA_RIG_LENSES"),
      moves: parsePythonList(rigText, "CAMERA_RIG_MOVES"),
    };
  }

  const inspireSrc = path.join(OPEN_SORA_ROOT, "templates/random_inspiration.py");
  if (fs.existsSync(inspireSrc)) {
    const t = fs.readFileSync(inspireSrc, "utf8");
    catalog.randomInspiration.topics = parsePythonList(t, "RANDOM_TOPICS");
    catalog.randomInspiration.envs = parsePythonList(t, "RANDOM_ENVS");
    catalog.randomInspiration.cameras = parsePythonList(t, "RANDOM_CAMERAS");
    catalog.randomInspiration.moods = parsePythonList(t, "RANDOM_MOODS");
    const lengths = parsePythonList(t, "RANDOM_LENGTHS");
    const fps = parsePythonList(t, "RANDOM_FPS");
    const ratios = parsePythonList(t, "RANDOM_RATIOS");
    if (lengths.length) catalog.randomInspiration.lengths = lengths;
    if (fps.length) catalog.randomInspiration.fps = fps;
    if (ratios.length) catalog.randomInspiration.ratios = ratios;
  }

  catalog.examplePrompts = [
    ...readCsvPrompts(path.join(OPEN_SORA_ROOT, "assets/texts/example.csv")),
    ...readCsvPrompts(path.join(OPEN_SORA_ROOT, "assets/texts/sora.csv")),
  ];

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(catalog, null, 2));
  console.log(`Wrote ${OUT}`);

  const termsSubset = {
    syncedAt: catalog.syncedAt,
    sourceRoot: catalog.sourceRoot,
    cameraMoves: catalog.cameraMoves,
    lightingTerms: catalog.lightingTerms,
    colorProfiles: catalog.colorProfiles,
    cameraPresets: catalog.cameraPresets,
    lensKits: catalog.lensKits,
    filmFormats: catalog.filmFormats,
  };
  fs.writeFileSync(TERMS_OUT, JSON.stringify(termsSubset, null, 2));
  console.log(`Wrote ${TERMS_OUT}`);
}

main();
