"""Evaluator: runs a model over a split and reports everything in docs/model-evaluation.md."""

from __future__ import annotations

import json
import time
from collections.abc import Sequence
from dataclasses import asdict, dataclass, field

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader

from ..data.annotations import UNKNOWN_LABEL
from ..data.dataset import LandmarkWindowDataset
from ..features.spec import FRAME_DIM, WINDOW_FRAMES
from .calibration import expected_calibration_error, softmax
from .metrics import classification_report, per_group_accuracy, selective_metrics

# Mirrors the app's defaults (mobile/src/recognition/config.ts).
DEFAULT_THRESHOLDS = (0.5, 0.7, 0.85)


@dataclass
class EvaluationReport:
    split: str
    n_samples: int
    n_signers: int
    labels: list[str]
    temperature: float
    metrics: dict
    per_signer: dict
    selective: list[dict]
    ece: float
    latency_ms: dict
    notes: list[str] = field(default_factory=list)

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2, ensure_ascii=False)

    def to_markdown(self) -> str:
        m = self.metrics
        lines = [
            f"### Evaluation on `{self.split}` ({self.n_samples} samples, {self.n_signers} unseen signers)",
            "",
            "| Metric | Value |",
            "| --- | --- |",
            f"| Accuracy | {m['accuracy']:.3f} |",
            f"| Macro precision | {m['macro_precision']:.3f} |",
            f"| Macro recall | {m['macro_recall']:.3f} |",
            f"| Macro F1 | {m['macro_f1']:.3f} |",
            f"| Expected calibration error | {self.ece:.3f} (temperature {self.temperature:.2f}) |",
            f"| Latency per window (CPU, median / p95) | {self.latency_ms['median']:.1f} / "
            f"{self.latency_ms['p95']:.1f} ms |",
            "",
            "| Threshold | Coverage | Accuracy when shown | Wrong sign shown |",
            "| --- | --- | --- | --- |",
        ]
        for s in self.selective:
            acc = "—" if s["selective_accuracy"] is None else f"{s['selective_accuracy']:.3f}"
            lines.append(
                f"| {s['threshold']:.2f} | {s['coverage']:.3f} | {acc} | {s['wrong_shown_rate']:.3f} |"
            )
        lines += ["", "| Sign | Precision | Recall | F1 | Support |", "| --- | --- | --- | --- | --- |"]
        for label, c in m["per_class"].items():
            lines.append(
                f"| {label} | {c['precision']:.3f} | {c['recall']:.3f} | {c['f1']:.3f} | {c['support']} |"
            )
        lines += ["", "| Signer | Accuracy | Samples |", "| --- | --- | --- |"]
        for signer, g in self.per_signer.items():
            lines.append(f"| {signer} | {g['accuracy']:.3f} | {g['n']} |")
        lines += [f"- {note}" for note in self.notes]
        return "\n".join(lines) + "\n"


class Evaluator:
    def __init__(
        self, model: nn.Module, labels: Sequence[str], temperature: float = 1.0, device: str = "cpu"
    ):
        self.model = model.to(device)
        self.labels = list(labels)
        self.temperature = temperature
        self.device = device

    @torch.no_grad()
    def logits(self, dataset: LandmarkWindowDataset, batch_size: int = 64) -> tuple[np.ndarray, np.ndarray]:
        self.model.eval()
        outs, targets = [], []
        for x, y in DataLoader(dataset, batch_size=batch_size, shuffle=False):
            outs.append(self.model(x.to(self.device)).cpu().numpy())
            targets.append(y.numpy())
        if not outs:
            return np.zeros((0, len(self.labels))), np.zeros(0, dtype=int)
        return np.concatenate(outs), np.concatenate(targets)

    @torch.no_grad()
    def measure_latency(self, repeats: int = 30, window: int = WINDOW_FRAMES) -> dict:
        """Single-window (batch of 1) latency on this machine's CPU. Phones differ: measure on device too."""
        self.model.eval()
        x = torch.zeros(1, window, FRAME_DIM, device=self.device)
        x[..., -3:] = 1.0
        self.model(x)  # warm-up
        times = []
        for _ in range(repeats):
            start = time.perf_counter()
            self.model(x)
            times.append((time.perf_counter() - start) * 1000)
        return {
            "median": float(np.median(times)),
            "p95": float(np.percentile(times, 95)),
            "device": self.device,
        }

    def evaluate(
        self,
        dataset: LandmarkWindowDataset,
        split: str,
        thresholds: Sequence[float] = DEFAULT_THRESHOLDS,
    ) -> EvaluationReport:
        logits, y = self.logits(dataset)
        probs = softmax(logits, self.temperature) if len(y) else logits
        pred = probs.argmax(axis=1) if len(y) else y
        signers = dataset.signer_ids()
        unknown = self.labels.index(UNKNOWN_LABEL) if UNKNOWN_LABEL in self.labels else None
        notes = []
        if unknown is None:
            notes.append("No unknown class in the label set: non-sign movement is not modelled.")
        if len(set(signers)) < 5:
            notes.append(f"Only {len(set(signers))} evaluation signers: results have high variance.")
        return EvaluationReport(
            split=split,
            n_samples=int(len(y)),
            n_signers=len(set(signers)),
            labels=self.labels,
            temperature=float(self.temperature),
            metrics=classification_report(y, pred, self.labels),
            per_signer=per_group_accuracy(y, pred, signers),
            selective=selective_metrics(probs, y, thresholds, unknown),
            ece=expected_calibration_error(probs, y) if len(y) else 0.0,
            latency_ms=self.measure_latency(),
            notes=notes,
        )
