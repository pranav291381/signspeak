"""Export a trained TemporalSignClassifier for the app.

The app runs the model in plain TypeScript (mobile/src/model/), so the pack is
one JSON file: configuration, labels, calibration, and the weights as
little-endian float32 in base64. Batch normalisation is folded into the
convolutions (the app only runs inference). A parity fixture
(shared/fixtures/model_parity_v1.json) pins the app's implementation to PyTorch.
"""

from __future__ import annotations

import base64
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import torch

from ..data.annotations import UNKNOWN_LABEL
from ..features.spec import FEATURE_SPEC_VERSION, TARGET_FPS, WINDOW_FRAMES
from ..models.temporal import ModelConfig, TemporalSignClassifier

APP_PACK_FORMAT = "islconnect-model-pack"
APP_PACK_VERSION = 1
ARCHITECTURE = "temporal-conv-bigru-v1"
FIXTURE_PATH = Path(__file__).resolve().parents[3] / "shared" / "fixtures" / "model_parity_v1.json"


def _encode(array: np.ndarray) -> dict[str, Any]:
    data = np.ascontiguousarray(array, dtype="<f4")
    return {"shape": list(data.shape), "data": base64.b64encode(data.tobytes()).decode("ascii")}


def _fold_batchnorm(conv: torch.nn.Conv1d, norm: torch.nn.BatchNorm1d) -> tuple[np.ndarray, np.ndarray]:
    scale = (norm.weight / torch.sqrt(norm.running_var + norm.eps)).detach()
    weight = conv.weight.detach() * scale[:, None, None]
    bias = (conv.bias.detach() - norm.running_mean) * scale + norm.bias.detach()
    return weight.numpy(), bias.numpy()


def app_weights(model: TemporalSignClassifier) -> dict[str, dict[str, Any]]:
    """Inference weights by name, batch normalisation folded in."""
    model = model.eval()
    conv1_w, conv1_b = _fold_batchnorm(model.conv[0], model.conv[1])
    conv2_w, conv2_b = _fold_batchnorm(model.conv[4], model.conv[5])
    weights = {
        "input_norm.weight": model.input_norm.weight,
        "input_norm.bias": model.input_norm.bias,
        "conv1.weight": conv1_w,
        "conv1.bias": conv1_b,
        "conv2.weight": conv2_w,
        "conv2.bias": conv2_b,
        "attention.weight": model.attention.weight,
        "attention.bias": model.attention.bias,
        "head.weight": model.head[1].weight,
        "head.bias": model.head[1].bias,
    }
    for name, value in model.gru.named_parameters():
        weights[f"gru.{name}"] = value
    return {
        name: _encode(value.detach().numpy() if isinstance(value, torch.Tensor) else value)
        for name, value in weights.items()
    }


def app_pack(
    model: TemporalSignClassifier,
    labels: list[dict[str, str]],
    *,
    pack_id: str,
    name: str,
    temperature: float,
    calibrated: bool,
    source: dict[str, str],
    evaluation: dict[str, Any],
    language: str = "en",
) -> dict[str, Any]:
    """The pack as a JSON-ready dict. ``labels``: [{"id", "text"}], the unknown class as id UNKNOWN_LABEL."""
    if len(labels) != model.config.num_classes:
        raise ValueError(f"{len(labels)} labels for {model.config.num_classes} classes")
    config = model.config
    return {
        "format": APP_PACK_FORMAT,
        "version": APP_PACK_VERSION,
        "id": pack_id,
        "name": name,
        "createdAt": datetime.now(UTC).isoformat(timespec="seconds"),
        "featureSpecVersion": FEATURE_SPEC_VERSION,
        "targetFps": TARGET_FPS,
        "windowFrames": WINDOW_FRAMES,
        "architecture": ARCHITECTURE,
        "config": {
            "inputDim": config.input_dim,
            "convChannels": config.conv_channels,
            "kernelSize": config.kernel_size,
            "hiddenSize": config.hidden_size,
            "numClasses": config.num_classes,
        },
        "labels": labels,
        "language": language,
        "unknownLabel": UNKNOWN_LABEL if any(label["id"] == UNKNOWN_LABEL for label in labels) else None,
        "temperature": float(temperature),
        "calibrated": bool(calibrated),
        "source": source,
        "evaluation": evaluation,
        "weights": app_weights(model),
    }


