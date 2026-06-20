import { buildDirectorJobPayload } from "./director-prompt-builder";
import { isElectronApp, launchDirectorJob } from "./electron-bridge";
import { computeBuildPlan } from "./video-build-estimate";

function hasLocalPipelinePath(settings) {
  return Boolean(String(settings?.localPipelinePath || "").trim());
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
    if (!hasLocalPipelinePath(settings)) {
      return {
        ok: false,
        error:
          "Local GPU render needs a pipeline folder (Director → Advanced). Output settings (MP4) apply after render — Export only saves job JSON.",
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
