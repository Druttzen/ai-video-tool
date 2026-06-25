import { useCallback, useEffect, useMemo, useState } from "react";

function PillList({ items }: { items?: string[] }) {
  if (!items?.length) return <span className="empty">—</span>;
  return (
    <div className="pill-row">
      {items.map((item) => (
        <span key={item} className="pill">
          {item}
        </span>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function PathRow({
  label,
  path,
  onReveal,
}: {
  label: string;
  path?: string | null;
  onReveal?: (path: string) => void;
}) {
  if (!path) return null;
  return (
    <div className="path-row">
      <div className="path-row-label">{label}</div>
      <code className="path-row-value">{path}</code>
      {onReveal ? (
        <button type="button" className="action-btn action-btn-sm" onClick={() => onReveal(path)}>
          Reveal
        </button>
      ) : null}
    </div>
  );
}

function progressPercent(production?: CanvasProduction | null) {
  if (!production?.multiClip || !production.clipTotal) return 0;
  const total = Math.max(1, production.clipTotal);
  const rendered = production.clipsRendered ?? 0;
  if (production.clipStatus === "assembling" || production.phase === "done") return 100;
  if (production.clipStatus === "rendering") {
    return Math.min(99, Math.round(((rendered + 0.45) / total) * 100));
  }
  return Math.min(100, Math.round((rendered / total) * 100));
}

function ClipTimeline({ clipPlan }: { clipPlan: Array<{ start: number; end: number; label?: string }> }) {
  if (!clipPlan.length) return null;
  const maxEnd = Math.max(...clipPlan.map((c) => c.end), 1);
  return (
    <div className="timeline" data-testid="canvas-clip-timeline">
      {clipPlan.map((clip, index) => {
        const left = (clip.start / maxEnd) * 100;
        const width = Math.max(2, ((clip.end - clip.start) / maxEnd) * 100);
        return (
          <div
            key={`${clip.start}-${clip.end}-${index}`}
            className="timeline-segment"
            style={{ left: `${left}%`, width: `${width}%` }}
            title={`${clip.label ?? `Segment ${index + 1}`}: ${clip.start}s–${clip.end}s`}
          >
            <span>{clip.label ?? index + 1}</span>
          </div>
        );
      })}
    </div>
  );
}

function formatTimestamp(value?: number | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function App() {
  const [payload, setPayload] = useState<CanvasPayload | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [toolbarStatus, setToolbarStatus] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe = () => {};

    async function load() {
      if (!window.canvasAPI) return;
      const initial = await window.canvasAPI.getInitialPayload();
      if (initial) setPayload(initial);
      unsubscribe = window.canvasAPI.onPayload((next) => setPayload(next));

      const versionRes = await window.canvasAPI.getAppVersion();
      if (versionRes?.ok && versionRes.version) {
        setAppVersion(versionRes.version);
      }
    }

    void load();
    return () => unsubscribe();
  }, []);

  const revealPath = useCallback(async (filePath: string) => {
    if (!window.canvasAPI?.revealPath) return;
    const res = await window.canvasAPI.revealPath(filePath);
    if (!res?.ok) {
      setToolbarStatus(res?.error || "Could not reveal path");
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    if (!window.canvasAPI?.requestRefresh) return;
    setToolbarStatus(null);
    const res = await window.canvasAPI.requestRefresh();
    if (!res?.ok) {
      setToolbarStatus(res?.error || "Refresh failed");
      return;
    }
    setToolbarStatus("Refresh requested from main app");
  }, []);

  const handleExportJson = useCallback(() => {
    if (!payload) return;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `canvas-snapshot-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setToolbarStatus("JSON exported");
  }, [payload]);

  const handleCopySnapshot = useCallback(async () => {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setToolbarStatus("Snapshot copied to clipboard");
    } catch {
      setToolbarStatus("Clipboard copy failed");
    }
  }, [payload]);

  const handleRevealOutput = useCallback(() => {
    const outputPath = payload?.production?.assembledOutputPath || payload?.production?.lastOutputPath;
    if (outputPath) void revealPath(outputPath);
  }, [payload?.production?.assembledOutputPath, payload?.production?.lastOutputPath, revealPath]);

  const project = payload?.project;
  const handoff = payload?.handoff;
  const audio = handoff?.audioAnalysis;
  const image = handoff?.imageAnalysis;
  const clipPlan = audio?.beatSync?.clipPlan ?? [];
  const production = payload?.production;
  const pct = useMemo(() => progressPercent(production), [production]);
  const setupSummary = payload?.setup?.summary;
  const setupReady = setupSummary?.localRenderReady;
  const displayVersion = payload?.appVersion || appVersion;
  const hasOutputPath = Boolean(production?.assembledOutputPath || production?.lastOutputPath);

  return (
    <div className="app-shell">
      <header className="header">
        <div className="header-row">
          <div>
            <h1>{payload?.title ?? "AI Video Creator Canvas"}</h1>
            <p>
              {payload
                ? `Snapshot ${payload.exportedAt ? new Date(payload.exportedAt).toLocaleString() : "from desktop app"}`
                : "Open this canvas from the desktop app to inspect project, handoff, and production state."}
            </p>
          </div>
          {displayVersion ? <span className="version-badge">v{displayVersion}</span> : null}
        </div>
      </header>

      {payload ? (
        <div className="toolbar" data-testid="canvas-toolbar">
          <button type="button" className="action-btn" onClick={() => void handleRefresh()}>
            Refresh from app
          </button>
          <button type="button" className="action-btn" onClick={handleExportJson}>
            Export JSON
          </button>
          <button type="button" className="action-btn" onClick={() => void handleCopySnapshot()}>
            Copy snapshot
          </button>
          {hasOutputPath ? (
            <button type="button" className="action-btn action-btn-accent" onClick={handleRevealOutput}>
              Reveal output
            </button>
          ) : null}
          {toolbarStatus ? <span className="toolbar-status">{toolbarStatus}</span> : null}
        </div>
      ) : null}

      {!payload ? (
        <p className="empty">
          No payload yet. Use <code>Open Project Canvas</code> in the main app or run{" "}
          <code>npm run canvas:dev</code>.
        </p>
      ) : (
        <>
          {payload.buildIntent ? (
            <section className="card build-intent-card" data-testid="canvas-build-intent" style={{ marginBottom: 16 }}>
              <h2>Build plan</h2>
              <p style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600 }}>{payload.buildIntent.title}</p>
              <p className="stat-label">{payload.buildIntent.reasoning}</p>
              <div className="production-meta" style={{ marginTop: 10 }}>
                <span className="badge">{payload.buildIntent.buildTarget}</span>
                {payload.buildIntent.workflowPath ? (
                  <span>Path {payload.buildIntent.workflowPath}</span>
                ) : null}
                {payload.buildIntent.multiClip ? (
                  <span>{payload.buildIntent.clipCount} clips</span>
                ) : null}
                {payload.buildIntent.lipSync ? <span>lip-sync</span> : null}
              </div>
              {payload.buildIntent.directorBrief ? (
                <pre className="production-sub" style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
                  {payload.buildIntent.directorBrief}
                </pre>
              ) : null}
              {payload.buildIntent.canvasSummary ? (
                <p className="production-sub" style={{ marginTop: 8 }}>
                  {payload.buildIntent.canvasSummary}
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="grid" style={{ marginBottom: 16 }}>
            <article className="card">
              <h2>Audio</h2>
              {audio ? (
                <>
                  <Stat label="File" value={audio.fileName ?? "—"} />
                  <div style={{ marginTop: 12 }}>
                    <Stat label="BPM" value={audio.bpm ?? "—"} />
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <Stat label="Duration (s)" value={audio.durationSec ?? "—"} />
                  </div>
                  {audio.highlightStart != null || audio.highlightEnd != null ? (
                    <div className="stat-label" style={{ marginTop: 12 }}>
                      Highlight: {audio.highlightStart ?? "—"}s – {audio.highlightEnd ?? "—"}s
                    </div>
                  ) : null}
                  {audio.beatSync?.beatCount != null ? (
                    <div className="stat-label" style={{ marginTop: 8 }}>
                      Beats: {audio.beatSync.beatCount}
                      {audio.beatSync.onsetCount != null ? ` · onsets: ${audio.beatSync.onsetCount}` : ""}
                      {audio.beatSync.source ? ` · source: ${audio.beatSync.source}` : ""}
                      {audio.beatSync.vocalsLikely != null
                        ? ` · ${audio.beatSync.vocalsLikely ? "vocals likely" : "instrumental"}`
                        : ""}
                    </div>
                  ) : null}
                  {audio.sidecarImported ? (
                    <div className="badge ok" style={{ marginTop: 12 }}>
                      Sidecar cached
                    </div>
                  ) : null}
                </>
              ) : (
                <span className="empty">No audio analysis</span>
              )}
            </article>
            <article className="card">
              <h2>Director</h2>
              <div className="stat-label">Quality: {payload.directorSettings?.qualityPreset ?? "—"}</div>
              <div className="stat-label">Aspect: {payload.directorSettings?.aspectRatio ?? "—"}</div>
              <div className="stat-label">Wan model: {payload.directorSettings?.wanModelId ?? "—"}</div>
              <div className="stat-label">Duration: {payload.directorSettings?.durationSeconds ?? "—"}s</div>
              <div className="stat-label" style={{ marginTop: 8 }}>
                Engine: {payload.directorSettings?.localRenderEngine ?? "—"}
              </div>
              <div className="stat-label">Backend: {payload.directorSettings?.renderBackend ?? "—"}</div>
              <div className="stat-label">
                Frames: {payload.directorSettings?.numFrames ?? "—"} @ {payload.directorSettings?.fps ?? 24} fps
              </div>
            </article>
            <article className="card">
              <h2>Setup Hub</h2>
              <div className="stat-value" style={{ fontSize: 16 }}>
                {setupSummary?.label ?? "Not scanned"}
              </div>
              {setupSummary ? (
                <div className="stat-label" style={{ marginTop: 8 }}>
                  {setupSummary.ready ?? 0}/{setupSummary.total ?? 0} modules ready
                  {setupSummary.optionalReady != null ? ` · ${setupSummary.optionalReady} optional` : ""}
                </div>
              ) : null}
              <div className={`badge ${setupReady ? "ok" : "warn"}`} style={{ marginTop: 8 }}>
                {setupReady ? "Render stack ready" : "Check Setup Hub"}
              </div>
            </article>
          </section>

          {production ? (
            <section className="card production-card" data-testid="canvas-production-card" style={{ marginBottom: 16 }}>
              <h2>Production</h2>
              <div className="production-meta">
                <span className="badge">{production.phase ?? "idle"}</span>
                {production.multiClip ? (
                  <span>
                    {production.clipsRendered ?? 0}/{production.clipTotal ?? 0} clips
                    {production.clipCurrent ? ` · active ${production.clipCurrent}/${production.clipTotal}` : ""}
                  </span>
                ) : null}
                {production.clipPlannedTotal ? (
                  <span> · planned {production.clipPlannedTotal}</span>
                ) : null}
              </div>
              {production.multiClip ? (
                <div className="progress-bar" data-testid="canvas-production-progress">
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>
              ) : null}
              {production.clipLabel ? <p className="production-label">{production.clipLabel}</p> : null}
              {production.clipIndex != null && production.clipIndex > 0 ? (
                <p className="production-sub">
                  Clip {production.clipIndex}
                  {production.clipStart != null && production.clipEnd != null
                    ? ` · ${production.clipStart}s–${production.clipEnd}s`
                    : ""}
                  {production.clipDuration != null ? ` (${production.clipDuration}s)` : ""}
                </p>
              ) : null}
              {production.renderMessage ? <p className="production-sub">{production.renderMessage}</p> : null}
              {production.multiClipNote ? <p className="production-sub">{production.multiClipNote}</p> : null}
              {production.renderPythonSource ? (
                <p className="production-sub">Python source: {production.renderPythonSource}</p>
              ) : null}
              {production.updatedAt ? (
                <p className="production-sub">Updated: {formatTimestamp(production.updatedAt)}</p>
              ) : null}
              {production.lastError ? <p className="production-error">{production.lastError}</p> : null}
            </section>
          ) : null}

          {clipPlan.length > 0 ? (
            <section className="card" style={{ marginBottom: 16 }}>
              <h2>Beat-sync timeline</h2>
              <ClipTimeline clipPlan={clipPlan} />
              <table className="table" style={{ marginTop: 12 }}>
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Start (s)</th>
                    <th>End (s)</th>
                    <th>Duration (s)</th>
                  </tr>
                </thead>
                <tbody>
                  {clipPlan.map((clip, index) => (
                    <tr key={`${clip.start}-${clip.end}-${index}`}>
                      <td>{clip.label ?? `Segment ${index + 1}`}</td>
                      <td>{clip.start}</td>
                      <td>{clip.end}</td>
                      <td>{(clip.end - clip.start).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          <section className="grid" style={{ marginBottom: 16 }}>
            <article className="card">
              <h2>Project idea</h2>
              <p style={{ margin: 0, fontSize: 14 }}>{project?.idea ?? "—"}</p>
              {project?.structure ? <p className="production-sub">{project.structure}</p> : null}
            </article>
            <article className="card">
              <h2>Tempo &amp; rhythms</h2>
              <div className="stat-label">Tempo: {project?.tempo ?? "—"}</div>
              <div style={{ marginTop: 10 }}>
                <div className="stat-label">Rhythms</div>
                <PillList items={project?.selectedRhythms} />
              </div>
            </article>
            <article className="card">
              <h2>Sounds &amp; genres</h2>
              <div className="stat-label">Sounds</div>
              <PillList items={project?.selectedSounds} />
              <div style={{ marginTop: 10 }}>
                <div className="stat-label">Genres</div>
                <PillList items={project?.selectedGenres} />
              </div>
            </article>
            <article className="card">
              <h2>Image cues</h2>
              {image?.visualMood ? (
                <div className="stat-label" style={{ marginBottom: 8 }}>
                  {image.visualMood}
                  {image.hueLabel ? ` · ${image.hueLabel}` : ""}
                  {image.aspectLabel ? ` · ${image.aspectLabel}` : ""}
                  {image.colorTemperature ? ` · ${image.colorTemperature}` : ""}
                </div>
              ) : null}
              <div className="stat-label">Suggested rhythms</div>
              <PillList items={image?.suggestedRhythms} />
              <div style={{ marginTop: 10 }}>
                <div className="stat-label">Suggested genres</div>
                <PillList items={image?.suggestedGenres} />
              </div>
              <div style={{ marginTop: 10 }}>
                <div className="stat-label">Suggested sounds</div>
                <PillList items={image?.suggestedSounds} />
              </div>
            </article>
          </section>

          <section className="grid" style={{ marginBottom: 16 }}>
            <article className="card">
              <h2>Agent</h2>
              {payload.agentSummary ? (
                <>
                  <div className="stat-label">Phase: {payload.agentSummary.phase ?? "—"}</div>
                  <div className="stat-value" style={{ fontSize: 22, marginTop: 8 }}>
                    {payload.agentSummary.messageCount ?? 0}
                  </div>
                  <div className="stat-label">messages</div>
                </>
              ) : (
                <span className="empty">No agent session</span>
              )}
            </article>
            <article className="card">
              <h2>Co-producer</h2>
              {payload.coProducer ? (
                <>
                  <div className="stat-label">Provider: {payload.coProducer.provider ?? "—"}</div>
                  <div className="stat-label" style={{ marginTop: 8 }}>
                    Model: {payload.coProducer.model ?? "—"}
                  </div>
                </>
              ) : (
                <span className="empty">Not configured</span>
              )}
            </article>
            <article className="card">
              <h2>Handoff</h2>
              <div className="stat-label">Source: {handoff?.source ?? "—"}</div>
              <div className="stat-label">Intent: {handoff?.intent ?? "—"}</div>
            </article>
          </section>

          {(production?.lastOutputPath || production?.assembledOutputPath || production?.logPath) ? (
            <section className="card" style={{ marginBottom: 16 }} data-testid="canvas-output-paths">
              <h2>Output paths</h2>
              <PathRow label="Last output" path={production?.lastOutputPath} onReveal={(p) => void revealPath(p)} />
              <PathRow
                label="Assembled output"
                path={production?.assembledOutputPath}
                onReveal={(p) => void revealPath(p)}
              />
              <PathRow label="Log" path={production?.logPath} onReveal={(p) => void revealPath(p)} />
            </section>
          ) : null}

          {payload.setup?.modules?.length ? (
            <section className="card">
              <h2>Setup modules</h2>
              <div className="module-grid">
                {payload.setup.modules.map((mod) => (
                  <div key={mod.id} className={`module-chip status-${mod.status ?? "unknown"}`}>
                    <strong>{mod.id}</strong>
                    <span>{mod.status ?? "—"}</span>
                    {mod.message ? <span className="module-message">{mod.message}</span> : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

