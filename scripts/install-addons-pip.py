#!/usr/bin/env python3
"""
Managed venv pip install with live CMD progress (requirements.txt + torch + Open-Sora editable).
Invoked from install-addons-runner.cjs after Python embed + venv bootstrap.
"""
from __future__ import annotations

import argparse
import platform
import re
import subprocess
import sys
from pathlib import Path

BLOCKLIST = {"opensora", "open-sora"}


def log(message: str, level: str = "info") -> None:
    prefix = {
        "info": "[INFO ]",
        "ok": "[ OK  ]",
        "warn": "[WARN ]",
        "error": "[ERROR]",
    }.get(level, "[INFO ]")
    print(f"{prefix} {message}", flush=True)


def package_key(line: str) -> str:
    base = line.split(";")[0].strip()
    return re.split(r"[<>=!\[]", base)[0].strip().lower()


def read_lines(path: Path) -> list[str]:
    if not path.is_file():
        return []
    lines = []
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if package_key(line) in BLOCKLIST:
            continue
        lines.append(line)
    return lines


def run_pip(python: Path, args: list[str], label: str) -> int:
    cmd = [str(python), "-m", "pip", *args]
    log(f"{label} …")
    log(f"  → {' '.join(cmd)}")
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    assert proc.stdout is not None
    for line in proc.stdout:
        print(line.rstrip("\r\n"), flush=True)
    code = proc.wait()
    if code != 0:
        log(f"{label} failed (exit {code})", "error")
    else:
        log(f"{label} finished", "ok")
    return code


def main() -> int:
    parser = argparse.ArgumentParser(description="Install managed pip deps from requirements.txt")
    parser.add_argument("--python", required=True, help="Managed venv python.exe")
    parser.add_argument("--requirements", required=True, help="userData/addons/requirements.txt")
    parser.add_argument("--open-sora", default="", help="Managed Open-Sora clone path")
    parser.add_argument("--optional", default="", help="Bundled optional requirements file")
    args = parser.parse_args()

    python = Path(args.python)
    requirements = Path(args.requirements)
    open_sora = Path(args.open_sora) if args.open_sora else None
    optional = Path(args.optional) if args.optional else None

    if not python.is_file():
        log(f"Managed venv Python not found: {python}", "error")
        return 1

    log("Starting pip install phase (requirements.txt + torch + Open-Sora editable)")

    code = run_pip(python, ["install", "--upgrade", "pip", "wheel", "setuptools"], "Upgrade pip")
    if code != 0:
        return code

    torch_args = ["install", "torch", "torchvision", "torchaudio"]
    if platform.system() == "Windows":
        code = run_pip(
            python,
            [*torch_args, "--index-url", "https://download.pytorch.org/whl/cu121"],
            "Install torch (CUDA cu121 index)",
        )
        if code != 0:
            log("CUDA torch index failed — trying default PyPI index", "warn")
            code = run_pip(python, torch_args, "Install torch (default index)")
    else:
        code = run_pip(python, torch_args, "Install torch")
    if code != 0:
        return code

    if open_sora and open_sora.is_dir():
        has_project = any(
            (open_sora / name).exists()
            for name in ("setup.py", "pyproject.toml", "opensora")
        )
        if has_project:
            code = run_pip(python, ["install", "-e", str(open_sora)], "Install Open-Sora editable")
            if code != 0:
                return code
        else:
            log("Open-Sora project files missing — skip editable install", "warn")
    else:
        log("Open-Sora clone missing — skip editable install", "warn")

    if requirements.is_file():
        code = run_pip(python, ["install", "-r", str(requirements)], f"pip install -r {requirements.name}")
        if code != 0:
            return code
    else:
        log(f"No requirements file at {requirements}", "warn")

    if optional and optional.is_file():
        log(f"Optional packages from {optional.name}")
        for line in read_lines(optional):
            opt_code = run_pip(python, ["install", line], f"Optional: {package_key(line)}")
            if opt_code != 0:
                log(f"Optional package skipped: {package_key(line)}", "warn")

    log("Pip install phase complete", "ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
