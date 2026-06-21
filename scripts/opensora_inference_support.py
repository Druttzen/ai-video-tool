"""Helpers for Open-Sora inference subprocesses when optional deps are missing."""
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

_STUB_ROOT = Path(__file__).resolve().parent / "opensora-stub-paths"


def _is_wsl_env() -> bool:
    try:
        with open("/proc/version", encoding="utf-8") as f:
            return "microsoft" in f.read().lower()
    except OSError:
        return False


def opensora_wsl_inference_extras(python: str) -> list[str]:
    """CLI overrides for WSL when spaced AppData paths break Triton/ptxas (liger-kernel)."""
    if not _is_wsl_env():
        return []
    if " " not in str(python):
        return []
    return ["--model.use_liger_rope", "False"]


def _python_can_import(python: str, module: str) -> bool:
    result = subprocess.run(
        [python, "-c", f"import {module}"],
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


def _python_can_run(python: str, code: str, env: dict | None = None) -> bool:
    result = subprocess.run(
        [python, "-c", code],
        capture_output=True,
        text=True,
        env=env,
    )
    return result.returncode == 0


def tensornvme_importable(python: str) -> bool:
    # Open-Sora ckpt.py needs tensornvme.async_file_io; partial installs only expose _C/offload.
    return _python_can_run(python, "from tensornvme.async_file_io import AsyncFileWriter")


def flash_attn_importable(python: str) -> bool:
    return _python_can_import(python, "flash_attn")


def resolve_torchrun(python: str) -> str:
    """Return torchrun next to the given Python (Open-Sora expects torchrun, not plain python)."""
    py = Path(python)
    candidate = py.parent / "torchrun"
    if candidate.is_file():
        return str(candidate)
    found = shutil.which("torchrun")
    if found:
        return found
    return str(candidate)


def _wsl_triton_ptxas_path() -> str | None:
    candidate = Path.home() / ".ai-video-creator" / "wsl-tools" / "ptxas"
    return str(candidate) if candidate.is_file() else None


def opensora_subprocess_env(python: str, base: dict | None = None) -> dict:
    """Prepend only the stub paths needed for missing optional Open-Sora deps."""
    env = dict(base or os.environ)
    if _is_wsl_env():
        env.setdefault("NCCL_P2P_DISABLE", "1")
        env.setdefault("NCCL_IB_DISABLE", "1")
        env.setdefault("TORCHDYNAMO_DISABLE", "1")
        env.setdefault("TORCH_COMPILE_DISABLE", "1")
        env.setdefault("TRITON_CACHE_DIR", "/tmp/triton-cache")
        # drvfs (/mnt/c) mmap can SIGBUS on large checkpoint shards — prefer copy paths.
        env.setdefault("SAFETENSORS_FAST_GPU", "0")
        env.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
        env.setdefault("CUDA_MODULE_LOADING", "LAZY")
        env.setdefault("TOKENIZERS_PARALLELISM", "false")
        env.setdefault("WSL_LOW_VRAM", "1")
        ptxas = _wsl_triton_ptxas_path()
        if ptxas:
            env.setdefault("TRITON_PTXAS_PATH", ptxas)
    home = env.get("HOME") or str(Path.home())
    tensornvme_lib = f"{home}/.tensornvme/lib"
    if tensornvme_lib not in (env.get("LD_LIBRARY_PATH") or ""):
        prev_ld = env.get("LD_LIBRARY_PATH", "")
        env["LD_LIBRARY_PATH"] = f"{tensornvme_lib}:{prev_ld}" if prev_ld else tensornvme_lib
    stub_paths: list[str] = []
    if not _python_can_run(
        python, "from tensornvme.async_file_io import AsyncFileWriter", env=env
    ):
        stub_paths.append(str(_STUB_ROOT / "tensornvme"))
    if not _python_can_import(python, "flash_attn"):
        stub_paths.append(str(_STUB_ROOT / "flash_attn"))
    if not stub_paths:
        return env
    prev = env.get("PYTHONPATH", "")
    prefix = os.pathsep.join(stub_paths)
    env["PYTHONPATH"] = f"{prefix}{os.pathsep}{prev}" if prev else prefix
    return env


def _resolve_torchrun_launcher(python: str) -> list[str]:
    """Open-Sora inference expects torch.distributed (see README: torchrun --standalone)."""
    py_path = Path(python)
    if py_path.is_file():
        bindir = py_path.parent
        for name in ("torchrun", "torchrun.exe"):
            candidate = bindir / name
            if candidate.is_file():
                return [str(candidate), "--nproc_per_node", "1", "--standalone"]
    return [python, "-m", "torch.distributed.run", "--nproc_per_node=1", "--standalone"]


def opensora_inference_argv(python: str, inference_args: list[str]) -> list[str]:
    """Build argv for single-process Open-Sora inference with distributed init."""
    return _resolve_torchrun_launcher(python) + inference_args
