#!/usr/bin/env bash
# Bootstrap managed Linux venv + pip deps inside WSL (shared addons folder on /mnt/c|d|...).
set -euo pipefail

ADDONS_ROOT="${ADDONS_ROOT:-$HOME/.ai-video-creator/addons}"
VENV_DIR="${VENV_DIR:-$ADDONS_ROOT/wsl-venv}"
REQ_FILE="${REQ_FILE:-$ADDONS_ROOT/requirements.txt}"
OPEN_SORA_DIR="${OPEN_SORA_DIR:-$ADDONS_ROOT/open-sora}"
OPTIONAL_REQ_FILE="${OPTIONAL_REQ_FILE:-$ADDONS_ROOT/addon-requirements-optional.txt}"

echo "[wsl-bootstrap] addons root: $ADDONS_ROOT"
mkdir -p "$ADDONS_ROOT"

install_wsl_build_tools() {
  if command -v cmake >/dev/null 2>&1 && command -v g++ >/dev/null 2>&1; then
    echo "[wsl-bootstrap] build tools already present (cmake, g++)"
    return 0
  fi

  echo "[wsl-bootstrap] installing cmake + build-essential + libaio-dev (sudo may be required)"
  if sudo -n true 2>/dev/null; then
    if sudo apt-get update && sudo apt-get install -y cmake build-essential libaio-dev; then
      echo "[wsl-bootstrap] build tools installed"
      return 0
    fi
  fi

  echo "[wsl-bootstrap] WARN: could not install build tools non-interactively."
  echo "[wsl-bootstrap] Run manually in WSL: sudo apt update && sudo apt install -y cmake build-essential libaio-dev"
  return 1
}

install_wsl_build_tools || true

if ! command -v python3 >/dev/null 2>&1; then
  echo "[wsl-bootstrap] ERROR: python3 not found in WSL. Run: sudo apt update && sudo apt install -y python3 python3-venv python3-pip"
  exit 1
fi

if [ ! -d "$VENV_DIR" ]; then
  echo "[wsl-bootstrap] creating venv at $VENV_DIR"
  python3 -m venv "$VENV_DIR"
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

if python -c "import torch" 2>/dev/null; then
  echo "[wsl-bootstrap] torch already present: $(python -c 'import torch; print(torch.__version__)')"
else
  python -m pip install --upgrade pip wheel setuptools virtualenv

  echo "[wsl-bootstrap] installing torch (CUDA index when available)"
  if ! pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121; then
    pip install torch torchvision torchaudio || echo "[wsl-bootstrap] WARN: torch install failed"
  fi
fi

if [ -d "$OPEN_SORA_DIR" ] && { [ -f "$OPEN_SORA_DIR/setup.py" ] || [ -f "$OPEN_SORA_DIR/pyproject.toml" ] || [ -d "$OPEN_SORA_DIR/opensora" ]; }; then
  echo "[wsl-bootstrap] pip install -e $OPEN_SORA_DIR"
  pip install -e "$OPEN_SORA_DIR" || echo "[wsl-bootstrap] WARN: editable Open-Sora install failed"
fi

if [ -f "$REQ_FILE" ]; then
  echo "[wsl-bootstrap] pip install -r $REQ_FILE"
  pip install -r "$REQ_FILE" || echo "[wsl-bootstrap] WARN: requirements install had failures"
else
  echo "[wsl-bootstrap] WARN: requirements.txt missing at $REQ_FILE — sync requirements addon first"
fi

install_linux_optional_deps() {
  echo "[wsl-bootstrap] installing Linux optional deps (colossalai, tensornvme, flash-attn)"
  echo "[wsl-bootstrap] NOTE: cmake + build-essential + libaio-dev must be present — see Setup Hub WSL fix hint if builds fail"

  if [ -f "$OPTIONAL_REQ_FILE" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
      line="${line%%#*}"
      line="$(echo "$line" | xargs)"
      [ -z "$line" ] && continue
      case "$line" in
        *platform_system*) continue ;;
        colossalai|tensornvme|flash-attn) continue ;;
      esac
      pip install "$line" || echo "[wsl-bootstrap] WARN: optional install failed: $line"
    done < "$OPTIONAL_REQ_FILE"
  fi

  pip uninstall -y cmake 2>/dev/null || true
  pip install colossalai || echo "[wsl-bootstrap] WARN: colossalai install failed"
  if ! PATH="/usr/bin:${PATH}" pip install --no-build-isolation packaging tensornvme; then
    DISABLE_URING=1 PATH="/usr/bin:${PATH}" pip install --no-build-isolation tensornvme \
      || echo "[wsl-bootstrap] WARN: tensornvme install failed — run Setup Hub WSL fix hint (sudo apt), then Update all addons"
  fi

  # flash-attn requires torch + CUDA toolkit/nvcc in WSL; inference falls back to a stub when import fails.
  if ! pip install --no-build-isolation flash-attn; then
    MAX_JOBS=2 pip install --no-build-isolation flash-attn \
      || echo "[wsl-bootstrap] WARN: flash-attn install failed — inference uses PyTorch SDPA stub (slower but works)"
  fi
}

install_linux_optional_deps

if python -c "import torch; print('torch', torch.__version__)" 2>/dev/null; then
  export LD_LIBRARY_PATH="${HOME}/.tensornvme/lib:${LD_LIBRARY_PATH:-}"
  python -c "import colossalai" 2>/dev/null && echo "[wsl-bootstrap] colossalai OK" || echo "[wsl-bootstrap] WARN: colossalai import failed"
  python -c "import tensornvme" 2>/dev/null && echo "[wsl-bootstrap] tensornvme OK" || echo "[wsl-bootstrap] WARN: tensornvme import failed (libaio.so — run Setup Hub WSL fix hint)"
  python -c "import flash_attn" 2>/dev/null && echo "[wsl-bootstrap] flash-attn OK" || echo "[wsl-bootstrap] WARN: flash-attn import failed — inference stub active"
  echo "[wsl-bootstrap] OK"
else
  echo "[wsl-bootstrap] WARN: torch import failed — WSL venv created but deps incomplete"
fi
