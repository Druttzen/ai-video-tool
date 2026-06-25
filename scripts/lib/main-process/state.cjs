"use strict";
const { createBundlePathGuard } = require("../ipc-security.cjs");
const pkg = require("../../../package.json");

const state = {
  appRoot: null,
  mainWindow: null,
  canvasWindow: null,
  pendingBundleImportPath: null,
  pendingCanvasPayload: null,
  bundlePathGuard: createBundlePathGuard(),
  activeBuilds: new Map(),
  pkg,
};

function setAppRoot(appRoot) {
  state.appRoot = appRoot;
}

module.exports = { state, setAppRoot };
