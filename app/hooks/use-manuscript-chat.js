"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isCoProducerLlmReady } from "../lib/co-producer-llm";
import {
  buildManuscriptChatLlmMessages,
  loadManuscriptChatHistory,
  manuscriptToVideoHeuristic,
  saveManuscriptChatHistory,
  sendManuscriptChatRequest,
} from "../lib/manuscript-video-chat";

/**
 * Manuscript AI chat — freeform brief → video project patch.
 * @param {object} opts
 */
export function useManuscriptChat({
  coProducerLlmSettings,
  patch,
  captureSnapshot,
  setStatusWithTime,
  projectContext,
}) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastProposal, setLastProposal] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    setMessages(loadManuscriptChatHistory());
  }, []);

  const persist = useCallback((next) => {
    setMessages(next);
    saveManuscriptChatHistory(next);
  }, []);

  const sendManuscriptMessage = useCallback(async () => {
    const text = draft.trim();
    if (!text || busy) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMsg = { role: "user", content: text, ts: Date.now() };
    const nextHistory = [...messages, userMsg];
    persist(nextHistory);
    setDraft("");
    setBusy(true);

    try {
      let result;
      if (isCoProducerLlmReady(coProducerLlmSettings)) {
        const llmMessages = buildManuscriptChatLlmMessages(messages, text, projectContext);
        result = await sendManuscriptChatRequest(llmMessages, coProducerLlmSettings, {
          signal: controller.signal,
        });
      } else {
        const patchProposal = manuscriptToVideoHeuristic(text);
        result = {
          assistantReply:
            "Parsed your manuscript locally (enable Co-Producer LLM in settings for richer AI). Review and apply below.",
          directorPromptPreview: patchProposal.idea || "",
          patch: patchProposal,
        };
      }

      const assistantMsg = {
        role: "assistant",
        content: result.assistantReply,
        ts: Date.now(),
        preview: result.directorPromptPreview,
      };
      persist([...nextHistory, assistantMsg]);
      setLastProposal(result);
      setStatusWithTime("Manuscript → video concept ready — Apply to project when happy");
    } catch (err) {
      const fallback = manuscriptToVideoHeuristic(text);
      setLastProposal({
        assistantReply: `LLM error: ${err.message}. Using local parser instead.`,
        directorPromptPreview: fallback.idea,
        patch: fallback,
      });
      persist([
        ...nextHistory,
        {
          role: "assistant",
          content: `Could not reach LLM (${err.message}). Local draft ready — apply below.`,
          ts: Date.now(),
        },
      ]);
      setStatusWithTime("Manuscript parsed locally after LLM error", "warning");
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    coProducerLlmSettings,
    draft,
    messages,
    persist,
    projectContext,
    setStatusWithTime,
  ]);

  const applyManuscriptToProject = useCallback(() => {
    if (!lastProposal?.patch) {
      setStatusWithTime("Send a manuscript message first");
      return;
    }
    captureSnapshot("before manuscript apply");
    patch(lastProposal.patch);
    setStatusWithTime("Manuscript applied to video project — open Director tab");
  }, [captureSnapshot, lastProposal, patch, setStatusWithTime]);

  const clearManuscriptChat = useCallback(() => {
    abortRef.current?.abort();
    persist([]);
    setLastProposal(null);
    setDraft("");
    setStatusWithTime("Manuscript chat cleared");
  }, [persist, setStatusWithTime]);

  return {
    manuscriptBusy: busy,
    manuscriptDraft: draft,
    manuscriptMessages: messages,
    manuscriptProposal: lastProposal,
    setManuscriptDraft: setDraft,
    sendManuscriptMessage,
    applyManuscriptToProject,
    clearManuscriptChat,
  };
}
