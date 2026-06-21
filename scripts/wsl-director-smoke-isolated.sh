#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=wsl-paths.sh
source "$SCRIPT_DIR/wsl-paths.sh"
cd "$REPO_ROOT"
echo "=== GPU before ==="
nvidia-smi --query-gpu=memory.used,memory.free --format=csv
echo "=== starting director smoke ==="
"$WSL_PY" scripts/run-director-job.py director-smoke-job.json
