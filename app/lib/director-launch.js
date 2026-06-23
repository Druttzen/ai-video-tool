import { buildDirectorJobPayload } from "./director-prompt-builder";
import { isElectronApp, launchDirectorJob } from "./electron-bridge";
import { computeBuildPlan } from "./video-build-estimate";

import { normalizeLocalRenderEngine } from "./local-render-engine";

function hasLocalPipelinePath(settings) {
  return Boolean(String(settings?.localPipelinePath || "").trim());
}

function localRenderReady(settings) {
  const engine = normalizeLocalRenderEngine(settings?.localRenderEngine);
  if (engine === "diffusers-wan") return true;
  return hasLocalPipelinePath(settings);
}

/** Export-first: always works in browser; optional local render in Electron. */
export async function sendDirectorJob({ project, settings, imagePayload, buildPlan }) {
  const plan = buildPlan || computeBuildPlan(settings, null, {
    useI2v: Boolean(imagePayload?.base64),
    promptLength: project?.idea?.length || 0,
  });
  const job = buildDirectorJobPayload(project, settings, {
    imagePayload,
    estimatedBuildSeconds: plan.estimatedSeconds,
  });

  if (settings.renderBackend === "local-python") {
    if (!isElectronApp()) {
      return {
        ok: false,
        error: "Local GPU render requires the AI Video Creator desktop app.",
      };
    }
    if (!localRenderReady(settings)) {
      return {
        ok: false,
        error:
          "Local GPU render needs Wan (Diffusers) in Director → Advanced, or an Open-Sora pipeline folder for the open-sora engine.",
      };
    }

    const result = await launchDirectorJob({ job, imagePayload, settings });
    return {
      ...result,
      estimatedSeconds: plan.estimatedSeconds,
      estimatedLabel: plan.estimatedLabel,
      estimatedMs: result.estimatedMs || plan.estimatedSeconds * 1000,
    };
  }

  const blob = new Blob([JSON.stringify(job, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `director-video-job-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  return {
    ok: true,
    exportOnly: true,
    message: "Director job JSON exported — paste the prompt into Sora/Runway/Kling, or switch Output mode to Local GPU render for MP4.",
    jobPath: null,
    estimatedSeconds: plan.estimatedSeconds,
    estimatedLabel: plan.estimatedLabel,
  };
}
