/** Node mirror of app/lib/local-render-engine.js for main process + CLI scripts. */

const DEFAULT_LOCAL_RENDER_ENGINE = "diffusers-wan";

function normalizeLocalRenderEngine(value) {
  const id = String(value || "").trim();
  if (id === "diffusers-wan" || id === "open-sora") return id;
  return DEFAULT_LOCAL_RENDER_ENGINE;
}

function isDiffusersWanEngine(engine) {
  return normalizeLocalRenderEngine(engine) === "diffusers-wan";
}

module.exports = {
  DEFAULT_LOCAL_RENDER_ENGINE,
  isDiffusersWanEngine,
  normalizeLocalRenderEngine,
};
