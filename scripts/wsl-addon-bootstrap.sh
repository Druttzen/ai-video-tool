#!/usr/bin/env bash
# Bootstrap managed Linux venv + pip deps inside WSL (shared addons folder on /mnt/c|d|...).
set -euo pipefail

ADDONS_ROOT="${ADDONS_ROOT:-$HOME/.ai-video-creator/addons}"
VENV_DIR="${VENV_DIR:-$ADDONS_ROOT/wsl-venv}"
REQ_FILE="${REQ_FILE:-$ADDONS_ROOT/requirements.txt}"

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
python -m pip install --upgrade pip wheel setuptools

if [ -f "$REQ_FILE" ]; then
  echo "[wsl-bootstrap] pip install -r $REQ_FILE"
  pip install -r "$REQ_FILE"
else
  echo "[wsl-bootstrap] WARN: requirements.txt missing at $REQ_FILE — sync requirements addon first"
fi

python -c "import torch; print('torch', torch.__version__)"
echo "[wsl-bootstrap] OK"
