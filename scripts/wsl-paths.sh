#!/usr/bin/env bash
# Portable WSL path resolution for ai-video-tool helper scripts.
# Source from scripts/*.sh: source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/wsl-paths.sh"

_wsl_paths_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -n "${AI_VIDEO_TOOL_REPO:-}" ]; then
  REPO_ROOT="$(cd "$AI_VIDEO_TOOL_REPO" && pwd)"
else
  REPO_ROOT="$(cd "$_wsl_paths_dir/.." && pwd)"
fi

_wsl_find_addons_root() {
  local candidate
  shopt -s nullglob
  for candidate in /mnt/c/Users/*/AppData/Roaming/AI\ Video\ Creator/addons; do
    if [ -d "$candidate/wsl-venv" ] || [ -d "$candidate/open-sora" ]; then
      echo "$candidate"
      shopt -u nullglob
      return 0
    fi
  done
  shopt -u nullglob
  echo "${HOME}/.ai-video-creator/addons"
}

if [ -n "${ADDONS_ROOT:-}" ]; then
  :
elif [ -n "${AI_VIDEO_CREATOR_USER_DATA:-}" ]; then
  ADDONS_ROOT="${AI_VIDEO_CREATOR_USER_DATA}/addons"
else
  ADDONS_ROOT="$(_wsl_find_addons_root)"
fi

VENV_DIR="${VENV_DIR:-$ADDONS_ROOT/wsl-venv}"
WSL_PY="${WSL_PY:-$VENV_DIR/bin/python3}"
VENV_ACTIVATE="${VENV_ACTIVATE:-$VENV_DIR/bin/activate}"
OPEN_SORA_DIR="${OPEN_SORA_DIR:-$ADDONS_ROOT/open-sora}"

export LD_LIBRARY_PATH="${HOME}/.tensornvme/lib:${LD_LIBRARY_PATH:-}"

wsl_opensora_stub_path() {
  echo "${REPO_ROOT}/scripts/opensora-stub-paths/tensornvme:${REPO_ROOT}/scripts/opensora-stub-paths/flash_attn"
}
OPENSORA_STUB_PATH="$(wsl_opensora_stub_path)"

wsl_find_triton_ptxas() {
  if [ ! -d "$VENV_DIR/lib" ]; then
    return 1
  fi
  find "$VENV_DIR/lib" -path '*/triton/backends/nvidia/bin/ptxas' -type f 2>/dev/null | head -1
}

wsl_setup_triton_ptxas() {
  local tool_dir="${HOME}/.ai-video-creator/wsl-tools"
  local ptxas_src
  ptxas_src="$(wsl_find_triton_ptxas || true)"
  if [ -z "$ptxas_src" ] || [ ! -f "$ptxas_src" ]; then
    echo "ptxas source missing under venv: $VENV_DIR" >&2
    return 1
  fi
  mkdir -p "$tool_dir"
  ln -sf "$ptxas_src" "$tool_dir/ptxas"
  export TRITON_PTXAS_PATH="$tool_dir/ptxas"
  echo "TRITON_PTXAS_PATH=$TRITON_PTXAS_PATH"
  "$TRITON_PTXAS_PATH" --version 2>&1 | head -1 || true
}

unset _wsl_paths_dir _wsl_find_addons_root
