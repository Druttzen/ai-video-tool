/** @param {number} seconds */
export function formatBuildCountdown(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  if (m > 0) return `${m}:${String(r).padStart(2, "0")}`;
  return `${s}s`;
}

/** @param {number|null|undefined} finishAtMs */
export function formatFinishTime(finishAtMs) {
  if (!finishAtMs || !Number.isFinite(finishAtMs)) return "—";
  return new Date(finishAtMs).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** @param {number} remainingSec */
export function computeFinishAtMs(remainingSec) {
  return Date.now() + Math.max(0, remainingSec) * 1000;
}
