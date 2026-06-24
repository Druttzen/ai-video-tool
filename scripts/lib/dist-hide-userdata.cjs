/**
 * Move repo-local .userdata aside during electron-builder.
 * WSL venv symlinks (e.g. lib64) cause EACCES when the packager scans the tree.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const USERDATA_DIR = ".userdata";
const MARKER_NAME = ".userdata-dist-hidden-at";

function markerPath(repoRoot) {
  return path.join(repoRoot, MARKER_NAME);
}

function hidePath(repoRoot) {
  return path.join(repoRoot, "..", `${path.basename(repoRoot)}-dist-hide-userdata`);
}

function moveDirectory(src, dest) {
  try {
    fs.renameSync(src, dest);
    return;
  } catch (err) {
    if (process.platform !== "win32" || (err.code !== "EPERM" && err.code !== "EACCES")) {
      throw err;
    }
  }

  // Windows: WSL-created .git trees often block rename — robocopy /MOVE is more reliable.
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  execSync(
    `robocopy "${src}" "${dest}" /E /MOVE /COPY:DAT /R:2 /W:2 /NFL /NDL /NJH /NJS`,
    { stdio: "pipe" },
  );
  if (fs.existsSync(src)) {
    fs.rmSync(src, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
}

function hideUserdataForDist(repoRoot) {
  const src = path.join(repoRoot, USERDATA_DIR);
  if (!fs.existsSync(src)) {
    return { hidden: false };
  }

  const existingMarker = markerPath(repoRoot);
  if (fs.existsSync(existingMarker)) {
    const priorDest = fs.readFileSync(existingMarker, "utf8").trim();
    if (priorDest && fs.existsSync(priorDest) && !fs.existsSync(src)) {
      moveDirectory(priorDest, src);
      fs.rmSync(existingMarker, { force: true });
    }
  }

  const dest = hidePath(repoRoot);
  if (fs.existsSync(dest)) {
    throw new Error(
      `Cannot hide .userdata — ${dest} already exists (interrupted dist build?). Remove it or restore manually.`,
    );
  }

  moveDirectory(src, dest);
  fs.writeFileSync(markerPath(repoRoot), `${dest}\n`, "utf8");
  return { hidden: true, dest };
}

function restoreUserdataAfterDist(repoRoot) {
  const marker = markerPath(repoRoot);
  if (!fs.existsSync(marker)) {
    return { restored: false };
  }

  const dest = fs.readFileSync(marker, "utf8").trim();
  const src = path.join(repoRoot, USERDATA_DIR);

  if (!dest || !fs.existsSync(dest)) {
    fs.rmSync(marker, { force: true });
    return { restored: false, warning: `hide marker present but ${dest || "(empty)"} missing` };
  }

  if (fs.existsSync(src)) {
    throw new Error(
      `.userdata exists at ${src} while restoring from ${dest} — resolve manually before re-running dist`,
    );
  }

  moveDirectory(dest, src);
  fs.rmSync(marker, { force: true });
  return { restored: true, src };
}

module.exports = {
  hideUserdataForDist,
  restoreUserdataAfterDist,
};
