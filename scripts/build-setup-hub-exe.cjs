/**
 * Build standalone Setup Hub executable (portable/dir) for bundling in main NSIS installer.
 * Output: build/setup-hub-exe/setup-hub.exe
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "build", "setup-hub-exe");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

const sharedFiles = (pkg.build?.files || []).filter(
  (entry) => entry !== "main.js" && entry !== "preload.js" && !String(entry).startsWith("out/"),
);

const setupHubFiles = [
  "setup-hub-main.js",
  "setup-hub-preload.js",
  "setup-hub/**/*",
  "icon.ico",
  ...sharedFiles,
];

const builderConfig = {
  appId: "com.djmad.aivideocreator.setuphub",
  productName: "AI Video Creator Setup Hub",
  directories: {
    output: OUT_DIR,
    buildResources: path.join(ROOT, "build"),
  },
  files: setupHubFiles,
  asarUnpack: pkg.build?.asarUnpack || [],
  extraMetadata: {
    main: "setup-hub-main.js",
  },
  win: {
    target: [{ target: "dir", arch: ["x64"] }],
    icon: "icon.ico",
    executableName: "setup-hub",
  },
  compression: "maximum",
  npmRebuild: false,
};

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const configPath = path.join(OUT_DIR, "electron-builder.setup-hub.json");
  fs.writeFileSync(configPath, JSON.stringify(builderConfig, null, 2), "utf8");

  console.log("Building standalone Setup Hub executable…");
  execSync(`npx electron-builder --config "${configPath}" --win dir`, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env },
  });

  const unpackedExe = path.join(OUT_DIR, "win-unpacked", "setup-hub.exe");
  const stagedExe = path.join(OUT_DIR, "setup-hub.exe");

  if (!fs.existsSync(unpackedExe)) {
    throw new Error(`Setup Hub build failed — missing ${unpackedExe}`);
  }

  fs.copyFileSync(unpackedExe, stagedExe);
  console.log(`Setup Hub executable ready: ${stagedExe}`);
}

main();
