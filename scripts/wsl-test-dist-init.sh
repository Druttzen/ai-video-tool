#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=wsl-paths.sh
source "$SCRIPT_DIR/wsl-paths.sh"
# shellcheck disable=SC1091
source "$VENV_ACTIVATE"
cd "$OPEN_SORA_DIR"
torchrun --nproc_per_node 1 --standalone -c "
import os
print('WORLD_SIZE', os.environ.get('WORLD_SIZE'))
import torch.distributed as dist
import colossalai
colossalai.launch_from_torch({})
print('is_initialized', dist.is_initialized())
dist.barrier()
print('barrier OK')
"
