"use client";

import { assembleMusicVideoFromHost, isElectronApp } from "./electron-bridge";

/**
 * Concat rendered clip MP4s and mux with the source audio track (desktop + FFmpeg).
 * @param {{ clipPaths: string[], audioPath: string, outputPath: string }} params
 */
export async function assembleMusicVideoClips(params) {
  if (!isElectronApp()) {
    return { ok: false, error: "Music video assembly requires the desktop app" };
  }
  return assembleMusicVideoFromHost(params);
}
