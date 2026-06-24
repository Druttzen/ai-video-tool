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

# Align Wan output sizes with Director resolution tiers (data/director-output-settings.json).
TIER_ASPECT_SIZES: dict[str, dict[str, tuple[int, int]]] = {
    "256px": {
        "16:9": (640, 360),
        "9:16": (360, 640),
        "1:1": (512, 512),
        "21:9": (640, 274),
    },
    "384px": {
        "16:9": (854, 480),
        "9:16": (480, 854),
        "1:1": (512, 512),
        "21:9": (854, 366),
    },
    "512px": {
        "16:9": (896, 512),
        "9:16": (512, 896),
        "1:1": (512, 512),
        "21:9": (960, 416),
    },
    "768px": {
        "16:9": (1280, 720),
        "9:16": (720, 1280),
        "1:1": (720, 720),
        "21:9": (1280, 544),
    },
    "1024px": {
        "16:9": (1280, 720),
        "9:16": (720, 1280),
        "1:1": (1080, 1080),
        "21:9": (1280, 544),
    },
}


def align_wan_dims(width: int, height: int) -> tuple[int, int]:
    """Wan requires height and width divisible by 16."""
    def align(n: int) -> int:
        return max(16, (int(n) // 16) * 16)

    return align(width), align(height)


def aspect_to_size(aspect: str) -> tuple[int, int]:
    key = str(aspect or "16:9").strip()
    mapping = TIER_ASPECT_SIZES["512px"]
    return mapping.get(key, mapping["16:9"])


def resolve_wan_size(job: dict) -> tuple[int, int]:
    output = job.get("output") or {}
    width = job.get("width") or output.get("width")
    height = job.get("height") or output.get("height")
    if width and height:
        return align_wan_dims(int(width), int(height))

    tier = str(job.get("resolutionTier") or job.get("resolution") or "512px").strip()
    aspect = str(job.get("aspectRatio") or "16:9").strip()
    tier_map = TIER_ASPECT_SIZES.get(tier) or TIER_ASPECT_SIZES["512px"]
    w, h = tier_map.get(aspect, tier_map["16:9"])
    return align_wan_dims(w, h)


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
    num_steps = max(8, min(int(job.get("numSteps") or 30), 50))
    guidance = float(job.get("cfg") or 6.0)
    width, height = resolve_wan_size(job)
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

    # float16 is more stable than bfloat16 on some Windows CUDA stacks.
    use_bf16 = torch.cuda.is_bf16_supported() and sys.platform != "win32"
    dtype = torch.bfloat16 if use_bf16 else torch.float16
    os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
    os.environ.setdefault("DIFFUSERS_ATTN_BACKEND", "native")
    pipe = WanPipeline.from_pretrained(model_id, torch_dtype=dtype)

    pixel_budget = width * height * num_frames
    smoke_budget = 640 * 360 * 33
    force_cuda = bool(job.get("forceCuda")) or pixel_budget <= smoke_budget
    if force_cuda:
        pipe.to("cuda")
        generator_device = "cuda"
    else:
        if hasattr(pipe, "enable_sequential_cpu_offload"):
            pipe.enable_sequential_cpu_offload()
        else:
            pipe.enable_model_cpu_offload()
        generator_device = "cpu"
        if hasattr(pipe, "enable_attention_slicing"):
            pipe.enable_attention_slicing()
        if hasattr(pipe, "enable_vae_slicing"):
            pipe.enable_vae_slicing()
    pipe.set_progress_bar_config(disable=False)

    generator = torch.Generator(device=generator_device).manual_seed(seed)
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
