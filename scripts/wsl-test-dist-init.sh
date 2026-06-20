#!/usr/bin/env bash
set -euo pipefail
source "/mnt/c/Users/micke/AppData/Roaming/AI Video Creator/addons/wsl-venv/bin/activate"
cd "/mnt/c/Users/micke/AppData/Roaming/AI Video Creator/addons/open-sora"
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
