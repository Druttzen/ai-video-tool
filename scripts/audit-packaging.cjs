#!/usr/bin/env node
/**
 * One-off audit: packaged build.files vs repo references (scripts/, main.js, app/).
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const files = new Set((pkg.build?.files || []).map((f) => String(f).replace(/\\/g, "/")));

function inFiles(rel) {
  const n = rel.replace(/\\/g, "/");
  if (files.has(n)) return true;
  for (const f of files) {
    if (f.endsWith("/**/*") && n.startsWith(f.slice(0, -5))) return true;
  }
  return false;
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

function collectRelativeCjsRequires(relPath, seen = new Set()) {
  const normalized = relPath.replace(/\\/g, "/");
  if (seen.has(normalized)) return seen;
  seen.add(normalized);
  if (!normalized.endsWith(".cjs")) return seen;
  const full = path.join(root, normalized);
  if (!fs.existsSync(full)) return seen;
  const src = fs.readFileSync(full, "utf8");
  const dir = path.dirname(normalized);
  for (const m of src.matchAll(/require\("\.\/([^"]+)"\)/g)) {
    collectRelativeCjsRequires(`${dir}/${m[1]}`, seen);
  }
  for (const m of src.matchAll(/require\("\.\.\/([^"]+)"\)/g)) {
    collectRelativeCjsRequires(path.posix.normalize(`${dir}/../${m[1]}`), seen);
  }
  return seen;
}

function collectPyImports(pyPath, seen = new Set()) {
  const rel = path.relative(root, pyPath).replace(/\\/g, "/");
  if (seen.has(rel)) return seen;
  seen.add(rel);
  const src = fs.readFileSync(pyPath, "utf8");
  const dir = path.dirname(rel);
  for (const m of src.matchAll(/^from\s+([\w.]+)\s+import/mg)) {
    const mod = m[1].split(".")[0];
    const local = path.join(root, dir, `${mod}.py`);
    const libLocal = path.join(root, "scripts", "lib", `${mod}.py`);
    if (fs.existsSync(local)) collectPyImports(local, seen);
    if (fs.existsSync(libLocal)) collectPyImports(libLocal, seen);
  }
  for (const m of src.matchAll(/^import\s+([\w.]+)/mg)) {
    const mod = m[1].split(".")[0];
    const local = path.join(root, dir, `${mod}.py`);
    const libLocal = path.join(root, "scripts", "lib", `${mod}.py`);
    if (fs.existsSync(local)) collectPyImports(local, seen);
    if (fs.existsSync(libLocal)) collectPyImports(libLocal, seen);
  }
  return seen;
}

const issues = [];

// 1. main.js requires
const mainSrc = fs.readFileSync(path.join(root, "main.js"), "utf8");
for (const m of mainSrc.matchAll(/require\("\.\/([^"]+)"\)/g)) {
  const rel = m[1];
  if (rel === "package.json") continue;
  if (!inFiles(rel)) issues.push({ kind: "main-require", path: rel });
}

// 2. Transitive .cjs from packaged modules
const packagedCjs = [...files].filter((f) => f.startsWith("scripts/") && f.endsWith(".cjs"));
const requiredCjs = new Set();
for (const rel of packagedCjs) {
  for (const dep of collectRelativeCjsRequires(rel)) requiredCjs.add(dep);
}
for (const dep of requiredCjs) {
  if (dep.endsWith(".cjs") && !inFiles(dep)) {
    issues.push({ kind: "transitive-cjs", path: dep });
  }
}

// 3. Python scripts in build.files — imports
for (const rel of [...files].filter((f) => f.endsWith(".py"))) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    issues.push({ kind: "missing-repo-py", path: rel });
    continue;
  }
  for (const imp of collectPyImports(full)) {
    if (!inFiles(imp) && imp.startsWith("scripts/")) {
      issues.push({ kind: "py-import-not-packaged", path: imp, from: rel });
    }
  }
}

// 4. Hardcoded script paths in packaged .cjs (not using resolveBundledScript)
for (const fp of walk(path.join(root, "scripts"))) {
  const rel = path.relative(root, fp).replace(/\\/g, "/");
  if (!rel.endsWith(".cjs") || !inFiles(rel)) continue;
  const src = fs.readFileSync(fp, "utf8");
  for (const m of src.matchAll(/["'](scripts\/[^"']+\.(py|sh))["']/g)) {
    const script = m[1];
    if (!inFiles(script) && fs.existsSync(path.join(root, script))) {
      issues.push({ kind: "hardcoded-script-ref", path: script, from: rel });
    }
  }
  if (
    src.includes("app.asar") &&
    !src.includes("app.asar.unpacked") &&
    !rel.includes("install-addons-packaging") &&
    rel !== "scripts/prep-electron-dist.cjs"
  ) {
    issues.push({ kind: "asar-without-unpacked", from: rel });
  }
}

// 5. app/lib files required from main (if any)
for (const fp of walk(path.join(root, "app"))) {
  const rel = path.relative(root, fp).replace(/\\/g, "/");
  if (!/\.(js|mjs|cjs)$/.test(rel)) continue;
  if (mainSrc.includes(rel) || mainSrc.includes(rel.replace(/^app\//, "./app/"))) {
    if (!inFiles(rel) && !inFiles(`${rel.split("/")[0]}/**/*`)) {
      issues.push({ kind: "app-not-in-files", path: rel });
    }
  }
}

// 6. Scripts referenced by resolveBundledScript / resolveAppScript in main
const bundledRefs = [
  "scripts/run-director-job.py",
  "scripts/run-open-sora-job.py",
  "scripts/run-diffusers-wan-job.py",
  "scripts/run-music-video-sync.py",
  "scripts/install-addons-pip.py",
  "scripts/sync-open-sora-catalog.cjs",
  "scripts/wsl-addon-bootstrap.sh",
];
for (const ref of bundledRefs) {
  if (!inFiles(ref)) issues.push({ kind: "bundled-ref-missing", path: ref });
  if (!fs.existsSync(path.join(root, ref))) issues.push({ kind: "bundled-ref-missing-repo", path: ref });
}

const uniq = new Map();
for (const i of issues) {
  const key = `${i.kind}:${i.path || ""}:${i.from || ""}`;
  if (!uniq.has(key)) uniq.set(key, i);
}

console.log(`Packaged files: ${files.size}`);
console.log(`Issues found: ${uniq.size}`);
for (const i of [...uniq.values()].sort((a, b) => (a.kind + a.path).localeCompare(b.kind + b.path))) {
  console.log(JSON.stringify(i));
}

process.exit(uniq.size > 0 ? 1 : 0);
