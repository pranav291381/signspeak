"""First recognition model: a small temporal classifier over landmark sequences.

Architecture: per-frame LayerNorm -> 2 x temporal 1D convolution (local motion)
-> bidirectional GRU (sequence context) -> attention pooling over time
-> linear classifier. About half a million parameters, so it stays small and fast
enough for phones. This is intentionally modest; see docs/development-plan.md for
the path to transformers and continuous recognition.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import torch
from torch import nn

from ..features.spec import FRAME_DIM


@dataclass
class ModelConfig:
    num_classes: int
    input_dim: int = FRAME_DIM
    conv_channels: int = 128
    kernel_size: int = 5
    hidden_size: int = 96
    dropout: float = 0.3

    def to_dict(self) -> dict:
        return asdict(self)


class TemporalSignClassifier(nn.Module):
    def __init__(self, config: ModelConfig):
        super().__init__()
        if config.num_classes < 2:
            raise ValueError("need at least 2 classes")
        self.config = config
        c, k = config.conv_channels, config.kernel_size
        self.input_norm = nn.LayerNorm(config.input_dim)
        self.conv = nn.Sequential(
            nn.Conv1d(config.input_dim, c, k, padding=k // 2),
            nn.BatchNorm1d(c),
            nn.GELU(),
            nn.Dropout(config.dropout),
            nn.Conv1d(c, c, k, padding=k // 2),
            nn.BatchNorm1d(c),
            nn.GELU(),
        )
        self.gru = nn.GRU(c, config.hidden_size, batch_first=True, bidirectional=True)
        self.attention = nn.Linear(2 * config.hidden_size, 1)
        self.head = nn.Sequential(
            nn.Dropout(config.dropout), nn.Linear(2 * config.hidden_size, config.num_classes)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """x: (batch, time, features) -> logits (batch, classes)."""
        if x.dim() != 3 or x.shape[-1] != self.config.input_dim:
            raise ValueError(f"expected (B, T, {self.config.input_dim}), got {tuple(x.shape)}")
        # Frames with no detected person (all presence flags 0) are masked out of pooling.
        present = x[..., -3] > 0.5
        h = self.input_norm(x)
        h = self.conv(h.transpose(1, 2)).transpose(1, 2)
        h, _ = self.gru(h)
        scores = self.attention(h).squeeze(-1)
        # If a whole window is empty, fall back to uniform pooling instead of NaNs.
        all_absent = ~present.any(dim=1, keepdim=True)
        mask = present | all_absent
        scores = scores.masked_fill(~mask, torch.finfo(scores.dtype).min)
        weights = torch.softmax(scores, dim=1).unsqueeze(-1)
        pooled = (weights * h).sum(dim=1)
        return self.head(pooled)


def count_parameters(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters() if p.requires_grad)
