"""
CORN ordinal regression (Shi, Cao & Raschka, 2023, "Deep neural networks for
rank-consistent ordinal regression based on conditional probabilities").

A K-level ordinal head has K-1 logits. Logit k models P(y > k | y > k-1);
the chain rule gives rank-consistent cumulative probabilities
P(y > k) = prod_{j<=k} sigmoid(logit_j), so they can never cross.
"""

from __future__ import annotations

import torch
import torch.nn.functional as F


def corn_loss(logits: torch.Tensor, y: torch.Tensor) -> torch.Tensor:
    """logits: N×(K-1); y: N integer levels in [0, K-1]."""
    n_tasks = logits.shape[1]
    total, count = logits.new_zeros(()), 0
    for k in range(n_tasks):
        mask = y >= k  # task k is conditioned on having passed threshold k-1
        if mask.any():
            target = (y[mask] > k).float()
            total = total + F.binary_cross_entropy_with_logits(logits[mask, k], target, reduction='sum')
            count += int(mask.sum())
    return total / max(count, 1)


def cumulative_probs(logits: torch.Tensor) -> torch.Tensor:
    """N×(K-1) P(y > k)."""
    return torch.cumprod(torch.sigmoid(logits), dim=1)


def level_probs(logits: torch.Tensor) -> torch.Tensor:
    """N×K P(y = k) from cumulative probabilities."""
    cum = cumulative_probs(logits)
    ones = torch.ones_like(cum[:, :1])
    zeros = torch.zeros_like(cum[:, :1])
    upper = torch.cat([ones, cum], dim=1)
    lower = torch.cat([cum, zeros], dim=1)
    return (upper - lower).clamp_min(0)


def predict_level(logits: torch.Tensor) -> torch.Tensor:
    """Rank = number of cumulative probabilities above 0.5."""
    return (cumulative_probs(logits) > 0.5).sum(dim=1)
