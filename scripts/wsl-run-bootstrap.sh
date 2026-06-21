#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=wsl-paths.sh
source "$SCRIPT_DIR/wsl-paths.sh"
export ADDONS_ROOT VENV_DIR OPEN_SORA_DIR
export REQ_FILE="${REQ_FILE:-$ADDONS_ROOT/requirements.txt}"
export OPTIONAL_REQ_FILE="${OPTIONAL_REQ_FILE:-$ADDONS_ROOT/addon-requirements-optional.txt}"
tr -d '\r' < "$REPO_ROOT/scripts/wsl-addon-bootstrap.sh" | bash
