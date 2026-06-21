#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=wsl-paths.sh
source "$SCRIPT_DIR/wsl-paths.sh"
cd "$REPO_ROOT"
bash "$SCRIPT_DIR/wsl-prepare-native-ckpts.sh"
"$WSL_PY" "$SCRIPT_DIR/wsl-patch-open-sora-low-vram.py" "$OPEN_SORA_DIR"
"$WSL_PY" scripts/run-director-job.py director-smoke-job.json
