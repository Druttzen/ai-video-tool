#!/usr/bin/env python3
"""Run a Director Engine job from AI Video Creator (optional local GPU backend)."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
from opensora_inference_support import (
    opensora_inference_argv,
    opensora_subprocess_env,
    opensora_wsl_inference_extras,
)

VIDEO_EXTS = {".mp4", ".mov", ".webm", ".mkv", ".gif"}

RESOLUTION_CONFIG = {
    "256px": "configs/diffusion/inference/t2i2v_256px.py",
    "384px": "configs/diffusion/inference/t2i2v_256px.py",
    "512px": "configs/diffusion/inference/t2i2v_512px.py",
    "768px": "configs/diffusion/inference/t2i2v_768px.py",
    "1024px": "configs/diffusion/inference/t2i2v_768px.py",
}


def resolve_config_path(pipeline_root: Path, job: dict) -> str:
    explicit = job.get("configPath")
    if explicit and (pipeline_root / explicit).is_file():
        return explicit
    tier = job.get("resolutionTier") or job.get("resolution") or "512px"
    candidate = RESOLUTION_CONFIG.get(tier, RESOLUTION_CONFIG["512px"])
    if (pipeline_root / candidate).is_file():
        return candidate
    fallback = "configs/diffusion/inference/t2i2v_256px.py"
    if (pipeline_root / fallback).is_file():
        return fallback
    legacy = pipeline_root / "scripts" / "diffusion" / "inference.py"
    if legacy.is_file():
        return str(legacy.relative_to(pipeline_root))
    return candidate


def find_newest_video(root: Path) -> Path | None:
    if not root.is_dir():
        return None
    candidates = [
        path
        for path in root.rglob("*")
        if path.is_file() and path.suffix.lower() in VIDEO_EXTS
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda path: path.stat().st_mtime)


def stage_output_video(job_path: Path, pipeline_root: Path, job: dict) -> Path | None:
    outputs_dir = pipeline_root / "outputs"
    search_root = outputs_dir if outputs_dir.is_dir() else pipeline_root
    source = find_newest_video(search_root)
    if not source:
        return None

    output = job.get("output") or {}
    container = str(output.get("container") or source.suffix.lstrip(".") or "mp4").lstrip(".")
    dest = job_path.parent / f"{job_path.stem}-output.{container}"
    shutil.copy2(source, dest)
    return dest


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: run-director-job.py <job.json>", file=sys.stderr)
        return 2

    job_path = Path(sys.argv[1]).resolve()
    with job_path.open(encoding="utf-8") as f:
        job = json.load(f)

    pipeline_root = Path(job.get("localPipelinePath") or "").expanduser()
    if not pipeline_root.is_dir():
        print("No local pipeline configured — export-only mode.", file=sys.stderr)
        print(json.dumps(job, indent=2))
        return 0

    os.chdir(pipeline_root)

    config_path = resolve_config_path(pipeline_root, job)
    if not Path(config_path).is_file():
        print(f"No compatible inference config in {pipeline_root}", file=sys.stderr)
        return 4

    prompt = job.get("prompt") or ""
    seed = int(job.get("seed") or 0) or int(time.time()) % 10_000_000
    python = job.get("pythonPath") or sys.executable
    resolution_tier = job.get("resolutionTier") or job.get("resolution") or "512px"

    inference_args = [
        "scripts/diffusion/inference.py",
        config_path,
        "--save-dir",
        "outputs",
        "--prompt",
        prompt,
        "--seed",
        str(seed),
        "--aspect_ratio",
        job.get("aspectRatio") or "16:9",
        "--resolution",
        resolution_tier,
        "--sampling_option.num_steps",
        str(int(job.get("numSteps") or 40)),
        "--sampling_option.num_frames",
        str(int(job.get("numFrames") or 129)),
        "--sampling_option.guidance",
        str(float(job.get("cfg") or 7.5)),
        "--motion-score",
        str(job.get("motionScore") or 4),
        "--fps_save",
        str(int(job.get("fps") or 24)),
    ]

    if job.get("ref_image"):
        inference_args.extend(["--cond_type", "i2v_head", "--ref", job["ref_image"]])

    if job.get("offload", True):
        inference_args.extend(["--offload_model", "True"])

    inference_args.extend(opensora_wsl_inference_extras(python))

    cmd = opensora_inference_argv(python, inference_args)

    print("=== AI Video Creator · Director Engine · local render ===")
    print(f"Resolution: {resolution_tier} · Config: {config_path}", flush=True)
    if job.get("hardwareTier"):
        print(f"Hardware tier: {job['hardwareTier']}", flush=True)
    if job.get("estimatedBuildSeconds"):
        print(f"Estimated build: ~{job['estimatedBuildSeconds']}s", flush=True)
    output = job.get("output") or {}
    if output.get("width") and output.get("height"):
        print(
            f"Output target: {output['width']}×{output['height']} · {output.get('fps', 24)} fps · "
            f"{output.get('videoBitrateMbps', 8)} Mbit/s · {output.get('videoCodec', 'h264')}",
            flush=True,
        )
    gfx = job.get("graphicsStack") or {}
    if gfx.get("graphicsApi") or gfx.get("computeBackend"):
        print(
            f"Graphics API: {gfx.get('graphicsApi', 'auto')} · Compute: {gfx.get('computeBackend', 'auto')}",
            flush=True,
        )
    stack_env = gfx.get("env") or job.get("graphicsEnv") or {}
    subprocess_env = opensora_subprocess_env(python)
    for key, value in stack_env.items():
        if value is not None and str(value) != "":
            subprocess_env[str(key)] = str(value)
    if subprocess_env.get("PYTHONPATH") != os.environ.get("PYTHONPATH"):
        print("[BUILD_PROGRESS] 5 Pipeline starting (optional GPU deps stubbed)", flush=True)
    else:
        print("[BUILD_PROGRESS] 5 Pipeline starting", flush=True)

    result = subprocess.run(cmd, cwd=pipeline_root, env=subprocess_env)
    if result.returncode == 0:
        staged = stage_output_video(job_path, pipeline_root, job)
        if staged:
            print(f"[OUTPUT_VIDEO] {staged}", flush=True)
        print("[BUILD_PROGRESS] 100 Render complete", flush=True)
    else:
        print(f"[BUILD_PROGRESS] 99 Render failed (code {result.returncode})", flush=True)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
