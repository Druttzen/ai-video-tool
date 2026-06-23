"""GPU vendor selection mirror for install-addons-pip.py (see gpu-vendor.cjs)."""
from __future__ import annotations

import os
import platform
import re
import subprocess
from dataclasses import dataclass

GPU_VENDOR_ENV = "AI_VIDEO_GPU_VENDOR"
TORCH_CUDA_INDEX = "https://download.pytorch.org/whl/cu121"
TORCH_ROCM_INDEX = "https://download.pytorch.org/whl/rocm6.2"
TORCH_XPU_INDEX = "https://download.pytorch.org/whl/xpu"


def normalize_gpu_vendor_input(value: str | None) -> str | None:
    raw = str(value or "").strip().lower()
    if not raw or raw == "auto":
        return "auto"
    if raw in {"nvidia", "nvidia_gpu", "cuda"}:
        return "nvidia"
    if raw in {"amd", "radeon", "rocm"}:
        return "amd"
    if raw in {"intel", "arc", "xpu", "oneapi"}:
        return "intel"
    if raw in {"cpu", "none"}:
        return "cpu"
    return None


def gpu_vendor_from_gpu_name(name: str = "") -> str | None:
    n = name.lower()
    if re.search(r"nvidia|geforce|rtx|gtx|quadro", n):
        return "nvidia"
    if re.search(r"amd|radeon|rx ", n):
        return "amd"
    if re.search(r"intel|arc |iris", n):
        return "intel"
    return None


def _pick_vendor_from_names(names: list[str]) -> str:
    scored: list[tuple[int, str]] = []
    for name in names:
        vendor = gpu_vendor_from_gpu_name(name)
        if not vendor:
            continue
        priority = {"nvidia": 3, "amd": 2, "intel": 1}[vendor]
        discrete = 1 if re.search(
            r"nvidia|geforce|rtx|gtx|radeon|rx |arc |quadro", name, re.I
        ) and not re.search(r"microsoft basic|remote|virtual", name, re.I) else 0
        scored.append((priority * 1000 + discrete * 100, vendor))
    if not scored:
        return "cpu"
    scored.sort(reverse=True)
    return scored[0][1]


def _probe(cmd: list[str]) -> bool:
    try:
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8, check=True)
        return True
    except (OSError, subprocess.SubprocessError):
        return False


def _query_windows_gpu_names() -> list[str]:
    ps = (
        "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"
    )
    try:
        proc = subprocess.run(
            ["powershell.exe", "-NoProfile", "-Command", ps],
            capture_output=True,
            text=True,
            timeout=12,
            check=True,
        )
        return [line.strip() for line in proc.stdout.splitlines() if line.strip()]
    except (OSError, subprocess.SubprocessError):
        return []


def _query_linux_gpu_names() -> list[str]:
    try:
        proc = subprocess.run(["lspci"], capture_output=True, text=True, timeout=8, check=True)
        lines = [
            line.split(":", 1)[-1].strip()
            for line in proc.stdout.splitlines()
            if re.search(r"VGA|3D|Display", line, re.I)
        ]
        return lines
    except (OSError, subprocess.SubprocessError):
        return []


def detect_gpu_vendor() -> str:
    if _probe(["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"]):
        return "nvidia"

    sys_name = platform.system()
    if sys_name == "Windows":
        return _pick_vendor_from_names(_query_windows_gpu_names())
    if sys_name == "Linux":
        if _probe(["rocm-smi", "--showproductname"]):
            return "amd"
        return _pick_vendor_from_names(_query_linux_gpu_names())
    return "cpu"


def resolve_gpu_vendor(env: os._Environ[str] | None = None) -> str:
    env_map = env if env is not None else os.environ
    configured = normalize_gpu_vendor_input(env_map.get(GPU_VENDOR_ENV))
    if configured and configured != "auto":
        return configured
    return detect_gpu_vendor()


@dataclass(frozen=True)
class TorchInstallSpec:
    pip_args: list[str]
    label: str
    fallback_default: bool
    note: str | None = None


def get_torch_pip_install_spec(vendor: str, *, wsl: bool = False) -> TorchInstallSpec:
    sys_name = platform.system()
    is_win = sys_name == "Windows" and not wsl
    base = ["install", "torch", "torchvision", "torchaudio"]

    if vendor == "nvidia":
        return TorchInstallSpec(
            pip_args=[*base, "--index-url", TORCH_CUDA_INDEX],
            label="torch (CUDA cu121 index)",
            fallback_default=True,
        )

    if vendor == "amd":
        if is_win:
            return TorchInstallSpec(
                pip_args=base,
                label="torch (CPU — AMD ROCm needs WSL/Linux)",
                fallback_default=False,
                note="Native Windows PyTorch has no ROCm wheels; use WSL2 + AI_VIDEO_GPU_VENDOR=amd.",
            )
        return TorchInstallSpec(
            pip_args=[*base, "--index-url", TORCH_ROCM_INDEX],
            label="torch (ROCm 6.2 index)",
            fallback_default=True,
        )

    if vendor == "intel":
        return TorchInstallSpec(
            pip_args=[*base, "--index-url", TORCH_XPU_INDEX],
            label="torch (Intel XPU index)",
            fallback_default=True,
            note="Intel Arc may need GPU drivers; falls back to CPU PyPI if XPU wheels fail.",
        )

    return TorchInstallSpec(
        pip_args=base,
        label="torch (CPU / default PyPI)",
        fallback_default=False,
    )
