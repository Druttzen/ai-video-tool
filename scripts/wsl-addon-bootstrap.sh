#!/usr/bin/env bash
# Bootstrap managed Linux venv + pip deps inside WSL (shared addons folder on /mnt/c|d|...).
set -euo pipefail

ADDONS_ROOT="${ADDONS_ROOT:-$HOME/.ai-video-creator/addons}"
VENV_DIR="${VENV_DIR:-$ADDONS_ROOT/wsl-venv}"
REQ_FILE="${REQ_FILE:-$ADDONS_ROOT/requirements.txt}"
OPEN_SORA_DIR="${OPEN_SORA_DIR:-$ADDONS_ROOT/open-sora}"

echo "[wsl-bootstrap] addons root: $ADDONS_ROOT"
mkdir -p "$ADDONS_ROOT"

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

if python -c "import torch; print('torch', torch.__version__)" 2>/dev/null; then
  echo "[wsl-bootstrap] OK"
else
  echo "[wsl-bootstrap] WARN: torch import failed — WSL venv created but deps incomplete"
fi
