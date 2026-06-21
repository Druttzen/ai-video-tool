#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=wsl-paths.sh
source "$SCRIPT_DIR/wsl-paths.sh"
# shellcheck disable=SC1091
source "$VENV_ACTIVATE"
python3 -c "import tensornvme; print('tensornvme OK:', tensornvme.__file__)"
