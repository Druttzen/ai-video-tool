#!/usr/bin/env python3
"""Patch Open-Sora prepare_models for WSL 12GB GPUs. Idempotent."""
from __future__ import annotations

import sys
from pathlib import Path

MARKER = "# ai-video-tool WSL_LOW_VRAM"
MODEL_DEVICE_OLD = """    model_device = (
        "cpu" if offload_model and cfg.get("img_flux", None) is not None else device
    )"""
MODEL_DEVICE_NEW = """    flux_device = "cpu" if os.environ.get("WSL_LOW_VRAM") else device
    model_device = (
        "cpu"
        if os.environ.get("WSL_LOW_VRAM")
        or (offload_model and cfg.get("img_flux", None) is not None)
        else device
    )"""
T5_OLD = "    model_t5 = build_module(cfg.t5, MODELS, device_map=device, torch_dtype=dtype).eval()"
T5_NEW = f"""{MARKER}
    embed_device = "cpu" if os.environ.get("WSL_LOW_VRAM") else device
    model_t5 = build_module(cfg.t5, MODELS, device_map=embed_device, torch_dtype=dtype).eval()"""
CLIP_OLD = "        cfg.clip, MODELS, device_map=device, torch_dtype=dtype"
CLIP_NEW = "        cfg.clip, MODELS, device_map=embed_device, torch_dtype=dtype"
FLUX_OLD = """        model_img_flux = build_module(
            cfg.img_flux, MODELS, device_map=device, torch_dtype=dtype
        ).eval()
        model_ae_img_flux = build_module(
            cfg.img_flux_ae, MODELS, device_map=device, torch_dtype=dtype
        ).eval()"""
FLUX_NEW = """        model_img_flux = build_module(
            cfg.img_flux, MODELS, device_map=flux_device, torch_dtype=dtype
        ).eval()
        model_ae_img_flux = build_module(
            cfg.img_flux_ae, MODELS, device_map=flux_device, torch_dtype=dtype
        ).eval()"""


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: wsl-patch-open-sora-low-vram.py <open-sora-root>", file=sys.stderr)
        return 2
    sampling = Path(sys.argv[1]) / "opensora" / "utils" / "sampling.py"
    if not sampling.is_file():
        print(f"Missing {sampling}", file=sys.stderr)
        return 1
    text = sampling.read_text(encoding="utf-8")
    changed = False
    if MODEL_DEVICE_OLD in text:
        text = text.replace(MODEL_DEVICE_OLD, MODEL_DEVICE_NEW, 1)
        changed = True
    elif "flux_device" not in text:
        print("model_device block not found; manual patch required", file=sys.stderr)
        return 1
    if MARKER not in text and T5_OLD in text:
        text = text.replace(T5_OLD, T5_NEW, 1)
        changed = True
    if CLIP_OLD in text:
        text = text.replace(CLIP_OLD, CLIP_NEW, 1)
        changed = True
    if FLUX_OLD in text:
        text = text.replace(FLUX_OLD, FLUX_NEW, 1)
        changed = True
    if not changed:
        print(f"Already patched: {sampling}")
        return 0
    sampling.write_text(text, encoding="utf-8", newline="\n")
    print(f"Patched {sampling}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
