#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=wsl-paths.sh
source "$SCRIPT_DIR/wsl-paths.sh"
# shellcheck disable=SC1091
source "$VENV_ACTIVATE"
export PYTHONPATH="$OPENSORA_STUB_PATH${PYTHONPATH:+:$PYTHONPATH}"
cd "$OPEN_SORA_DIR"
torchrun --nproc_per_node 1 --standalone "$REPO_ROOT/scripts/wsl-dist-probe.py"
