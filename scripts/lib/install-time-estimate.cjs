/**
 * Local + EST timestamps and install duration estimates for addon installer UI.
 */

const PIP_STACK_ETA_MIN = 40;
const FULL_INSTALL_ETA_MIN = 55;

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Local wall-clock time (installer machine timezone). */
function formatLocalDateTime(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** Eastern time with zone label (EST/EDT). */
function formatEstDateTime(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  })
    .format(d)
    .replace(",", "");
}

function estimateFinishAt({ pipOnly = false, fromDate = new Date(), durationMin } = {}) {
  const start = fromDate instanceof Date ? fromDate : new Date(fromDate);
  const minutes = Number.isFinite(durationMin)
    ? durationMin
    : pipOnly
      ? PIP_STACK_ETA_MIN
      : FULL_INSTALL_ETA_MIN;
  return new Date(start.getTime() + minutes * 60 * 1000);
}

function buildEtaUserMessage(finishAt, { pipOnly = false } = {}) {
  const local = formatLocalDateTime(finishAt);
  const est = formatEstDateTime(finishAt);
  const scope = pipOnly ? "pip stack (torch ~2–4 GB)" : "full addon install";
  return `Estimated finish for ${scope}: ${local} local / ${est}`;
}

function isOnlyPipStackMissingIds(missingIds) {
  const ids = Array.isArray(missingIds) ? missingIds : [];
  if (!ids.length) return false;
  return ids.every((id) => id === "pip-deps" || id === "music-video-sync");
}

module.exports = {
  PIP_STACK_ETA_MIN,
  FULL_INSTALL_ETA_MIN,
  buildEtaUserMessage,
  estimateFinishAt,
  formatEstDateTime,
  formatLocalDateTime,
  isOnlyPipStackMissingIds,
};
