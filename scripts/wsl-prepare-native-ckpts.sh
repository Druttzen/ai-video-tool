#!/usr/bin/env bash
# Prefer Linux-native ckpts for google/T5 to avoid drvfs mmap SIGBUS on /mnt/c.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=wsl-paths.sh
source "$SCRIPT_DIR/wsl-paths.sh"

NATIVE_GOOGLE="${HOME}/.ai-video-creator/ckpts-cache/google"
DRVF_GOOGLE="${OPEN_SORA_DIR}/ckpts/google"
DRVF_BACKUP="${OPEN_SORA_DIR}/ckpts/google.drvfs"

if [ ! -d "$NATIVE_GOOGLE" ]; then
  echo "[wsl-ckpts] native google cache missing: $NATIVE_GOOGLE" >&2
  echo "[wsl-ckpts] run: rsync -a '\$OPEN_SORA_DIR/ckpts/google/' ~/.ai-video-creator/ckpts-cache/google/" >&2
  exit 1
fi

if [ -L "$DRVF_GOOGLE" ]; then
  echo "[wsl-ckpts] google ckpts already symlinked -> $(readlink "$DRVF_GOOGLE")"
  exit 0
fi

if [ -d "$DRVF_GOOGLE" ] && [ ! -e "$DRVF_BACKUP" ]; then
  echo "[wsl-ckpts] backing up drvfs google -> $DRVF_BACKUP"
  mv "$DRVF_GOOGLE" "$DRVF_BACKUP"
fi

ln -sfn "$NATIVE_GOOGLE" "$DRVF_GOOGLE"
echo "[wsl-ckpts] google ckpts -> $NATIVE_GOOGLE"
