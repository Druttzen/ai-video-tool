import { useEffect, useMemo, useState } from "react";

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

export default function App() {
  const [payload, setPayload] = useState<CanvasPayload | null>(null);

  useEffect(() => {
    let unsubscribe = () => {};

    async function load() {
      if (!window.canvasAPI) return;
      const initial = await window.canvasAPI.getInitialPayload();
      if (initial) setPayload(initial);
      unsubscribe = window.canvasAPI.onPayload((next) => setPayload(next));
    }

    void load();
    return () => unsubscribe();
  }, []);

  const project = payload?.project;
  const handoff = payload?.handoff;
  const audio = handoff?.audioAnalysis;
  const clipPlan = audio?.beatSync?.clipPlan ?? [];
  const production = payload?.production;
  const pct = useMemo(() => progressPercent(production), [production]);
  const setupReady = payload?.setup?.summary?.localRenderReady;

  return (
    <div className="app-shell">
      <header className="header">
        <h1>{payload?.title ?? "AI Video Creator Canvas"}</h1>
        <p>
          {payload
            ? `Snapshot ${payload.exportedAt ? new Date(payload.exportedAt).toLocaleString() : "from desktop app"}`
            : "Open this canvas from the desktop app to inspect project, handoff, and production state."}
        </p>
      </header>

      {!payload ? (
        <p className="empty">
          No payload yet. Use <code>Open Project Canvas</code> in the main app or run{" "}
          <code>npm run canvas:dev</code>.
        </p>
      ) : (
        <>
          <section className="grid" style={{ marginBottom: 16 }}>
            <article className="card">
              <h2>Audio</h2>
              {audio ? (
                <>
                  <Stat label="BPM" value={audio.bpm ?? "—"} />
                  <div style={{ marginTop: 12 }}>
                    <Stat label="Duration (s)" value={audio.durationSec ?? "—"} />
                  </div>
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
              <div className="stat-label">Engine: {payload.directorSettings?.localRenderEngine ?? "—"}</div>
              <div className="stat-label">Backend: {payload.directorSettings?.renderBackend ?? "—"}</div>
              <div className="stat-label">
                Frames: {payload.directorSettings?.numFrames ?? "—"} @ {payload.directorSettings?.fps ?? 24} fps
              </div>
            </article>
            <article className="card">
              <h2>Setup Hub</h2>
              <div className="stat-value" style={{ fontSize: 16 }}>
                {payload.setup?.summary?.label ?? "Not scanned"}
              </div>
              <div className={`badge ${setupReady ? "ok" : "warn"}`} style={{ marginTop: 8 }}>
                {setupReady ? "Render stack ready" : "Check Setup Hub"}
              </div>
            </article>
          </section>

          {production?.multiClip || production?.phase === "rendering" || production?.phase === "assembled" ? (
            <section className="card production-card" data-testid="canvas-production-card">
              <h2>Production</h2>
              <div className="production-meta">
                <span className="badge">{production.phase ?? "idle"}</span>
                {production.multiClip ? (
                  <span>
                    {production.clipsRendered ?? 0}/{production.clipTotal ?? 0} clips
                    {production.clipCurrent ? ` · active ${production.clipCurrent}/${production.clipTotal}` : ""}
                  </span>
                ) : null}
              </div>
              {production.multiClip ? (
                <div className="progress-bar" data-testid="canvas-production-progress">
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>
              ) : null}
              {production.clipLabel ? <p className="production-label">{production.clipLabel}</p> : null}
              {production.renderMessage ? <p className="production-sub">{production.renderMessage}</p> : null}
              {production.lastError ? <p className="production-error">{production.lastError}</p> : null}
            </section>
          ) : null}

          {clipPlan.length > 0 ? (
            <section className="card" style={{ marginTop: 16 }}>
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

          <section className="grid" style={{ marginTop: 16 }}>
            <article className="card">
              <h2>Project idea</h2>
              <p style={{ margin: 0, fontSize: 14 }}>{project?.idea ?? "—"}</p>
              {project?.structure ? <p className="production-sub">{project.structure}</p> : null}
            </article>
            <article className="card">
              <h2>Genres</h2>
              <PillList items={project?.selectedGenres} />
            </article>
            <article className="card">
              <h2>Image cues</h2>
              <PillList items={handoff?.imageAnalysis?.suggestedGenres} />
              <PillList items={handoff?.imageAnalysis?.suggestedSounds} />
            </article>
            <article className="card">
              <h2>Handoff</h2>
              <div className="stat-label">Source: {handoff?.source ?? "—"}</div>
              <div className="stat-label">Intent: {handoff?.intent ?? "—"}</div>
            </article>
          </section>

          {payload.setup?.modules?.length ? (
            <section className="card" style={{ marginTop: 16 }}>
              <h2>Setup modules</h2>
              <div className="module-grid">
                {payload.setup.modules.map((mod) => (
                  <div key={mod.id} className={`module-chip status-${mod.status ?? "unknown"}`}>
                    <strong>{mod.id}</strong>
                    <span>{mod.status ?? "—"}</span>
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
