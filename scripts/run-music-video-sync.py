#!/usr/bin/env python3
"""Librosa beat/onset analysis for music video sync (managed addon)."""
from __future__ import annotations

import argparse
import json
import sys


def build_clip_plan(beat_times: list[float], range_start: float, range_end: float) -> list[dict]:
    beats = [t for t in beat_times if range_start <= t <= range_end]
    if len(beats) < 2:
        return []

    min_sec = 4.0
    max_sec = 8.0
    clips: list[dict] = []
    i = 0
    while i < len(beats) - 1:
        start = beats[i]
        j = i + 1
        while j < len(beats) and beats[j] - start < min_sec:
            j += 1
        if j >= len(beats):
            break
        end_idx = j
        while end_idx + 1 < len(beats) and beats[end_idx + 1] - start <= max_sec:
            end_idx += 1
        end = beats[end_idx]
        if end - start >= min_sec * 0.75:
            clips.append(
                {
                    "start": round(start, 3),
                    "end": round(end, 3),
                    "duration": round(end - start, 3),
                }
            )
        i = end_idx
    return clips


def main() -> int:
    parser = argparse.ArgumentParser(description="Analyze beats for music video sync")
    parser.add_argument("--audio", required=True, help="Path to audio file")
    parser.add_argument("--range-start", type=float, default=0.0)
    parser.add_argument("--range-end", type=float, default=-1.0)
    args = parser.parse_args()

    try:
        import librosa
        import numpy as np
    except ImportError as exc:
        print(json.dumps({"ok": False, "error": f"librosa import failed: {exc}"}))
        return 1

    try:
        y, sr = librosa.load(args.audio, sr=None, mono=True)
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"audio load failed: {exc}"}))
        return 1

    duration = float(len(y)) / float(sr)
    range_start = max(0.0, float(args.range_start))
    range_end = duration if args.range_end < 0 else min(duration, float(args.range_end))
    if range_end <= range_start:
        range_start, range_end = 0.0, duration

    start_sample = int(range_start * sr)
    end_sample = max(start_sample + 1, int(range_end * sr))
    segment = y[start_sample:end_sample]
    seg_dur = float(len(segment)) / float(sr)

    tempo = 120.0
    beat_times: list[float] = []
    try:
        tempo_est, beat_frames = librosa.beat.beat_track(y=segment, sr=sr)
        tempo = float(tempo_est[0] if isinstance(tempo_est, np.ndarray) else tempo_est)
        beat_times = [
            round(float(t) + range_start, 4)
            for t in librosa.frames_to_time(beat_frames, sr=sr)
        ]
    except Exception:
        try:
            tempo_arr = librosa.feature.rhythm.tempo(y=segment, sr=sr)
            tempo = float(tempo_arr[0] if len(tempo_arr) else 120.0)
        except Exception:
            tempo = 120.0

    onset_times: list[float] = []
    try:
        onset_env = librosa.onset.onset_strength(y=segment, sr=sr)
        onset_frames = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr, backtrack=True)
        onset_times = [
            round(float(t) + range_start, 4)
            for t in librosa.frames_to_time(onset_frames, sr=sr)
        ][:240]
    except Exception:
        onset_times = []

    if len(beat_times) < 2 and tempo > 0:
        interval = 60.0 / tempo
        beat_times = []
        t = range_start
        while t <= range_end + 0.001:
            beat_times.append(round(t, 4))
            t += interval

    clip_plan = build_clip_plan(beat_times, range_start, range_end)

    print(
        json.dumps(
            {
                "ok": True,
                "source": "librosa",
                "duration": round(duration, 3),
                "rangeStart": round(range_start, 3),
                "rangeEnd": round(range_end, 3),
                "segmentDuration": round(seg_dur, 3),
                "bpm": round(tempo, 2),
                "beatTimes": beat_times,
                "onsetTimes": onset_times,
                "beatCount": len(beat_times),
                "clipPlan": clip_plan,
            }
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # pragma: no cover
        print(json.dumps({"ok": False, "error": str(exc)}))
        raise SystemExit(1) from exc
