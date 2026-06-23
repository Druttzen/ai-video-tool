/**
 * Local GPU render engine selection (Director → Advanced).
 */

export const LOCAL_RENDER_ENGINES = [
  {
    id: "diffusers-wan",
    label: "Wan 2.1 (Diffusers)",
    description:
      "Native Windows/Linux CUDA — Hugging Face Diffusers + Wan 2.1 T2V 1.3B. No Open-Sora folder or WSL required.",
    default: true,
  },
  {
    id: "open-sora",
    label: "Open-Sora 2.0",
    description: "Legacy ColossalAI pipeline — needs Open-Sora clone; on Windows prefer WSL render stack.",
  },
  {
    id: "comfyui",
    label: "ComfyUI (coming soon)",
    description: "POST workflow JSON to a local ComfyUI server — optional power-user path.",
    disabled: true,
  },
];

export const DEFAULT_LOCAL_RENDER_ENGINE = "diffusers-wan";

export const WAN_DEFAULT_MODEL_ID = "Wan-AI/Wan2.1-T2V-1.3B-Diffusers";

export function normalizeLocalRenderEngine(value) {
  const id = String(value || "").trim();
  if (LOCAL_RENDER_ENGINES.some((e) => e.id === id && !e.disabled)) return id;
  return DEFAULT_LOCAL_RENDER_ENGINE;
}

/**
 * Setup Hub / production modules required per engine.
 * @param {string} engine
 */
export function productionRequiredModulesForEngine(engine) {
  const id = normalizeLocalRenderEngine(engine);
  if (id === "diffusers-wan") {
    return ["python", "venv", "pip-deps"];
  }
  return ["python", "pipeline", "models"];
}

/**
 * Windows native render ready when torch+CUDA work (no colossalai for diffusers-wan).
 * @param {object} raw — host scan raw
 * @param {string} [engine]
 */
export function isWinNativeRenderReady(raw, engine = DEFAULT_LOCAL_RENDER_ENGINE) {
  const pip = raw?.pipDeps;
  if (!pip?.ok || !pip?.cudaOk) return false;
  if (normalizeLocalRenderEngine(engine) === "diffusers-wan") {
    return Boolean(pip.diffusersOk ?? pip.ok);
  }
  return Boolean(pip.winRenderReady);
}
