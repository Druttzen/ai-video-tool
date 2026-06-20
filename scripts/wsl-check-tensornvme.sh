#!/usr/bin/env bash
set -euo pipefail
export LD_LIBRARY_PATH="${HOME}/.tensornvme/lib:${LD_LIBRARY_PATH:-}"
source "/mnt/c/Users/micke/AppData/Roaming/AI Video Creator/addons/wsl-venv/bin/activate"
python3 -c "import tensornvme; print('tensornvme OK:', tensornvme.__file__)"
