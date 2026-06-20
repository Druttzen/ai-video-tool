#!/usr/bin/env python3
"""Run an Open-Sora job exported from AI Video Creator (job JSON)."""
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
from opensora_inference_support import opensora_inference_argv, opensora_subprocess_env

VIDEO_EXTS = {".mp4", ".mov", ".webm", ".mkv", ".gif"}


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
        print("Usage: run-open-sora-job.py <job.json>", file=sys.stderr)
        return 2

    job_path = Path(sys.argv[1]).resolve()
    if not job_path.is_file():
        print(f"Job file not found: {job_path}", file=sys.stderr)
        return 2

    with job_path.open(encoding="utf-8") as f:
        job = json.load(f)

    install_raw = str(job.get("installPath") or "").strip()
    if not install_raw:
        print("Job installPath is required (managed addon path or OPEN_SORA_ROOT)", file=sys.stderr)
        return 3

    install = Path(install_raw).expanduser()
    if not install.is_dir():
        print(f"Open-Sora install not found: {install}", file=sys.stderr)
        return 3

    os.chdir(install)

    config_path = job.get("configPath") or "configs/diffusion/inference/t2i2v_256px.py"
    if not Path(config_path).is_file():
        print(f"Inference config not found: {install / config_path}", file=sys.stderr)
        return 4

    prompt = job.get("prompt") or ""
    if not prompt.strip():
        print("Job prompt is empty", file=sys.stderr)
        return 5

    seed = int(job.get("seed") or 0)
    if seed <= 0:
        seed = int(time.time()) % 10_000_000

    num_steps = int(job.get("numSteps") or job.get("steps") or 50)
    num_frames = int(job.get("numFrames") or 129)
    cfg = float(job.get("cfg") or 7.5)
    aspect_ratio = job.get("aspectRatio") or "16:9"
    resolution_tier = job.get("resolutionTier") or "256px"
    fps = int(job.get("fps") or 24)
    save_dir = job.get("save_dir") or "outputs"
    motion_score = job.get("motionScore")
    if motion_score is None:
        extra = job.get("extra_options") or {}
        motion_score = extra.get("motion_score", 4)

    inference_args = [
        "scripts/diffusion/inference.py",
        config_path,
        "--save-dir",
        save_dir,
        "--prompt",
        prompt,
        "--seed",
        str(seed),
        "--aspect_ratio",
        aspect_ratio,
        "--resolution",
        resolution_tier,
        "--sampling_option.num_steps",
        str(num_steps),
        "--sampling_option.num_frames",
        str(num_frames),
        "--sampling_option.guidance",
        str(cfg),
        "--motion-score",
        str(motion_score),
        "--fps_save",
        str(fps),
    ]

    if job.get("ref_image"):
        inference_args.extend(["--cond_type", job.get("cond_type") or "i2v_head", "--ref", job["ref_image"]])

    if job.get("refinePrompt"):
        inference_args.append("--refine-prompt")

    if job.get("offload", True):
        inference_args.extend(["--offload", "True"])

    python = job.get("pythonPath") or sys.executable
    cmd = opensora_inference_argv(python, inference_args)

    print("=== AI Video Creator → Open-Sora 2.0 ===")
    print(f"Install: {install}")
    print(f"Config: {config_path}")
    print(f"Prompt: {prompt[:120]}...")
    if job.get("ref_image"):
        print(f"I2V ref: {job['ref_image']}")

    try:
        subprocess_env = opensora_subprocess_env(python)
        result = subprocess.run(cmd, cwd=install, text=True, env=subprocess_env)
    except Exception as e:
        print(f"Pipeline launch failed: {e}", file=sys.stderr)
        return 6

    if result.returncode == 0:
        staged = stage_output_video(job_path, install, job)
        if staged:
            print(f"[OUTPUT_VIDEO] {staged}", flush=True)

    return 0 if result.returncode == 0 else result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
