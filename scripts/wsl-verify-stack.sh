#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=wsl-paths.sh
source "$SCRIPT_DIR/wsl-paths.sh"
echo "=== libaio ==="
ldconfig -p 2>/dev/null | grep libaio || echo "libaio NOT in ldconfig"
echo "=== torch ==="
"$WSL_PY" -c "import torch; print('torch', torch.__version__, 'cuda', torch.cuda.is_available())"
echo "=== colossalai ==="
"$WSL_PY" -c "import colossalai; print('colossalai OK')"
echo "=== tensornvme ==="
"$WSL_PY" -c "from tensornvme.async_file_io import AsyncFileWriter; print('tensornvme OK')" || echo "tensornvme FAILED (stub may be used)"
echo "=== flash_attn ==="
"$WSL_PY" -c "import flash_attn; print('flash_attn OK')" || echo "flash_attn FAILED (stub may be used)"
echo "=== GPU ==="
nvidia-smi --query-compute-apps=pid,used_memory --format=csv 2>/dev/null || echo "no nvidia-smi"
