#!/usr/bin/env python3
"""Run an Open-Sora job exported from AI Video Creator (job JSON)."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path


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

    install = Path(job.get("installPath") or "E:\\Open-Sora")
    if not install.is_dir():
        print(f"Open-Sora install not found: {install}", file=sys.stderr)
        return 3

    os.chdir(install)
    sys.path.insert(0, str(install))

    try:
        from opensora_pipeline import OpenSoraConfig, run_opensora_job
    except ImportError as e:
        print(f"Failed to import opensora_pipeline from {install}: {e}", file=sys.stderr)
        return 4

    extra = dict(job.get("extra_options") or {})
    if job.get("cond_type") and job.get("ref_image"):
        extra["cond_type"] = job["cond_type"]
        extra["ref"] = job["ref_image"]

    seed = int(job.get("seed") or 0)
    if seed <= 0:
        import time

        seed = int(time.time()) % 10_000_000

    cfg = OpenSoraConfig(
        prompt=job["prompt"],
        steps=int(job.get("steps") or 16),
        cfg=float(job.get("cfg") or 7.5),
        seed=seed,
        resolution=job.get("resolution") or "640x360",
        device=job.get("device") or "cuda",
        save_dir=job.get("save_dir") or "outputs",
        fps=int(job.get("fps") or 16),
        extra_options=extra,
        diagnostic=bool(job.get("diagnostic")),
        silent=bool(job.get("silent")),
    )

    print(f"=== AI Video Creator → Open-Sora ===")
    print(f"Install: {install}")
    print(f"Prompt: {cfg.prompt[:120]}...")
    if job.get("ref_image"):
        print(f"I2V ref: {job['ref_image']}")

    log_text, video_path = run_opensora_job(cfg)
    print(log_text)
    if video_path:
        print(f"VIDEO:{video_path}")
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
