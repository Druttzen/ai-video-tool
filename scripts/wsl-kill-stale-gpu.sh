#!/usr/bin/env bash
set -euo pipefail
echo "=== stale inference/torchrun processes ==="
pids=$(ps aux | grep -E '[i]nference\.py|[t]orchrun.*inference' | awk '{print $2}' || true)
if [ -z "$pids" ]; then
  echo "none"
else
  echo "killing: $pids"
  kill -9 $pids 2>/dev/null || true
fi
sleep 2
nvidia-smi 2>/dev/null | head -20 || true
