"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isCoProducerLlmReady } from "../lib/co-producer-llm";
import {
  buildAnalysisChips,
  buildVideoPrepAgentLlmMessages,
  buildVideoPrepContext,
  buildWorkflowSuggestions,
  detectWorkflowPhase,
  dispatchAgentActions,
  enrichAgentProposal,
  loadAgentSession,
  mergeLearningProfile,
  mergeSessionFromWorkspace,
  runNextStep,
  runWorkflowSuggestion,
  saveAgentSession,
  videoPrepHeuristic,
  sendVideoPrepAgentRequest,
} from "../lib/video-prep-agent";
import {
  isSupportedAudioFile,
  isSupportedImageFile,
  SUPPORTED_AUDIO_ACCEPT,
  SUPPORTED_IMAGE_ACCEPT,
} from "../lib/analyzer-file-types";
import { loadDirectorSettingsFromStorage, saveDirectorSettingsToStorage } from "../lib/director-settings";
import { PROJECT_RESET_EVENT } from "../lib/project-reset";
import { scrollToDirectorPanelAfterApply } from "../lib/music-video-workflows";
import {
  checkProductionReadiness,
  mergeProductionSession,
  revealProductionOutput,
  runFullProduction,
} from "../lib/video-production-pipeline";
import { resolveAudioCacheBlob } from "../lib/audio-cache";
import { trackLaunchBuildProgress, VIDEO_BUILD_START_EVENT } from "../context/video-build-context";

/**
 * Video Prep Agent — chat + file uploads → project / Director prep with persistent memory.
 * @param {object} opts
 */
