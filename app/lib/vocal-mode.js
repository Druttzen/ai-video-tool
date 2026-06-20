/** Video app silent / no-vocal mode (legacy imports may still say Instrumental). */
export const SILENT_VOCAL = "Silent visual";
export const LEGACY_INSTRUMENTAL_VOCAL = "Instrumental";

export function isSilentVocal(vocal) {
  return vocal === SILENT_VOCAL || vocal === LEGACY_INSTRUMENTAL_VOCAL;
}

export function hasLyricsVocal(vocal) {
  return Boolean(vocal) && !isSilentVocal(vocal);
}
