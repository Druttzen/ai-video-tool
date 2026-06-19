import termsJson from "../../data/open-sora-terms.json";

/** @param {string[]} base @param {string[]} extra */
function uniqMerge(base, extra) {
  const seen = new Set(base.map((s) => s.toLowerCase()));
  const out = [...base];
  for (const item of extra || []) {
    const label = String(item).trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

/** Title-case Open-Sora snake terms for pill labels where helpful. */
function humanize(term) {
  if (/^[A-Z0-9]/.test(term) || term.includes("mm") || term.includes("/")) return term;
  return term.replace(/\b\w/g, (c) => c.toUpperCase());
}

const synced = termsJson || {};

export const openSoraSyncedAt = synced.syncedAt || null;
export const openSoraSourceRoot = synced.sourceRoot || "E:\\Open-Sora";

export const openSoraCameraMoves = (synced.cameraMoves || []).map(humanize);
export const openSoraLightingTerms = (synced.lightingTerms || []).map(humanize);
export const openSoraColorProfiles = synced.colorProfiles || [];
export const openSoraCameraPresets = synced.cameraPresets || [];
export const openSoraLensKits = synced.lensKits || [];
export const openSoraFilmFormats = synced.filmFormats || [];

export function mergeVisualOptions(base, syncedList) {
  return uniqMerge(base, syncedList);
}
