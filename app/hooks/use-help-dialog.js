"use client";

import { useCallback, useState } from "react";

/**
 * Help dialog state for workspace.
 */
export function useHelpDialog() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpTopic, setHelpTopic] = useState("global");

  const openHelp = useCallback((topic = "global") => {
    setHelpTopic(topic);
    setHelpOpen(true);
  }, []);

  const closeHelp = useCallback(() => {
    setHelpOpen(false);
  }, []);

  return { helpOpen, helpTopic, openHelp, closeHelp };
}