def save_app_pack(path: Path, pack: dict[str, Any]) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(pack, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return path


def parity_fixture(seed: int = 7) -> dict[str, Any]:
    """A tiny random model, an input window (with frames nobody is in) and PyTorch's logits."""
    torch.manual_seed(seed)
    config = ModelConfig(num_classes=4, conv_channels=8, kernel_size=5, hidden_size=6, dropout=0.0)
    model = TemporalSignClassifier(config)
    # Non-trivial batch-norm statistics, so folding is exercised.
    for norm in (model.conv[1], model.conv[5]):
        norm.running_mean.uniform_(-0.5, 0.5)
        norm.running_var.uniform_(0.5, 2.0)
        norm.weight.data.uniform_(0.5, 1.5)
        norm.bias.data.uniform_(-0.2, 0.2)
    model.eval()
    rng = np.random.default_rng(seed)
    x = rng.normal(0, 0.5, size=(12, config.input_dim)).astype(np.float32)
    x[:, -3:] = 1.0
    x[[0, 1, 11], :] = 0.0  # nobody in view: excluded from attention pooling
    with torch.no_grad():
        logits = model(torch.from_numpy(x)[None])[0].numpy()
    labels = [{"id": UNKNOWN_LABEL, "text": ""}]
    labels += [{"id": f"test:{i}", "text": f"Sign {i}"} for i in range(1, 4)]
    pack = app_pack(
        model,
        labels,
        pack_id="parity",
        name="Parity fixture",
        temperature=1.0,
        calibrated=False,
        source={"name": "random weights", "url": "https://example.org/", "permission": "test"},
        evaluation={},
    )
    pack["createdAt"] = "2026-01-01T00:00:00+00:00"
    return {"pack": pack, "input": _encode(x), "logits": [float(v) for v in logits]}


def _decode(entry: dict[str, Any]) -> np.ndarray:
    return np.frombuffer(base64.b64decode(entry["data"]), dtype="<f4").reshape(entry["shape"])


def app_forward(pack: dict[str, Any], x: np.ndarray) -> np.ndarray:
    """NumPy reference of the app's forward pass on one window x (T, inputDim) -> logits.

    Mirrors mobile/src/model/temporalModel.ts step by step (folded weights, exact GELU).
    """
    from math import erf, sqrt

    w = {name: _decode(entry).astype(np.float64) for name, entry in pack["weights"].items()}
    x = np.asarray(x, dtype=np.float64)
    present = x[:, -3] > 0.5
    mean = x.mean(axis=1, keepdims=True)
    var = ((x - mean) ** 2).mean(axis=1, keepdims=True)
    h = (x - mean) / np.sqrt(var + 1e-5) * w["input_norm.weight"] + w["input_norm.bias"]

    def conv(h: np.ndarray, weight: np.ndarray, bias: np.ndarray) -> np.ndarray:
        out_c, _, k = weight.shape
        pad = k // 2
        padded = np.pad(h, ((pad, pad), (0, 0)))
        out = np.empty((h.shape[0], out_c))
        for t in range(h.shape[0]):
            out[t] = np.einsum("oik,ki->o", weight, padded[t : t + k]) + bias
        return out

    gelu = np.vectorize(lambda v: 0.5 * v * (1.0 + erf(v / sqrt(2.0))))
    h = gelu(conv(h, w["conv1.weight"], w["conv1.bias"]))
    h = gelu(conv(h, w["conv2.weight"], w["conv2.bias"]))

    def gru(h: np.ndarray, suffix: str) -> np.ndarray:
        wi, wh = w[f"gru.weight_ih_l0{suffix}"], w[f"gru.weight_hh_l0{suffix}"]
        bi, bh = w[f"gru.bias_ih_l0{suffix}"], w[f"gru.bias_hh_l0{suffix}"]
        size = wh.shape[1]
        state = np.zeros(size)
        out = np.empty((h.shape[0], size))
        sigmoid = lambda v: 1.0 / (1.0 + np.exp(-v))  # noqa: E731
        steps = range(h.shape[0] - 1, -1, -1) if suffix else range(h.shape[0])
        for t in steps:
            gi, gh = wi @ h[t] + bi, wh @ state + bh
            r = sigmoid(gi[:size] + gh[:size])
            z = sigmoid(gi[size : 2 * size] + gh[size : 2 * size])
            n = np.tanh(gi[2 * size :] + r * gh[2 * size :])
            state = (1 - z) * n + z * state
            out[t] = state
        return out

    h = np.concatenate([gru(h, ""), gru(h, "_reverse")], axis=1)
    scores = h @ w["attention.weight"][0] + w["attention.bias"][0]
    mask = present if present.any() else np.ones_like(present)
    scores = np.where(mask, scores, -np.inf)
    weights = np.exp(scores - scores.max())
    weights /= weights.sum()
    pooled = weights @ h
    return w["head.weight"] @ pooled + w["head.bias"]
