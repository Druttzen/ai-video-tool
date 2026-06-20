"""Stub flash-attn v3 interface when flash-attn is not installed."""

from __future__ import annotations

from flash_attn import flash_attn_func as _flash_attn_func_v2


def flash_attn_func(q, k, v, *args, **kwargs):
    return (_flash_attn_func_v2(q, k, v),)


def _flash_attn_forward(*args, **kwargs):
    raise NotImplementedError("flash-attn is not installed — install with CUDA toolkit or use WSL bootstrap")


def _flash_attn_backward(*args, **kwargs):
    raise NotImplementedError("flash-attn is not installed — install with CUDA toolkit or use WSL bootstrap")
