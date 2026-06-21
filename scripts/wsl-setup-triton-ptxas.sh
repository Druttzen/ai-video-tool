#!/usr/bin/env bash
set -euo pipefail
# Triton shells out to ptxas with an unquoted venv path; symlink avoids AppData spaces.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=wsl-paths.sh
source "$SCRIPT_DIR/wsl-paths.sh"
wsl_setup_triton_ptxas
