import os
import torch.distributed as dist
import colossalai

print("WORLD_SIZE", os.environ.get("WORLD_SIZE"))
colossalai.launch_from_torch({})
print("is_initialized", dist.is_initialized())
dist.barrier()
print("barrier OK")
