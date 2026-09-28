"""A small transformer that reads a whole sign (segment packs, scripts/train_segments.py).

Per-frame LayerNorm -> linear projection + learned position embedding ->
pre-norm transformer encoder layers (multi-head self-attention, GELU feed-forward)
-> LayerNorm -> mean over frames -> linear classifier. The app runs the same
computation in TypeScript (mobile/src/model/transformerModel.ts); a parity fixture
(shared/fixtures/segment_parity_v2.json) pins the two together.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import torch
from torch import nn


@dataclass
class TransformerConfig:
    num_classes: int
    input_dim: int
    frames: int = 32
    width: int = 128
    layers: int = 3
    heads: int = 4
    dropout: float = 0.2

    def to_dict(self) -> dict:
        return asdict(self)


class SegmentTransformer(nn.Module):
    def __init__(self, config: TransformerConfig):
        super().__init__()
        if config.width % config.heads != 0:
            raise ValueError("width must be a multiple of heads")
        self.config = config
        d = config.width
        self.input_norm = nn.LayerNorm(config.input_dim)
        self.embed = nn.Linear(config.input_dim, d)
        self.position = nn.Parameter(torch.zeros(1, config.frames, d))
        layer = nn.TransformerEncoderLayer(
            d, config.heads, 2 * d, config.dropout, activation="gelu", batch_first=True, norm_first=True
        )
        self.encoder = nn.TransformerEncoder(layer, config.layers, enable_nested_tensor=False)
        self.output_norm = nn.LayerNorm(d)
        self.head = nn.Sequential(nn.Dropout(config.dropout), nn.Linear(d, config.num_classes))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """x: (batch, frames, features) -> logits (batch, classes)."""
        if x.dim() != 3 or x.shape[1:] != (self.config.frames, self.config.input_dim):
            expected = f"(B, {self.config.frames}, {self.config.input_dim})"
            raise ValueError(f"expected {expected}, got {tuple(x.shape)}")
        h = self.encoder(self.embed(self.input_norm(x)) + self.position)
        return self.head(self.output_norm(h).mean(1))


def transformer_weights(model: SegmentTransformer) -> dict[str, torch.Tensor]:
    """Inference weights by the names the app reads (mobile/src/model/transformerModel.ts)."""
    out = {
        "input_norm.weight": model.input_norm.weight,
        "input_norm.bias": model.input_norm.bias,
        "embed.weight": model.embed.weight,
        "embed.bias": model.embed.bias,
        "position": model.position[0],
        "output_norm.weight": model.output_norm.weight,
        "output_norm.bias": model.output_norm.bias,
        "head.weight": model.head[1].weight,
        "head.bias": model.head[1].bias,
    }
    for i, layer in enumerate(model.encoder.layers):
        prefix = f"layers.{i}."
        out[prefix + "norm1.weight"] = layer.norm1.weight
        out[prefix + "norm1.bias"] = layer.norm1.bias
        out[prefix + "attention.in.weight"] = layer.self_attn.in_proj_weight
        out[prefix + "attention.in.bias"] = layer.self_attn.in_proj_bias
        out[prefix + "attention.out.weight"] = layer.self_attn.out_proj.weight
        out[prefix + "attention.out.bias"] = layer.self_attn.out_proj.bias
        out[prefix + "norm2.weight"] = layer.norm2.weight
        out[prefix + "norm2.bias"] = layer.norm2.bias
        out[prefix + "ff1.weight"] = layer.linear1.weight
        out[prefix + "ff1.bias"] = layer.linear1.bias
        out[prefix + "ff2.weight"] = layer.linear2.weight
        out[prefix + "ff2.bias"] = layer.linear2.bias
    return {name: value.detach() for name, value in out.items()}
