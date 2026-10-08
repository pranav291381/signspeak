"""Writes shared/fixtures/segment_parity_v2.json: pins the app's whole-sign model code
(mobile/src/model/signModel.ts) to train_segments.py and PyTorch.

A small segment pack (untrained members: GRUs and transformers over every input
kind) and a sign made of random landmarks, with the logits PyTorch gives.
Not a real model and not ISL.
"""

import json
import sys
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from train_segments import SEGMENT_FRAMES, SEGMENT_PACK_VERSION, member_entry, network_input  # noqa: E402

from signspeak_ml.models.segment_transformer import SegmentTransformer, TransformerConfig  # noqa: E402
from signspeak_ml.models.temporal import ModelConfig, TemporalSignClassifier  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "segment_parity_v2.json"
CLASSES = 4

rng = np.random.default_rng(7)
torch.manual_seed(7)

# 23 frames: a person in view, the right hand shown in most frames, the left in some.
frames = np.zeros((23, 156), dtype=np.float32)
frames[:, 0:153:3] = rng.normal(0, 0.5, (23, 51))
frames[:, 1:153:3] = rng.normal(0.3, 0.5, (23, 51))
frames[:, 153] = 1
frames[:, 155] = rng.random(23) > 0.2
frames[frames[:, 155] == 0, 90:153] = 0
frames[:, 154] = rng.random(23) > 0.5
frames[frames[:, 154] == 0, 27:90] = 0
frames = np.round(frames * 1000) / 1000  # as recordings are stored

members, logits = [], []
KINDS = (
    ("gru", "xy"),
    ("gru", "xy+hands+vel"),
    ("tf", "xy"),
    ("gru", "xy+hands+vel+angles"),
    ("tf", "xy+angles"),
)
for arch, features in KINDS:
    x = network_input(frames, features)
    if arch == "tf":
        config = TransformerConfig(
            num_classes=CLASSES, input_dim=x.shape[1], frames=SEGMENT_FRAMES, width=16, layers=2
        )
        model = SegmentTransformer(config)
        with torch.no_grad():  # position embeddings are zeros until trained
            model.position.normal_(0, 0.5)
    else:
        config = ModelConfig(num_classes=CLASSES, input_dim=x.shape[1], conv_channels=8, hidden_size=6)
        model = TemporalSignClassifier(config)
        for module in model.modules():  # batch norm statistics that are not the identity
            if isinstance(module, torch.nn.BatchNorm1d):
                module.running_mean.uniform_(-0.2, 0.2)
                module.running_var.uniform_(0.5, 1.5)
    model.eval()
    with torch.no_grad():
        logits.append(model(torch.tensor(x[None]))[0].numpy())
    members.append(member_entry(arch, features, model))

pack = {
    "format": "islconnect-model-pack",
    "version": SEGMENT_PACK_VERSION,
    "id": "test",
    "name": "Parity test (not ISL)",
    "createdAt": "2026-01-01T00:00:00+00:00",
    "featureSpecVersion": 1,
    "targetFps": 15,
    "windowFrames": SEGMENT_FRAMES,
    "mode": "segment",
    "members": members,
    "labels": [{"id": f"test:{i}", "text": f"Sign {i}"} for i in range(CLASSES)],
    "language": "en",
    "unknownLabel": None,
    "temperature": 1.0,
    "calibrated": False,
    "stabilizer": None,
    "source": {"name": "Synthetic", "url": "https://example.org/", "permission": "Test data"},
    "evaluation": {},
}
fixture = {
    "pack": pack,
    "frames": frames.tolist(),
    "logits": np.mean(logits, 0).tolist(),
}
OUT.write_text(json.dumps(fixture) + "\n", encoding="utf-8")
print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")
