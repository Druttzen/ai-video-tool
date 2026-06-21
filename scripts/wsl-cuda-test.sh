#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=wsl-paths.sh
source "$SCRIPT_DIR/wsl-paths.sh"
nvidia-smi
"$WSL_PY" -c "import torch; print('cuda available', torch.cuda.is_available()); x=torch.zeros(1,device='cuda'); print('cuda tensor ok', x)"
