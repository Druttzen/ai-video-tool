#!/usr/bin/env bash
# Install WSL system packages + pip optional stack (tensornvme, flash-attn).
# Requires sudo once for: cmake build-essential libaio-dev
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=wsl-paths.sh
source "$SCRIPT_DIR/wsl-paths.sh"

export LD_LIBRARY_PATH="${HOME}/.tensornvme/lib:${LD_LIBRARY_PATH:-}"

echo "=== AI Video Creator — WSL Linux optional deps ==="
echo "Addons root: $ADDONS_ROOT"
echo "Venv: $VENV_DIR"
echo ""

need_apt=0
for pkg in cmake libaio-dev; do
  if ! dpkg -s "$pkg" >/dev/null 2>&1; then
    need_apt=1
    break
  fi
done

if [ "$need_apt" -eq 1 ]; then
  echo "Installing apt packages (sudo password required):"
  echo "  cmake build-essential libaio-dev ninja-build pkg-config"
  sudo apt-get update
  sudo apt-get install -y cmake build-essential libaio-dev ninja-build pkg-config
else
  echo "apt build packages already installed"
fi

echo ""
echo "=== libaio (ldconfig) ==="

# Ubuntu 24.04+ ships libaio.so.1t64; prebuilt tensornvme wheels expect libaio.so.1
LIBAIO_DIR="/lib/x86_64-linux-gnu"
if [ ! -e "$LIBAIO_DIR/libaio.so.1" ] && [ -e "$LIBAIO_DIR/libaio.so.1t64" ]; then
  echo "Linking libaio.so.1 -> libaio.so.1t64 (for tensornvme)"
  if [ "$(id -u)" -eq 0 ]; then
    ln -sf libaio.so.1t64 "$LIBAIO_DIR/libaio.so.1"
    ldconfig
  else
    sudo ln -sf libaio.so.1t64 "$LIBAIO_DIR/libaio.so.1"
    sudo ldconfig
  fi
fi

ldconfig -p 2>/dev/null | grep libaio || echo "WARN: libaio not in ldconfig yet"

if [ ! -x "$WSL_PY" ]; then
  echo "ERROR: WSL venv python missing at $WSL_PY — run wsl-run-bootstrap.sh first"
  exit 1
fi

# shellcheck disable=SC1091
source "$VENV_ACTIVATE"

python -m pip install --upgrade pip wheel setuptools packaging

echo ""
echo "=== tensornvme ==="
python -m pip uninstall -y cmake 2>/dev/null || true
if PATH="/usr/bin:${PATH}" python -m pip install --no-build-isolation packaging tensornvme; then
  echo "tensornvme pip OK"
elif DISABLE_URING=1 PATH="/usr/bin:${PATH}" python -m pip install --no-build-isolation tensornvme; then
  echo "tensornvme pip OK (DISABLE_URING=1)"
else
  echo "ERROR: tensornvme pip install failed"
  exit 1
fi

python -c 'import tensornvme; print("tensornvme import OK")'

echo ""
echo "=== flash-attn (optional — needs CUDA toolkit/nvcc in WSL) ==="
if python -m pip install --no-build-isolation flash-attn 2>/dev/null \
  || MAX_JOBS=2 python -m pip install --no-build-isolation flash-attn 2>/dev/null; then
  python -c "import flash_attn; print('flash_attn OK')"
else
  echo "WARN: flash-attn skipped — inference uses PyTorch SDPA stub (set CUDA_HOME if you need flash-attn)"
fi

echo ""
echo "=== stack verify ==="
bash "$SCRIPT_DIR/wsl-verify-stack.sh"
echo ""
echo "Done."
