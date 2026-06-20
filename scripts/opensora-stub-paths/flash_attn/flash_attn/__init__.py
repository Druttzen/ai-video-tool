"""Fallback when flash-attn is not built (requires CUDA toolkit in WSL)."""

from __future__ import annotations

import torch
from torch import Tensor


def flash_attn_func(q: Tensor, k: Tensor, v: Tensor) -> Tensor:
    # Open-Sora passes (B, L, H, D); scaled_dot_product_attention expects (B, H, L, D).
    q = q.transpose(1, 2)
    k = k.transpose(1, 2)
    v = v.transpose(1, 2)
    out = torch.nn.functional.scaled_dot_product_attention(q, k, v, dropout_p=0.0, is_causal=False)
    return out.transpose(1, 2)
