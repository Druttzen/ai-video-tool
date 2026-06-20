"use client";

import { memo, useMemo } from "react";
import {
  applyOutputPreset,
  applyOutputResolution,
  filterResolutionsByAspect,
  formatOutputSettingsSummary,
  getOutputAudioBitrateOptions,
  getOutputAudioCodecs,
  getOutputBitrateOptions,
  getOutputContainers,
  getOutputDurationPresets,
  getOutputFpsOptions,
  getOutputPresets,
  getOutputResolutions,
  getOutputVideoCodecs,
  normalizePxLabel,
} from "../lib/director-output-settings";

const selectClass =
  "mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-2 text-sm text-white outline-none focus:border-cyan-300/50";

export const DirectorOutputSettingsPanel = memo(function DirectorOutputSettingsPanel({
  settings,
  onChange,
  filterByAspect = true,
  renderBackend = "export",
}) {
  const presets = getOutputPresets();
  const resolutions = useMemo(
    () =>
      filterByAspect
        ? filterResolutionsByAspect(settings.aspectRatio)
        : getOutputResolutions(),
    [filterByAspect, settings.aspectRatio],
  );

  const currentPx =
    settings.outputResolution ||
    (settings.outputWidth && settings.outputHeight
      ? `${settings.outputWidth}×${settings.outputHeight}`
      : "896×512");

  const matchRes = resolutions.find(
    (r) =>
      normalizePxLabel(`${r.width}×${r.height}`) === normalizePxLabel(currentPx) ||
      r.id === settings.outputResolutionId,
  );

  return (
    <div
      className="space-y-3 rounded-2xl border border-cyan-300/15 bg-cyan-500/5 p-4"
      data-testid="director-output-settings"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-200/70">
            Output settings
          </div>
          <p className="mt-1 text-[11px] text-white/50">{formatOutputSettingsSummary(settings)}</p>
          {renderBackend === "export" ? (
            <p className="mt-2 text-[10px] leading-relaxed text-amber-200/70">
              These encoding settings are saved in the job JSON. To get an MP4 file, switch Output mode to
              Local GPU render and set a pipeline folder under Advanced.
            </p>
          ) : (
            <p className="mt-2 text-[10px] leading-relaxed text-emerald-200/70">
              Local GPU render uses these settings when your pipeline finishes — output is copied next to the
              job JSON after render.
            </p>
          )}
        </div>
      </div>

      <label className="block text-xs">
        <span className="text-white/45">Quick preset</span>
        <select
          value={settings.outputPreset || ""}
          onChange={(e) => {
            const key = e.target.value;
            if (!key) {
              onChange({ ...settings, outputPreset: null });
              return;
            }
            onChange(applyOutputPreset(settings, key));
          }}
          className={selectClass}
        >
          <option value="">Custom settings</option>
          {Object.entries(presets).map(([key, p]) => (
            <option key={key} value={key}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-xs">
          <span className="text-white/45">Resolution (px × px)</span>
          <select
            value={matchRes?.id || settings.outputResolutionId || ""}
            onChange={(e) => onChange(applyOutputResolution(settings, e.target.value))}
            data-testid="output-resolution"
            className={selectClass}
          >
            {!matchRes && currentPx ? (
              <option value="">{currentPx} (custom)</option>
            ) : null}
            {resolutions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs">
          <span className="text-white/45">Aspect ratio</span>
          <select
            value={settings.aspectRatio}
            onChange={(e) => onChange({ ...settings, aspectRatio: e.target.value, outputPreset: null })}
            className={selectClass}
          >
            {["16:9", "9:16", "1:1", "4:3", "21:9", "2.39:1", "1.85:1"].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs">
          <span className="text-white/45">Frame rate (fps)</span>
          <select
            value={String(settings.fps ?? 24)}
            onChange={(e) =>
              onChange({ ...settings, fps: Number(e.target.value), outputPreset: null })
            }
            data-testid="output-fps"
            className={selectClass}
          >
            {getOutputFpsOptions().map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs">
          <span className="text-white/45">Video bitrate (Mbit/s)</span>
          <select
            value={String(settings.bitrateMbps ?? 8)}
            onChange={(e) =>
              onChange({ ...settings, bitrateMbps: Number(e.target.value), outputPreset: null })
            }
            data-testid="output-bitrate"
            className={selectClass}
          >
            {getOutputBitrateOptions().map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs">
          <span className="text-white/45">Video codec</span>
          <select
            value={settings.videoCodec || "h264"}
            onChange={(e) =>
              onChange({ ...settings, videoCodec: e.target.value, outputPreset: null })
            }
            className={selectClass}
          >
            {getOutputVideoCodecs().map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs">
          <span className="text-white/45">Container</span>
          <select
            value={settings.container || "mp4"}
            onChange={(e) =>
              onChange({ ...settings, container: e.target.value, outputPreset: null })
            }
            className={selectClass}
          >
            {getOutputContainers().map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs">
          <span className="text-white/45">Duration</span>
          <select
            value={String(settings.durationSeconds ?? "10")}
            onChange={(e) =>
              onChange({ ...settings, durationSeconds: e.target.value, outputPreset: null })
            }
            className={selectClass}
          >
            {getOutputDurationPresets().map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs">
          <span className="text-white/45">Audio codec</span>
          <select
            value={settings.audioCodec || "aac"}
            onChange={(e) =>
              onChange({ ...settings, audioCodec: e.target.value, outputPreset: null })
            }
            className={selectClass}
          >
            {getOutputAudioCodecs().map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs">
          <span className="text-white/45">Audio bitrate (kbps)</span>
          <select
            value={String(settings.audioBitrateKbps ?? 192)}
            onChange={(e) =>
              onChange({
                ...settings,
                audioBitrateKbps: Number(e.target.value),
                outputPreset: null,
              })
            }
            className={selectClass}
          >
            {getOutputAudioBitrateOptions().map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
});
