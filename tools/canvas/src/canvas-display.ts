export type CanvasProductionLike = {
  multiClip?: boolean;
  clipTotal?: number;
  clipsRendered?: number;
  clipStatus?: string;
  phase?: string;
};

export function progressPercent(production?: CanvasProductionLike | null) {
  if (!production?.multiClip || !production.clipTotal) return 0;
  const total = Math.max(1, production.clipTotal);
  const rendered = production.clipsRendered ?? 0;
  if (production.clipStatus === "assembling" || production.phase === "done") return 100;
  if (production.clipStatus === "rendering") {
    return Math.min(99, Math.round(((rendered + 0.45) / total) * 100));
  }
  return Math.min(100, Math.round((rendered / total) * 100));
}

export function formatTimestamp(value?: number | null) {
  if (value == null) return "—";
  return new Date(value).toLocaleString();
}

export function hasCanvasOutputPath(production?: {
  assembledOutputPath?: string | null;
  lastOutputPath?: string | null;
} | null) {
  return Boolean(production?.assembledOutputPath || production?.lastOutputPath);
}

export function buildIntentBadges(intent?: {
  buildTarget?: string;
  workflowPath?: number;
  multiClip?: boolean;
  clipCount?: number;
  lipSync?: boolean;
} | null) {
  if (!intent) return [];
  const badges: string[] = [];
  if (intent.buildTarget) badges.push(intent.buildTarget);
  if (intent.workflowPath) badges.push(`Path ${intent.workflowPath}`);
  if (intent.multiClip && intent.clipCount) badges.push(`${intent.clipCount} clips`);
  if (intent.lipSync) badges.push("lip-sync");
  return badges;
}
