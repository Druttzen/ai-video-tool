"use client";

import { VideoBuildProvider } from "./context/video-build-context";

export function AppProviders({ children }) {
  return <VideoBuildProvider>{children}</VideoBuildProvider>;
}
