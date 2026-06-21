#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=wsl-paths.sh
source "$SCRIPT_DIR/wsl-paths.sh"

test_alloc() {
  local label="$1"
  shift
  echo "=== $label ==="
  env "$@" "$WSL_PY" -c "
import torch
print('cuda', torch.cuda.is_available())
try:
    x = torch.empty(1024, 3072, 3072, device='cuda', dtype=torch.bfloat16)
    print('large alloc OK', x.shape, x.element_size() * x.nelement() / 1e9, 'GB')
except Exception as e:
    print('large alloc FAIL', e)
" 2>&1
}

test_alloc "baseline (no LD_LIBRARY_PATH)"
test_alloc "with tensornvme LD_LIBRARY_PATH" LD_LIBRARY_PATH="${HOME}/.tensornvme/lib"
test_alloc "import tensornvme then alloc" LD_LIBRARY_PATH="${HOME}/.tensornvme/lib" "$WSL_PY" -c "
import tensornvme
print('tensornvme', tensornvme.__file__)
import torch
x = torch.empty(1024, 3072, 3072, device='cuda', dtype=torch.bfloat16)
print('after tensornvme import OK')
" 2>&1 || true

test_alloc "stub PYTHONPATH only" PYTHONPATH="$OPENSORA_STUB_PATH"
test_alloc "stub + LD_LIBRARY_PATH" PYTHONPATH="$OPENSORA_STUB_PATH" LD_LIBRARY_PATH="${HOME}/.tensornvme/lib"
