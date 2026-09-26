"""InferenceEngine: model pack + landmark window -> ranked label probabilities.

Mirrors the app's ``SignRecognizer`` interface (mobile/src/recognition/types.ts):
it only scores a window. Deciding whether to *show* a result is the stabilizer's
job, which applies confidence, margin and stability rules.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import numpy as np
import torch

from ..evaluation.calibration import softmax
from ..features.sequence import fit_window
from ..features.spec import FRAME_DIM
from .pack import load_model_pack


@dataclass(frozen=True)
class ScoredLabel:
    label: str
    score: float


@dataclass(frozen=True)
class Prediction:
    scores: list[ScoredLabel]  # highest first
    latency_ms: float

    @property
    def top(self) -> ScoredLabel:
        return self.scores[0]


class SignRecognizer(Protocol):
    @property
    def info(self) -> dict: ...

    def predict(self, window: np.ndarray) -> Prediction: ...


class InferenceEngine:
    def __init__(self, pack_dir: Path, device: str = "cpu"):
        self.model, self.manifest = load_model_pack(Path(pack_dir), device)
        self.device = device
        self.labels: list[str] = list(self.manifest["labels"])
        self.window_frames: int = int(self.manifest["window_frames"])
        self.temperature: float = float(self.manifest["calibration"]["temperature"])

    @property
    def info(self) -> dict:
        return {
            "id": self.manifest["model_id"],
            "kind": "remote",
            "labels": self.labels,
            "calibrated": bool(self.manifest["calibrated"]),
            "feature_spec_version": self.manifest["feature_spec_version"],
            "window_frames": self.window_frames,
        }

    @torch.no_grad()
    def predict(self, window: np.ndarray) -> Prediction:
        array = np.asarray(window, dtype=np.float32)
        if array.ndim != 2 or array.shape[1] != FRAME_DIM:
            raise ValueError(f"window must be (T, {FRAME_DIM}), got {array.shape}")
        if not np.all(np.isfinite(array)):
            raise ValueError("window contains non-finite values")
        array = fit_window(array, self.window_frames)
        start = time.perf_counter()
        logits = self.model(torch.from_numpy(array)[None].to(self.device)).cpu().numpy()
        probs = softmax(logits, self.temperature)[0]
        latency = (time.perf_counter() - start) * 1000
        order = np.argsort(-probs)
        return Prediction([ScoredLabel(self.labels[i], float(probs[i])) for i in order], latency)
