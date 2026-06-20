#!/usr/bin/env bash
set -euo pipefail
export LD_LIBRARY_PATH="${HOME}/.tensornvme/lib:${LD_LIBRARY_PATH:-}"
cd /mnt/f/ai-video-tool
PY="/mnt/c/Users/micke/AppData/Roaming/AI Video Creator/addons/wsl-venv/bin/python3"
"$PY" scripts/run-director-job.py director-smoke-job.json
