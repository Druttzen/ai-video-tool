#!/usr/bin/env python3
"""Run a Director Engine job from AI Video Creator (optional local GPU backend)."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

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

    cmd = [
        python,
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
        cmd.extend(["--cond_type", "i2v_head", "--ref", job["ref_image"]])

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
    for key, value in stack_env.items():
        if value is not None and str(value) != "":
            os.environ[str(key)] = str(value)
    print("[BUILD_PROGRESS] 5 Pipeline starting", flush=True)

    result = subprocess.run(cmd, cwd=pipeline_root)
    if result.returncode == 0:
        print("[BUILD_PROGRESS] 100 Render complete", flush=True)
    else:
        print(f"[BUILD_PROGRESS] 99 Render failed (code {result.returncode})", flush=True)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
