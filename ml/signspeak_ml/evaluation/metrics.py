"""Classification metrics in plain numpy (no scikit-learn dependency)."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence

import numpy as np


def confusion_matrix(y_true: np.ndarray, y_pred: np.ndarray, num_classes: int) -> np.ndarray:
    """Rows are true classes, columns are predicted classes."""
    y_true = np.asarray(y_true, dtype=int)
    y_pred = np.asarray(y_pred, dtype=int)
    if y_true.shape != y_pred.shape:
        raise ValueError("y_true and y_pred must have the same shape")
    cm = np.zeros((num_classes, num_classes), dtype=int)
    np.add.at(cm, (y_true, y_pred), 1)
    return cm


def per_class_metrics(cm: np.ndarray) -> dict[str, np.ndarray]:
    """Precision, recall, F1 and support per class. Undefined values are 0."""
    tp = np.diag(cm).astype(float)
    predicted = cm.sum(axis=0).astype(float)
    support = cm.sum(axis=1).astype(float)
    with np.errstate(divide="ignore", invalid="ignore"):
        precision = np.where(predicted > 0, tp / predicted, 0.0)
        recall = np.where(support > 0, tp / support, 0.0)
        f1 = np.where(precision + recall > 0, 2 * precision * recall / (precision + recall), 0.0)
    return {"precision": precision, "recall": recall, "f1": f1, "support": support.astype(int)}


def classification_report(y_true: np.ndarray, y_pred: np.ndarray, labels: Sequence[str]) -> dict:
    """Accuracy, macro/weighted averages, per-class metrics and confusion matrix.

    Macro averages are taken over classes that occur in ``y_true`` so that a
    class absent from an evaluation split does not silently count as zero.
    """
    y_true = np.asarray(y_true, dtype=int)
    y_pred = np.asarray(y_pred, dtype=int)
    cm = confusion_matrix(y_true, y_pred, len(labels))
    m = per_class_metrics(cm)
    present = m["support"] > 0
    total = max(int(m["support"].sum()), 1)
    weights = m["support"] / total

    def macro(values: np.ndarray) -> float:
        return float(values[present].mean()) if present.any() else 0.0

    return {
        "n": int(len(y_true)),
        "accuracy": float((y_true == y_pred).mean()) if len(y_true) else 0.0,
        "macro_precision": macro(m["precision"]),
        "macro_recall": macro(m["recall"]),
        "macro_f1": macro(m["f1"]),
        "weighted_f1": float((m["f1"] * weights).sum()),
        "per_class": {
            label: {
                "precision": float(m["precision"][i]),
                "recall": float(m["recall"][i]),
                "f1": float(m["f1"][i]),
                "support": int(m["support"][i]),
            }
            for i, label in enumerate(labels)
        },
        "confusion_matrix": cm.tolist(),
        "labels": list(labels),
    }


def per_group_accuracy(y_true: np.ndarray, y_pred: np.ndarray, groups: Sequence[str]) -> dict[str, dict]:
    """Accuracy per group (e.g. per signer), to spot people the model fails for."""
    totals: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for t, p, g in zip(y_true, y_pred, groups, strict=True):
        totals[g][0] += int(t == p)
        totals[g][1] += 1
    return {g: {"accuracy": c / n, "n": n} for g, (c, n) in sorted(totals.items())}


def selective_metrics(
    probs: np.ndarray,
    y_true: np.ndarray,
    thresholds: Sequence[float],
    unknown_index: int | None = None,
) -> list[dict]:
    """What the app would show at each confidence threshold.

    For each threshold, a prediction is *shown* if its top probability reaches the
    threshold and it is not the unknown class; otherwise the app says "not sure".

    * coverage: fraction of samples where something is shown
    * selective_accuracy: accuracy among shown predictions
    * wrong_shown_rate: fraction of ALL samples where a WRONG sign is shown.
      This is the key safety number: it should be as low as possible.
    """
    probs = np.asarray(probs, dtype=float)
    y_true = np.asarray(y_true, dtype=int)
    top = probs.argmax(axis=1)
    conf = probs.max(axis=1)
    out = []
    n = max(len(y_true), 1)
    for threshold in thresholds:
        shown = conf >= threshold
        if unknown_index is not None:
            shown &= top != unknown_index
        correct = shown & (top == y_true)
        wrong = shown & (top != y_true)
        out.append(
            {
                "threshold": float(threshold),
                "coverage": float(shown.sum() / n),
                "selective_accuracy": float(correct.sum() / shown.sum()) if shown.any() else None,
                "wrong_shown_rate": float(wrong.sum() / n),
            }
        )
    return out
