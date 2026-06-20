/**
 * Write build/LICENSE.txt for NSIS installer / uninstall info (version from package.json).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT_PATH = path.join(ROOT, "build", "LICENSE.txt");

function readVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  return pkg.version || "0.0.0";
}

function buildLicenseText(version) {
  return `AI VIDEO CREATOR v${version}
Created by DJ M@D

FEATURES:
- Video Prompt Studio
- Director Engine (Create / Render / Advanced)
- Visual craft controls (camera, lens, lighting, color grade)
- Music video paths A–E (track, paste, BOTH, manuscript, audio + picture)
- Path E beat-sync, lip-sync scaffold, full/highlight duration (max 480s)
- Drag & Drop Audio + Image Analyzers
- Director and Sora-like prompt engines
- Presets, variations, and project history
- Co-Producer AI and manuscript chat
- Export prompts and jobs to any video AI
- Save / Export / Import project JSON
- Desktop auto-update (Windows)

IMPORTANT:
This tool creates prompts and job exports. Final video results depend on your AI video engine and optional local render pipeline.

FRAME THE SCENE.
DIRECT THE VISION.
`;
}

function main() {
  const version = readVersion();
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, buildLicenseText(version), "utf8");
  console.log(`Wrote ${path.relative(ROOT, OUT_PATH)} (v${version})`);
}

main();
