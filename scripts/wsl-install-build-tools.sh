#!/usr/bin/env bash
# One-time WSL packages for colossalai / tensornvme / flash-attn native builds.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=wsl-paths.sh
source "$SCRIPT_DIR/wsl-paths.sh"

echo "=== AI Video Creator — WSL build tools ==="
echo "Addons root: $ADDONS_ROOT"
echo ""
echo "Installing: cmake build-essential libaio-dev python3-venv python3-pip"
echo "(sudo password required)"
echo ""

sudo apt-get update
sudo apt-get install -y cmake build-essential libaio-dev python3 python3-venv python3-pip

echo ""
echo "Installed:"
command -v cmake && cmake --version | head -1
command -v g++ && g++ --version | head -1
dpkg -s libaio-dev | grep -E '^Status|^Version'
echo ""
echo "Next — install tensornvme + optional Linux pip stack:"
echo "  bash $REPO_ROOT/scripts/wsl-install-linux-optional.sh"
echo ""
echo "Or full bootstrap:"
echo "  bash $REPO_ROOT/scripts/wsl-run-bootstrap.sh"
