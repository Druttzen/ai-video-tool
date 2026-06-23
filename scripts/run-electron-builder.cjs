/**
 * Run electron-builder using output directory from prep-electron-dist (build/.electron-dist-output).
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const { hideUserdataForDist, restoreUserdataAfterDist } = require("./lib/dist-hide-userdata.cjs");

const ROOT = path.join(__dirname, "..");
const MARKER_PATH = path.join(ROOT, "build", ".electron-dist-output");

function resolveOutputDir() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const fallback = pkg.build?.directories?.output || "electron-dist";

  if (!fs.existsSync(MARKER_PATH)) return fallback;

  const fromMarker = fs.readFileSync(MARKER_PATH, "utf8").trim();
  return fromMarker || fallback;
}

function main() {
  const output = resolveOutputDir();
  console.log(`electron-builder output: ${output}`);

  const publishIdx = process.argv.indexOf("--publish");
  const publish =
    publishIdx >= 0 ? process.argv[publishIdx + 1] || "always" : null;

  const args = [`--config.directories.output=${output}`];
  if (publish) args.push(`--publish=${publish}`);

  let userdataHidden = false;
  try {
    const hide = hideUserdataForDist(ROOT);
    userdataHidden = hide.hidden;
    if (userdataHidden) {
      console.log(`dist: moved .userdata aside for packaging → ${hide.dest}`);
    }

    execSync(`npx electron-builder ${args.join(" ")}`, {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env },
    });
  } finally {
    if (userdataHidden) {
      const restore = restoreUserdataAfterDist(ROOT);
      if (restore.restored) {
        console.log(`dist: restored .userdata → ${restore.src}`);
      } else if (restore.warning) {
        console.warn(`dist: ${restore.warning}`);
      }
    }
  }
}

main();