export function useVideoPrepAgent({
  coProducerLlmSettings,
  patch,
  captureSnapshot,
  setStatusWithTime,
  projectContext,
  audioAnalysis,
  imageAnalysis,
  sunoPasteStyle,
  sunoPasteLyrics,
  analyzeAudioFile,
  analyzeImageFile,
  applyAudioToMusicVideo,
  applySunoPasteToMusicVideo,
  applyMusicVideoFromBoth,
  applyAudioVisualMusicVideo,
  runGpuWorkflow,
  generateLyrics,
  readImageSourceForOpenSora,
}) {
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [sessionSource, setSessionSource] = useState("default");
  const [sessionPath, setSessionPath] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [attachBusy, setAttachBusy] = useState(false);
  const [lastProposal, setLastProposal] = useState(null);
  const [learningProfile, setLearningProfile] = useState(null);
  const [patchApplied, setPatchApplied] = useState(false);
  const [directorReady, setDirectorReady] = useState(false);
  const [productionState, setProductionState] = useState(null);
  const abortRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const persistTimerRef = useRef(null);

  const prepContext = useMemo(
    () =>
      buildVideoPrepContext({
        project: projectContext,
        audioAnalysis,
        imageAnalysis,
        sunoPasteStyle,
        sunoPasteLyrics,
        directorSettings: loadDirectorSettingsFromStorage(),
        messages,
        lastProposal,
        patchApplied,
        directorReady,
        production: productionState,
        learningProfile,
      }),
    [
      audioAnalysis,
      directorReady,
      imageAnalysis,
      lastProposal,
      learningProfile,
      messages,
      patchApplied,
      projectContext,
      productionState,
      sunoPasteLyrics,
      sunoPasteStyle,
    ],
  );

  const workflowPhase = prepContext.workflowPhase;
  const workflowChecklist = prepContext.workflowChecklist;
  const workflowSuggestions = prepContext.workflowSuggestions;
  const agentWhatsNext = prepContext.whatsNext;

  const analysisChips = useMemo(
    () => buildAnalysisChips(audioAnalysis, imageAnalysis),
    [audioAnalysis, imageAnalysis],
  );

  const schedulePersist = useCallback(
    (nextMessages, nextProposal, nextLearning, nextPatchApplied, nextDirectorReady) => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(async () => {
        const session = mergeSessionFromWorkspace(
          {
            messages: nextMessages,
            lastProposal: nextProposal,
            learningProfile: nextLearning,
            workflow: {
              checklist: buildVideoPrepContext({
                project: projectContext,
                audioAnalysis,
                imageAnalysis,
                sunoPasteStyle,
                sunoPasteLyrics,
                messages: nextMessages,
                lastProposal: nextProposal,
                patchApplied: nextPatchApplied,
                directorReady: nextDirectorReady,
              }).workflowChecklist,
            },
          },
          {
            audioAnalysis,
            imageAnalysis,
            sunoPasteStyle,
            sunoPasteLyrics,
            messages: nextMessages,
            lastProposal: nextProposal,
            patchApplied: nextPatchApplied,
            directorReady: nextDirectorReady,
          },
        );
        session.lastProposal = nextProposal;
        session.learningProfile = nextLearning;
        await saveAgentSession(session);
      }, 400);
    },
    [audioAnalysis, imageAnalysis, projectContext, sunoPasteLyrics, sunoPasteStyle],
  );

  const persistState = useCallback(
    (partial = {}) => {
      const nextMessages = partial.messages ?? messages;
      const nextProposal = partial.lastProposal !== undefined ? partial.lastProposal : lastProposal;
      const nextLearning = partial.learningProfile ?? learningProfile;
      const nextPatchApplied = partial.patchApplied ?? patchApplied;
      const nextDirectorReady = partial.directorReady ?? directorReady;

      if (partial.messages !== undefined) setMessages(nextMessages);
      if (partial.lastProposal !== undefined) setLastProposal(nextProposal);
      if (partial.learningProfile !== undefined) setLearningProfile(nextLearning);
      if (partial.patchApplied !== undefined) setPatchApplied(nextPatchApplied);
      if (partial.directorReady !== undefined) setDirectorReady(nextDirectorReady);

      schedulePersist(
        nextMessages,
        nextProposal,
        nextLearning,
        nextPatchApplied,
        nextDirectorReady,
      );
    },
    [
      directorReady,
      lastProposal,
      learningProfile,
      messages,
      patchApplied,
      schedulePersist,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { session, source, path } = await loadAgentSession();
      if (cancelled) return;
      setMessages(session.messages || []);
      setLastProposal(session.lastProposal || null);
      setLearningProfile(session.learningProfile || null);
      setPatchApplied(Boolean(session.workflow?.checklist?.patchApplied));
      setDirectorReady(Boolean(session.workflow?.checklist?.directorReady));
      setProductionState(session.production || null);
      setSessionSource(source);
      setSessionPath(path || null);
      setSessionLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onProjectReset = () => {
      abortRef.current?.abort();
      setMessages([]);
      setLastProposal(null);
      setDraft("");
      setPatchApplied(false);
      setDirectorReady(false);
      setProductionState(null);
      saveAgentSession({
        messages: [],
        lastProposal: null,
        learningProfile,
        production: null,
        workflow: { checklist: { patchApplied: false, directorReady: false } },
      });
    };
    window.addEventListener(PROJECT_RESET_EVENT, onProjectReset);
    return () => window.removeEventListener(PROJECT_RESET_EVENT, onProjectReset);
  }, [learningProfile]);
  const updateProduction = useCallback(
    (patch, persist = true) => {
      setProductionState((prev) => {
        const next = mergeProductionSession({ production: prev }, patch).production;
        if (persist) {
          schedulePersist(messages, lastProposal, learningProfile, patchApplied, directorReady);
          saveAgentSession(
            mergeSessionFromWorkspace(
              {
                messages,
                lastProposal,
                learningProfile,
                production: next,
              },
              {
                audioAnalysis,
                imageAnalysis,
                sunoPasteStyle,
                sunoPasteLyrics,
                messages,
                lastProposal,
                patchApplied,
                directorReady,
                production: next,
              },
            ),
          );
        }
        return next;
      });
    },
    [
      audioAnalysis,
      directorReady,
      imageAnalysis,
      lastProposal,
      learningProfile,
      messages,
      patchApplied,
      schedulePersist,
      sunoPasteLyrics,
      sunoPasteStyle,
    ],
  );

  useEffect(() => {
    const allowE2E =
      typeof window !== "undefined" &&
      (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_E2E_HOOKS === "1");
    if (!allowE2E) return undefined;

    const onSeed = (event) => {
      const production = event?.detail?.production;
      const workflow = event?.detail?.workflow || {};
      setProductionState(mergeProductionSession({ production: null }, production || {}).production);
      if (workflow.patchApplied) setPatchApplied(true);
      if (workflow.directorReady) setDirectorReady(true);
    };

    window.addEventListener("e2e:seed-production", onSeed);
    window.__videoPrepAgentE2E = {
      seedProduction: (production, workflow = {}) => {
        window.dispatchEvent(
          new CustomEvent("e2e:seed-production", { detail: { production, workflow } }),
        );
      },
    };
    return () => window.removeEventListener("e2e:seed-production", onSeed);
  }, []);

  const appendProductionMessage = useCallback(
    (content, extra = {}) => {
      const msg = {
        role: "assistant",
        content,
        ts: Date.now(),
        production: true,
        ...extra,
      };
      persistState({ messages: [...messages, msg] });
      return msg;
    },
    [messages, persistState],
  );

  const buildProductionProject = useCallback(
    () => ({
      idea: projectContext?.idea,
      selectedGenres: projectContext?.selectedGenres,
      selectedRhythms: projectContext?.selectedRhythms,
      selectedSounds: projectContext?.selectedSounds,
      mood: projectContext?.mood,
      rules: projectContext?.rules,
      structure: projectContext?.structure,
      vocal: projectContext?.vocal,
      lyricTheme: projectContext?.lyricTheme,
      lyricStructure: projectContext?.lyricStructure,
      generatedLyrics: projectContext?.generatedLyrics,
      imageAnalysis,
      tempo: projectContext?.tempo,
    }),
    [imageAnalysis, projectContext],
  );

  const resolveAudioBufferForProduction = useCallback(async () => {
    if (!audioAnalysis) return null;
    const resolved = await resolveAudioCacheBlob(audioAnalysis);
    if (resolved?.blob) {
      return resolved.blob.arrayBuffer();
    }
    return null;
  }, [audioAnalysis]);

  const recordLearnApply = useCallback(
    (actionIds, proposal) => {
      const next = mergeLearningProfile(learningProfile, {
        type: "apply",
        actionIds,
        patch: proposal?.patch,
        directorPatch: proposal?.directorSettingsPatch,
        workflowIntent: proposal?.workflowIntent?.intent,
      });
      persistState({ learningProfile: next });
      return next;
    },
    [learningProfile, persistState],
  );

  const checkAgentProductionReadiness = useCallback(async () => {
    const result = await checkProductionReadiness({
      coProducerLlmSettings,
      directorSettings: loadDirectorSettingsFromStorage(),
    });
    if (result.ready) {
      setStatusWithTime("Ready to produce — Setup Hub OK for local MP4");
      appendProductionMessage(
        "Setup Hub check passed — Python, pipeline, and models are ready. Use **Produce video** to render.",
      );
    } else {
      const blocker = result.blockers?.[0] || result.error || "Not ready";
      setStatusWithTime(`Production blocked: ${blocker}`, "warning");
      appendProductionMessage(
        `Not ready to render yet: ${blocker}\n\nOpen Setup Hub to fix missing tools, then try again.`,
        { hints: result.hints },
      );
    }
    return result;
  }, [appendProductionMessage, coProducerLlmSettings, setStatusWithTime]);

  const runAgentFullProduction = useCallback(async () => {
    if (busy) return;
    if (!patchApplied && !directorReady) {
      setStatusWithTime("Apply agent plan first (Apply all recommended)");
      return;
    }

    setBusy(true);
    updateProduction({ phase: "validating", lastError: null });

    try {
      let imagePayload = null;
      if (loadDirectorSettingsFromStorage().useI2vWhenImage !== false && imageAnalysis) {
        imagePayload = await readImageSourceForOpenSora?.();
      }
      const audioBuffer = await resolveAudioBufferForProduction();

      appendProductionMessage("Starting full production pipeline…");

      const result = await runFullProduction({
        project: buildProductionProject(),
        imagePayload,
        audioAnalysis,
        audioBuffer,
        coProducerLlmSettings,
        onPhase: (phase) => updateProduction({ phase }),
        onProgress: (progress) => {
          if (!progress || typeof progress !== "object") return;
          const { phase: progressPhase, ...rest } = progress;
          updateProduction({
            ...(progressPhase ? { phase: progressPhase } : {}),
            ...rest,
          });
        },
        onMessage: (message) => {
          if (message) appendProductionMessage(message);
        },
      });

      if (result.launch?.ok && result.launch.logPath) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent(VIDEO_BUILD_START_EVENT, {
              detail: {
                result: result.launch,
                opts: { title: "Agent production render" },
              },
            }),
          );
        } else {
          trackLaunchBuildProgress(() => {}, result.launch, {
            title: "Agent production render",
          });
        }
      }

      if (!result.ok) {
        updateProduction({
          phase: "failed",
          lastError: result.error,
          logPath: result.logPath || result.launch?.logPath || null,
        });
        appendProductionMessage(
          `Production failed: ${result.error}${result.hints?.length ? "\n\n→ Open Setup Hub to fix dependencies." : ""}`,
          { hints: result.hints, failed: true },
        );
        setStatusWithTime(result.error || "Production failed", "warning");
        return result;
      }

      updateProduction({
        phase: "done",
        lastOutputPath: result.outputPath,
        assembledOutputPath: result.assembly?.path || result.outputPath,
        logPath: result.launch?.logPath || null,
        multiClipNote: result.multiClipNote || null,
        multiClip: Boolean(result.multiClip),
        clipTotal: result.clipPaths?.length || 0,
        clipsRendered: result.clipPaths?.length || 0,
        clipStatus: result.multiClip ? "done" : null,
        clipLabel: result.multiClip ? "Music video assembly complete" : null,
      });

      const outputName = result.outputPath?.split(/[/\\]/).pop() || "output.mp4";
      appendProductionMessage(
        `Finished — **${outputName}**${result.multiClipNote ? `\n\nNote: ${result.multiClipNote}` : ""}`,
        {
          outputPath: result.outputPath,
          revealable: true,
        },
      );
      setStatusWithTime(`Production complete — ${outputName}`);
      recordLearnApply(["runFullProduction"], lastProposal);
      return result;
    } catch (err) {
      const message = err?.message || String(err);
      updateProduction({ phase: "failed", lastError: message });
      appendProductionMessage(`Production error: ${message}`, { failed: true });
      setStatusWithTime(message, "warning");
      return { ok: false, error: message };
    } finally {
      setBusy(false);
    }
  }, [
    appendProductionMessage,
    audioAnalysis,
    buildProductionProject,
    busy,
    coProducerLlmSettings,
    directorReady,
    imageAnalysis,
    lastProposal,
    patchApplied,
    readImageSourceForOpenSora,
    recordLearnApply,
    resolveAudioBufferForProduction,
    setStatusWithTime,
    updateProduction,
  ]);

  const revealAgentProductionOutput = useCallback(async () => {
    const target = productionState?.assembledOutputPath || productionState?.lastOutputPath;
    if (!target) {
      setStatusWithTime("No finished video yet — run Produce video first");
      return { ok: false };
    }
    const res = await revealProductionOutput(target);
    if (!res?.ok) setStatusWithTime(res?.error || "Could not reveal output", "warning");
    return res;
  }, [productionState, setStatusWithTime]);

  const dismissWorkflowSuggestion = useCallback(
    (suggestionId) => {
      const next = mergeLearningProfile(learningProfile, {
        type: "dismiss",
        suggestionId,
      });
      persistState({ learningProfile: next });
      setStatusWithTime("Suggestion dismissed — agent will bias away locally");
    },
    [learningProfile, persistState, setStatusWithTime],
  );

  const actionHandlers = useMemo(
    () => ({
      patch,
      captureSnapshot,
      saveDirectorSettings: saveDirectorSettingsToStorage,
      applyAudioToMusicVideo,
      applySunoPasteToMusicVideo,
      applyMusicVideoFromBoth,
      applyAudioVisualMusicVideo,
      runGpuWorkflow,
      generateLyrics,
    }),
    [
      applyAudioToMusicVideo,
      applyAudioVisualMusicVideo,
      applyMusicVideoFromBoth,
      applySunoPasteToMusicVideo,
      captureSnapshot,
      generateLyrics,
      patch,
      runGpuWorkflow,
    ],
  );

  const attachAgentFiles = useCallback(
    async (fileList) => {
      const files = Array.from(fileList || []);
      if (!files.length) return;

      setAttachBusy(true);
      try {
        for (const file of files) {
          if (isSupportedAudioFile(file)) {
            await analyzeAudioFile?.(file);
          } else if (isSupportedImageFile(file)) {
            await analyzeImageFile?.(file);
          } else {
            setStatusWithTime("Attach WAV/MP3 audio or PNG/JPG images only");
          }
        }
        const phase = detectWorkflowPhase({
          audioAnalysis,
          imageAnalysis,
          sunoPasteStyle,
          sunoPasteLyrics,
          messages,
          lastProposal,
          patchApplied,
        });
        const tips = buildWorkflowSuggestions(phase, prepContext, learningProfile);
        if (tips[0]) {
          setStatusWithTime(`Upload analyzed — try: ${tips[0].label}`);
        }
      } finally {
        setAttachBusy(false);
      }
    },
    [
      analyzeAudioFile,
      analyzeImageFile,
      audioAnalysis,
      imageAnalysis,
      lastProposal,
      learningProfile,
      messages,
      patchApplied,
      prepContext,
      setStatusWithTime,
      sunoPasteLyrics,
      sunoPasteStyle,
    ],
  );

  const sendAgentMessage = useCallback(async () => {
    const text = draft.trim();
    if (!text || busy) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const chips = buildAnalysisChips(audioAnalysis, imageAnalysis);
    const userMsg = {
      role: "user",
      content: text,
      ts: Date.now(),
      chips,
    };
    const nextHistory = [...messages, userMsg];
    persistState({ messages: nextHistory });
    setDraft("");
    setBusy(true);

    try {
      let result;
      if (isCoProducerLlmReady(coProducerLlmSettings)) {
        const llmMessages = buildVideoPrepAgentLlmMessages(
          messages,
          text,
          prepContext,
          learningProfile,
        );
        result = await sendVideoPrepAgentRequest(llmMessages, coProducerLlmSettings, {
          signal: controller.signal,
        });
      } else {
        result = videoPrepHeuristic(text, prepContext);
      }
      result = enrichAgentProposal(result, prepContext, text);

      const assistantMsg = {
        role: "assistant",
        content: result.assistantReply,
        ts: Date.now(),
        preview: result.directorPromptPreview,
        suggestedActions: result.suggestedActions,
        nextSteps: result.nextSteps,
        workflowIntent: result.workflowIntent,
        whatsNext: result.whatsNext,
      };
      persistState({ messages: [...nextHistory, assistantMsg], lastProposal: result });
      setStatusWithTime("Video Prep Agent ready — Apply project or Apply all");
    } catch (err) {
      const fallback = enrichAgentProposal(videoPrepHeuristic(text, prepContext), prepContext, text);
      const proposal = {
        ...fallback,
        assistantReply: `LLM error: ${err.message}. Using local prep instead.\n\n${fallback.assistantReply}`,
      };
      persistState({
        messages: [
          ...nextHistory,
          {
            role: "assistant",
            content: proposal.assistantReply,
            ts: Date.now(),
            suggestedActions: fallback.suggestedActions,
            nextSteps: fallback.nextSteps,
            workflowIntent: fallback.workflowIntent,
            whatsNext: fallback.whatsNext,
          },
        ],
        lastProposal: proposal,
      });
      setStatusWithTime("Video prep parsed locally after LLM error", "warning");
    } finally {
      setBusy(false);
    }
  }, [
    audioAnalysis,
    busy,
    coProducerLlmSettings,
    draft,
    imageAnalysis,
    learningProfile,
    messages,
    persistState,
    prepContext,
    setStatusWithTime,
  ]);

  const applyAgentToProject = useCallback(async () => {
    if (!lastProposal?.patch) {
      setStatusWithTime("Send a message to the Video Prep Agent first");
      return;
    }
    captureSnapshot("before video prep apply");
    patch(lastProposal.patch);
    if (lastProposal.directorSettingsPatch) {
      saveDirectorSettingsToStorage({
        ...loadDirectorSettingsFromStorage(),
        ...lastProposal.directorSettingsPatch,
      });
    }
    recordLearnApply(["patchProject"], lastProposal);
    persistState({ patchApplied: true });
    setStatusWithTime("Video Prep Agent applied to project — open Director");
  }, [captureSnapshot, lastProposal, patch, persistState, recordLearnApply, setStatusWithTime]);

  const applyAllAgentActions = useCallback(async () => {
    if (!lastProposal) {
      setStatusWithTime("Send a message to the Video Prep Agent first");
      return;
    }
    const { ok, results } = await dispatchAgentActions(lastProposal, actionHandlers, {
      snapshotLabel: "before video prep apply all",
      runSuggested: true,
    });
    if (!ok) {
      setStatusWithTime("Nothing to apply");
      return;
    }
    const actionIds = results.filter((r) => r.ok).map((r) => r.id);
    recordLearnApply(actionIds, lastProposal);
    persistState({ patchApplied: true, directorReady: true });
    scrollToDirectorPanelAfterApply();
    const failed = results.filter((r) => r.ok === false);
    if (failed.length) {
      setStatusWithTime(`Applied with errors: ${failed.map((f) => f.id).join(", ")}`, "warning");
    } else {
      setStatusWithTime("Video Prep Agent applied all — Director ready");
    }
  }, [actionHandlers, lastProposal, persistState, recordLearnApply, setStatusWithTime]);

  const runAgentSuggestion = useCallback(
    async (suggestion) => {
      if (suggestion?.destructive && typeof window !== "undefined") {
        const ok = window.confirm(`${suggestion.label}? This updates project fields.`);
        if (!ok) return;
      }
      await runWorkflowSuggestion(suggestion, {
        focusAttach: () => fileInputRef.current?.click(),
        focusInput: () => textareaRef.current?.focus(),
        applyAll: applyAllAgentActions,
        applyProject: applyAgentToProject,
        runGpuWorkflow,
        applyAudioVisualMusicVideo,
        applyMusicVideoFromBoth,
        runFullProduction: runAgentFullProduction,
        checkProductionReadiness: checkAgentProductionReadiness,
        revealProductionOutput: revealAgentProductionOutput,
      });
    },
    [
      applyAgentToProject,
      applyAllAgentActions,
      applyAudioVisualMusicVideo,
      applyMusicVideoFromBoth,
      checkAgentProductionReadiness,
      revealAgentProductionOutput,
      runAgentFullProduction,
      runGpuWorkflow,
    ],
  );

  const runAgentNextStep = useCallback(
    async (step) => {
      if (step?.priority === "primary" && step?.actionId === "applyAll") {
        const ok =
          typeof window === "undefined" ||
          window.confirm(`${step.title}? This updates project fields.`);
        if (!ok) return;
      }
      await runNextStep(step, {
        focusAttach: () => fileInputRef.current?.click(),
        focusInput: () => textareaRef.current?.focus(),
        applyAll: applyAllAgentActions,
        applyProject: applyAgentToProject,
        runGpuWorkflow,
        applyAudioVisualMusicVideo,
        applyMusicVideoFromBoth,
        runFullProduction: runAgentFullProduction,
        checkProductionReadiness: checkAgentProductionReadiness,
        revealProductionOutput: revealAgentProductionOutput,
      });
    },
    [
      applyAgentToProject,
      applyAllAgentActions,
      applyAudioVisualMusicVideo,
      applyMusicVideoFromBoth,
      checkAgentProductionReadiness,
      revealAgentProductionOutput,
      runAgentFullProduction,
      runGpuWorkflow,
    ],
  );

  const clearAgentChat = useCallback(() => {
    abortRef.current?.abort();
    persistState({ messages: [], lastProposal: null, patchApplied: false, directorReady: false });
    setDraft("");
    setStatusWithTime("Video Prep Agent chat cleared");
  }, [persistState, setStatusWithTime]);

  const agentRemembers =
    sessionLoaded &&
    (messages.length > 0 ||
      Boolean(learningProfile?.acceptedActions && Object.keys(learningProfile.acceptedActions).length));

  return {
    agentBusy: busy,
    agentAttachBusy: attachBusy,
    agentDraft: draft,
    agentMessages: messages,
    agentProposal: lastProposal,
    agentAnalysisChips: analysisChips,
    agentFileAccept: `${SUPPORTED_AUDIO_ACCEPT},${SUPPORTED_IMAGE_ACCEPT}`,
    focusAgentAttach: () => fileInputRef.current?.click(),
    focusAgentInput: () => textareaRef.current?.focus(),
    agentSessionLoaded: sessionLoaded,
    agentSessionSource: sessionSource,
    agentSessionPath: sessionPath,
    agentRemembers,
    agentWorkflowPhase: workflowPhase,
    agentWorkflowChecklist: workflowChecklist,
    agentWorkflowSuggestions: workflowSuggestions,
    agentWhatsNext,
    agentLearningProfile: learningProfile,
    agentProductionPhase: productionState?.phase || "idle",
    agentProductionState: productionState,
    runAgentFullProduction,
    checkAgentProductionReadiness,
    revealAgentProductionOutput,
    setAgentDraft: setDraft,
    sendAgentMessage,
    attachAgentFiles,
    applyAgentToProject,
    applyAllAgentActions,
    runAgentSuggestion,
    runAgentNextStep,
    dismissAgentSuggestion: dismissWorkflowSuggestion,
    clearAgentChat,
    manuscriptBusy: busy,
    manuscriptDraft: draft,
    manuscriptMessages: messages,
    manuscriptProposal: lastProposal,
    setManuscriptDraft: setDraft,
    sendManuscriptMessage: sendAgentMessage,
    applyManuscriptToProject: applyAgentToProject,
    clearManuscriptChat: clearAgentChat,
  };
}
