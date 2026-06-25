import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildAnalysisChips,
  buildDefaultAgentSession,
  buildLearningHints,
  buildNextSteps,
  buildVideoPrepContext,
  buildWorkflowSuggestions,
  detectWorkflowIntent,
  detectWorkflowPhase,
  dispatchAgentActions,
  enrichAgentProposal,
  formatNextStepsSection,
  mergeLearningProfile,
  normalizeAgentSession,
  normalizeSuggestedActions,
  parseAgentResponse,
  saveAgentSession,
  loadAgentSession,
  videoPrepHeuristic,
  WORKFLOW_PHASES,
} from "../app/lib/video-prep-agent.js";

describe("video-prep-agent", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
  });

  it("buildVideoPrepContext includes workflow intent and next steps", () => {
    const ctx = buildVideoPrepContext({
      project: { idea: "Neon highway synthwave MV", selectedGenres: ["Noir"] },
      audioAnalysis: {
        fileName: "track.wav",
        duration: 180,
        estimatedBpm: "128 BPM",
        moodSuggestion: { energy: 72 },
        suggestedGenres: ["Trap"],
      },
      imageAnalysis: {
        fileName: "ref.png",
        visualMood: "dark, vivid, warm",
        avgColor: "rgb(10, 20, 30)",
      },
      directorSettings: { durationSeconds: "10", qualityPreset: "STANDARD" },
    });

    expect(ctx.project.idea).toBe("Neon highway synthwave MV");
    expect(ctx.buildIntent?.buildTarget).toBeTruthy();
    expect(ctx.buildIntent?.recommendedActionId).toBeTruthy();
    expect(ctx.workflowReadiness[5].ready).toBe(true);
    expect(ctx.workflowIntent.recommendedPath).toBe(5);
    expect(ctx.nextSteps.length).toBeGreaterThan(0);
    expect(ctx.whatsNext.primary.length).toBeGreaterThan(0);
  });

  it("buildAnalysisChips surfaces BPM and visual mood", () => {
    const chips = buildAnalysisChips(
      { estimatedBpm: "140 BPM", moodSuggestion: { energy: 80 }, fileName: "a.wav" },
      { visualMood: "bright, cool", avgColor: "rgb(1,2,3)" },
    );
    expect(chips.some((c) => c.label.includes("140"))).toBe(true);
    expect(chips.some((c) => c.label.includes("Visual"))).toBe(true);
  });

  it("detectWorkflowPhase walks start → plan_ready", () => {
    expect(detectWorkflowPhase({})).toBe("start");
    expect(
      detectWorkflowPhase({
        audioAnalysis: { fileName: "a.wav", estimatedBpm: "120" },
      }),
    ).toBe("analyzed");
    expect(
      detectWorkflowPhase({
        messages: [{ role: "user", content: "Synthwave MV" }],
        audioAnalysis: { estimatedBpm: "120" },
      }),
    ).toBe("brief_sent");
    expect(
      detectWorkflowPhase({
        messages: [{ role: "user", content: "Synthwave MV" }],
        audioAnalysis: { estimatedBpm: "120" },
        lastProposal: { patch: { idea: "Neon alley", selectedGenres: ["Noir"] } },
      }),
    ).toBe("plan_ready");
    expect(WORKFLOW_PHASES).toContain("director_ready");
  });

  it("detectWorkflowPhase tracks production rendering → done", () => {
    expect(detectWorkflowPhase({ production: { phase: "rendering" } })).toBe("rendering");
    expect(detectWorkflowPhase({ production: { phase: "assembled" } })).toBe("assembled");
    expect(detectWorkflowPhase({ production: { phase: "done" } })).toBe("done");
  });

  it("buildNextSteps suggests produce video when director ready", () => {
    const steps = buildNextSteps({
      phase: "director_ready",
      checklist: { patchApplied: true, directorReady: true, hasPlan: true },
      workflowIntent: { recommendedPath: 1, label: "Path A", intent: "path-1" },
    });
    expect(steps.some((s) => s.actionId === "runFullProduction")).toBe(true);
  });

  it("detectWorkflowIntent prefers beat-sync for synthwave track", () => {
    const intent = detectWorkflowIntent({
      userText: "Synthwave MV full song beat sync",
      audioAnalysis: { estimatedBpm: "128 BPM", suggestedGenres: ["Synthwave"] },
    });
    expect(intent.recommendedPath).toBe(1);
    expect(["path-1", "beat-sync-mv"]).toContain(intent.intent);
  });

  it("detectWorkflowIntent prefers Path E when audio + image present", () => {
    const intent = detectWorkflowIntent({
      audioAnalysis: { estimatedBpm: "120" },
      imageAnalysis: { visualMood: "neon" },
    });
    expect(intent.recommendedPath).toBe(5);
  });

  it("buildNextSteps ranks primary Path A for synthwave track", () => {
    const intent = detectWorkflowIntent({
      userText: "Synthwave MV",
      audioAnalysis: { estimatedBpm: "128" },
    });
    const steps = buildNextSteps({
      workflowIntent: intent,
      phase: "analyzed",
      checklist: { hasAudio: true, hasBrief: false },
    });
    const primary = steps.filter((s) => s.priority === "primary");
    expect(primary.some((s) => s.actionId === "applyAudioToMusicVideo")).toBe(true);
    expect(steps.some((s) => s.priority === "optional")).toBe(true);
  });

  it("formatNextStepsSection labels primary vs optional", () => {
    const text = formatNextStepsSection(
      [
        { title: "Map track", why: "Beat sync", priority: "primary" },
        { title: "GPU optimize", why: "Optional tuning", priority: "optional" },
      ],
      { label: "Path A — track + beat sync MV" },
    );
    expect(text).toMatch(/Map track/);
    expect(text).toMatch(/Optional: GPU optimize/);
  });

  it("buildWorkflowSuggestions returns phase-relevant chips", () => {
    const start = buildWorkflowSuggestions("start", { checklist: { hasAudio: false } });
    expect(start.some((s) => s.id === "drop-track")).toBe(true);

    const plan = buildWorkflowSuggestions("plan_ready", {
      checklist: { hasPlan: true, patchApplied: false },
    });
    expect(plan.some((s) => s.id === "apply-all")).toBe(true);
  });

  it("mergeLearningProfile accumulates workflow intent by genre", () => {
    let profile = buildDefaultAgentSession().learningProfile;
    profile = mergeLearningProfile(profile, {
      type: "apply",
      actionIds: ["applyAudioToMusicVideo"],
      patch: { selectedGenres: ["Synthwave"], idea: "Highway" },
      workflowIntent: "beat-sync-mv",
    });

    expect(profile.workflowIntents["beat-sync-mv"]).toBe(1);
    expect(profile.intentByGenre.Synthwave["beat-sync-mv"]).toBe(1);

    const biased = detectWorkflowIntent({
      userText: "MV",
      project: { selectedGenres: ["Synthwave"] },
      audioAnalysis: { estimatedBpm: "120" },
      learningProfile: profile,
    });
    expect(biased.recommendedPath).toBe(1);

    const hints = buildLearningHints(profile);
    expect(hints).toMatch(/Synthwave|beat-sync|Beat-sync/i);
  });

  it("parseAgentResponse extracts workflowIntent and nextSteps", () => {
    const parsed = parseAgentResponse({
      assistantReply: "Ready for synthwave MV",
      workflowIntent: "beat-sync-mv",
      recommendedPath: 1,
      nextSteps: [
        {
          title: "Map track",
          why: "Beat sync",
          actionId: "applyAudioToMusicVideo",
          priority: "primary",
        },
      ],
      projectPatch: {
        idea: "Courier in neon alley",
        selectedGenres: ["Cinematic", "Noir"],
        selectedSounds: ["Neon night"],
        selectedRhythms: ["Tracking shot"],
        vocal: "Silent visual",
        tempo: "12s",
      },
    });

    expect(parsed.workflowIntent.intent).toBe("beat-sync-mv");
    expect(parsed.nextSteps[0].actionId).toBe("applyAudioToMusicVideo");
    expect(parsed.recommendedPath).toBe(1);
  });

  it("enrichAgentProposal fills nextSteps when LLM omits them", () => {
    const ctx = buildVideoPrepContext({
      audioAnalysis: { estimatedBpm: "128 BPM" },
      messages: [{ role: "user", content: "Synthwave MV" }],
    });
    const enriched = enrichAgentProposal(
      {
        assistantReply: "Plan ready",
        patch: { idea: "Neon", selectedGenres: ["Synthwave"], promptEngine: "Director" },
        suggestedActions: [{ id: "patchProject" }],
      },
      ctx,
      "Synthwave MV",
    );
    expect(enriched.nextSteps.length).toBeGreaterThan(0);
    expect(enriched.whatsNext.primary.length).toBeGreaterThan(0);
    expect(enriched.workflowIntent.recommendedPath).toBe(1);
  });

  it("normalizeAgentSession merges defaults", () => {
    const session = normalizeAgentSession({ messages: [{ role: "user", content: "Hi" }] });
    expect(session.version).toBe(1);
    expect(session.workflow.checklist.hasAudio).toBe(false);
    expect(session.messages).toHaveLength(1);
  });

  it("load/save session roundtrip via localStorage mock", async () => {
    const store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
    });

    const session = buildDefaultAgentSession();
    session.messages = [{ role: "user", content: "Test", ts: 1 }];
    session.learningProfile = mergeLearningProfile(session.learningProfile, {
      type: "apply",
      actionIds: ["patchProject"],
      patch: { idea: "Test" },
      workflowIntent: "path-4",
    });

    await saveAgentSession(session);
    const loaded = await loadAgentSession();
    expect(loaded.session.messages).toHaveLength(1);
    expect(loaded.session.learningProfile.workflowIntents["path-4"]).toBe(1);
    expect(loaded.source).toBe("localStorage");
  });

  it("normalizeSuggestedActions filters invalid ids", () => {
    expect(normalizeSuggestedActions(["patchProject", "bogus", { id: "runGpuWorkflow" }])).toEqual([
      { id: "patchProject" },
      { id: "runGpuWorkflow" },
    ]);
  });

  it("videoPrepHeuristic includes nextSteps for audio+image", () => {
    const ctx = buildVideoPrepContext({
      audioAnalysis: { duration: 200, estimatedBpm: "120" },
      imageAnalysis: { visualMood: "dark" },
    });
    const result = videoPrepHeuristic("Dark synthwave MV", ctx);
    expect(result.patch.promptEngine).toBe("Director");
    expect(result.nextSteps.length).toBeGreaterThan(0);
    expect(result.suggestedActions.some((a) => a.id === "applyAudioVisualMusicVideo")).toBe(true);
  });

  it("dispatchAgentActions applies patch, director settings, and handlers", async () => {
    const patch = vi.fn();
    const applyAudioToMusicVideo = vi.fn();
    const captureSnapshot = vi.fn();

    const proposal = {
      patch: { idea: "Test", promptEngine: "Director" },
      directorSettingsPatch: { durationSeconds: "30" },
      suggestedActions: [{ id: "patchProject" }, { id: "applyAudioToMusicVideo" }],
    };

    const { ok, results } = await dispatchAgentActions(proposal, {
      patch,
      captureSnapshot,
      applyAudioToMusicVideo,
    });

    expect(ok).toBe(true);
    expect(captureSnapshot).toHaveBeenCalled();
    expect(patch).toHaveBeenCalledWith(proposal.patch);
    expect(applyAudioToMusicVideo).toHaveBeenCalled();
    expect(results.some((r) => r.id === "saveDirectorSettings")).toBe(true);
  });
});
