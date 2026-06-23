#!/usr/bin/env python3
"""Director local render — Hugging Face Diffusers + Wan 2.1 T2V."""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

DEFAULT_MODEL = os.environ.get("WAN_MODEL_ID", "Wan-AI/Wan2.1-T2V-1.3B-Diffusers")
VIDEO_EXTS = {".mp4", ".mov", ".webm", ".mkv"}


def aspect_to_size(aspect: str) -> tuple[int, int]:
    key = str(aspect or "16:9").strip()
    mapping = {
        "16:9": (832, 480),
        "9:16": (480, 832),
        "1:1": (512, 512),
        "21:9": (960, 416),
    }
    return mapping.get(key, mapping["16:9"])


def clamp_frames(num_frames: int) -> int:
    # Wan 1.3B is happiest with modest clip lengths on consumer VRAM.
    return max(17, min(int(num_frames or 49), 81))


def stage_output(job_path: Path, video_path: Path, job: dict) -> Path | None:
    if not video_path.is_file():
        return None
    output = job.get("output") or {}
    container = str(output.get("container") or "mp4").lstrip(".")
    dest = job_path.parent / f"{job_path.stem}-output.{container}"
    dest.write_bytes(video_path.read_bytes())
    return dest


def run_wan(job: dict, job_path: Path) -> int:
    import torch

    model_id = str(job.get("wanModelId") or job.get("modelId") or DEFAULT_MODEL).strip()
    prompt = str(job.get("prompt") or "").strip()
    if not prompt:
        print("Job prompt is empty", file=sys.stderr)
        return 5

    seed = int(job.get("seed") or 0) or int(time.time()) % 10_000_000
    num_frames = clamp_frames(job.get("numFrames") or 49)
    num_steps = max(10, min(int(job.get("numSteps") or 30), 50))
    guidance = float(job.get("cfg") or 6.0)
    width, height = aspect_to_size(job.get("aspectRatio"))
    fps = max(8, min(int(job.get("fps") or 16), 24))
    save_dir = Path(job.get("saveDir") or job_path.parent / "wan-outputs")
    save_dir.mkdir(parents=True, exist_ok=True)

    print("=== AI Video Creator · Director · Diffusers Wan ===", flush=True)
    print(f"Model: {model_id}", flush=True)
    print(f"Frames: {num_frames} · Steps: {num_steps} · {width}x{height} · seed {seed}", flush=True)
    print("[BUILD_PROGRESS] 10 Loading Wan pipeline", flush=True)

    try:
        from diffusers import AutoencoderKLWan, WanPipeline
        from diffusers.utils import export_to_video
    except ImportError as exc:
        print(f"diffusers Wan pipeline unavailable: {exc}", file=sys.stderr)
        print("Install: pip install 'diffusers>=0.32.0' accelerate transformers", file=sys.stderr)
        return 6

    if not torch.cuda.is_available():
        print("CUDA GPU required for Wan local render", file=sys.stderr)
        return 7

    dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    pipe = WanPipeline.from_pretrained(model_id, torch_dtype=dtype)
    if hasattr(pipe, "enable_sequential_cpu_offload"):
        pipe.enable_sequential_cpu_offload()
    else:
        pipe.enable_model_cpu_offload()
    if hasattr(pipe, "enable_attention_slicing"):
        pipe.enable_attention_slicing()
    if hasattr(pipe, "enable_vae_slicing"):
        pipe.enable_vae_slicing()
    pipe.set_progress_bar_config(disable=False)

    generator = torch.Generator(device="cuda").manual_seed(seed)
    print("[BUILD_PROGRESS] 40 Sampling", flush=True)
    result = pipe(
        prompt=prompt,
        negative_prompt=str(job.get("negativePrompt") or "blurry, low quality, watermark"),
        width=width,
        height=height,
        num_frames=num_frames,
        num_inference_steps=num_steps,
        guidance_scale=guidance,
        generator=generator,
    )
    frames = result.frames[0]
    out_file = save_dir / f"wan-{seed}.mp4"
    export_to_video(frames, str(out_file), fps=fps)
    print("[BUILD_PROGRESS] 95 Encoding complete", flush=True)

    staged = stage_output(job_path, out_file, job)
    if staged:
        print(f"[OUTPUT_VIDEO] {staged}", flush=True)
    print("[BUILD_PROGRESS] 100 Render complete", flush=True)
    return 0


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: run-diffusers-wan-job.py <job.json>", file=sys.stderr)
        return 2

    job_path = Path(sys.argv[1]).resolve()
    if not job_path.is_file():
        print(f"Job file not found: {job_path}", file=sys.stderr)
        return 2

    with job_path.open(encoding="utf-8") as f:
        job = json.load(f)

    try:
        return run_wan(job, job_path)
    except Exception as exc:
        print(f"Wan render failed: {exc}", file=sys.stderr)
        print("[BUILD_PROGRESS] 99 Render failed", flush=True)
        return 8


if __name__ == "__main__":
    raise SystemExit(main())
