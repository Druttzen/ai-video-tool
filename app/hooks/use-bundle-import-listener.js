"use client";

import { useEffect } from "react";
import { isElectronApp } from "../lib/electron-bridge";

/**
 * Desktop: import bundle when opened via file association or aivideo:// handoff.
 */
export function useBundleImportListener(importProjectBundleFromPath) {
  useEffect(() => {
    if (!isElectronApp() || typeof importProjectBundleFromPath !== "function") return undefined;

    const api = window.electronAPI;
    const onPending = (payload) => {
      const bundlePath = payload?.path;
      if (bundlePath) importProjectBundleFromPath(bundlePath);
    };

    const unsubPending = api.onPendingBundleImport?.(onPending);
    api.consumePendingBundleImport?.().then((res) => {
      if (res?.path) importProjectBundleFromPath(res.path);
    });

    return () => {
      if (typeof unsubPending === "function") unsubPending();
    };
  }, [importProjectBundleFromPath]);
}
