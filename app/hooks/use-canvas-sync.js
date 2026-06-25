"use client";

import { useCallback, useEffect, useRef } from "react";
import { buildCanvasPayloadFromWorkspace } from "../lib/canvas-payload";
import { isElectronApp, onCanvasRefreshRequest, pushCanvasUpdate } from "../lib/electron-bridge";
import { APP_VERSION } from "../lib/video-config";

/**
 * Live-sync canvas dashboard when production state changes or canvas requests refresh.
 * @param {object} syncInput — workspace fields used to build the canvas payload
 */
export function useCanvasSync(syncInput) {
  const syncInputRef = useRef(syncInput);

  useEffect(() => {
    syncInputRef.current = syncInput;
  }, [syncInput]);

  const pushUpdate = useCallback(() => {
    if (!isElectronApp()) return;
    const input = syncInputRef.current;
    const payload = buildCanvasPayloadFromWorkspace({
      ...input,
      appVersion: APP_VERSION,
    });
    void pushCanvasUpdate(payload);
  }, []);

  useEffect(() => {
    if (!isElectronApp()) return;
    return onCanvasRefreshRequest(() => {
      pushUpdate();
    });
  }, [pushUpdate]);

  useEffect(() => {
    if (!isElectronApp()) return;
    const timer = setTimeout(pushUpdate, 300);
    return () => clearTimeout(timer);
  }, [syncInput.agentProductionState, pushUpdate]);
}
