"""Confidence calibration.

The app only shows confidence bands for recognizers whose scores are calibrated
(docs/architecture.md §6.4). Calibration is fitted on the validation signers
(temperature scaling) and checked on the test signers (expected calibration error).
"""

from __future__ import annotations

import numpy as np


def softmax(logits: np.ndarray, temperature: float = 1.0) -> np.ndarray:
    z = np.asarray(logits, dtype=float) / temperature
    z -= z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


def negative_log_likelihood(logits: np.ndarray, y_true: np.ndarray, temperature: float = 1.0) -> float:
    probs = softmax(logits, temperature)
    picked = probs[np.arange(len(y_true)), np.asarray(y_true, dtype=int)]
    return float(-np.log(np.clip(picked, 1e-12, 1.0)).mean())


def fit_temperature(logits: np.ndarray, y_true: np.ndarray, low: float = 0.25, high: float = 10.0) -> float:
    """Temperature minimising NLL (coarse log-grid then local refinement)."""
    if len(y_true) == 0:
        return 1.0
    grid = np.exp(np.linspace(np.log(low), np.log(high), 200))
    losses = [negative_log_likelihood(logits, y_true, t) for t in grid]
    best = int(np.argmin(losses))
    lo, hi = grid[max(best - 1, 0)], grid[min(best + 1, len(grid) - 1)]
    fine = np.linspace(lo, hi, 50)
    return float(fine[int(np.argmin([negative_log_likelihood(logits, y_true, t) for t in fine]))])


def expected_calibration_error(probs: np.ndarray, y_true: np.ndarray, bins: int = 15) -> float:
    """Weighted gap between confidence and accuracy across confidence bins."""
    probs = np.asarray(probs, dtype=float)
    y_true = np.asarray(y_true, dtype=int)
    if len(y_true) == 0:
        return 0.0
    conf = probs.max(axis=1)
    correct = probs.argmax(axis=1) == y_true
    edges = np.linspace(0.0, 1.0, bins + 1)
    ece = 0.0
    for lo, hi in zip(edges[:-1], edges[1:], strict=True):
        in_bin = (conf > lo) & (conf <= hi)
        if in_bin.any():
            ece += in_bin.mean() * abs(correct[in_bin].mean() - conf[in_bin].mean())
    return float(ece)
