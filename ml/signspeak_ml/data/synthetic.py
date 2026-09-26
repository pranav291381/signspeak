"""SYNTHETIC landmark data for automated tests and pipeline smoke checks ONLY.

These sequences are geometric motion patterns (circles, lines, holds). They are
not ISL, carry no information about how any sign is made, and a model trained on
them must never be used or reported as a sign recognizer.
"""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

import numpy as np

from ..features.spec import (
    HAND_LANDMARK_COUNT,
    LEFT_HAND_SLICE,
    POSE_LANDMARKS,
    POSE_SLICE,
    PRESENCE_SLICE,
    RIGHT_HAND_SLICE,
)
from .annotations import Sample, write_annotations

SYNTHETIC_PATTERNS = ("circle", "horizontal", "vertical", "hold")


def _trajectory(pattern: str, t: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """(T, 2) hand-centre path in body coordinates for a pattern."""
    phase = rng.uniform(0, 2 * np.pi)
    if pattern == "circle":
        return np.stack(
            [0.4 * np.cos(2 * np.pi * t + phase), -0.6 + 0.4 * np.sin(2 * np.pi * t + phase)], axis=1
        )
    if pattern == "horizontal":
        return np.stack([0.6 * np.sin(2 * np.pi * t + phase), np.full_like(t, -0.5)], axis=1)
    if pattern == "vertical":
        return np.stack([np.full_like(t, 0.3), -0.6 + 0.5 * np.sin(2 * np.pi * t + phase)], axis=1)
    if pattern == "hold":
        return np.stack([np.full_like(t, 0.2), np.full_like(t, -1.0)], axis=1)
    raise ValueError(f"unknown pattern {pattern}")


def synthetic_sequence(pattern: str, length: int, signer_seed: int, rng: np.random.Generator) -> np.ndarray:
    """A (T, FRAME_DIM) sequence with a static body and a moving right hand."""
    signer = np.random.default_rng(signer_seed)
    offset = signer.normal(0, 0.08, size=2)  # per-signer style: position bias
    scale = signer.uniform(0.85, 1.15)  # per-signer style: signing size
    t = np.linspace(0, 1, length)
    centre = _trajectory(pattern, t, rng) * scale + offset
    frames = np.zeros((length, PRESENCE_SLICE.stop), dtype=np.float32)

    pose = np.zeros((len(POSE_LANDMARKS), 3), dtype=np.float32)
    names = list(POSE_LANDMARKS)
    pose[names.index("left_shoulder"), :2] = (0.5, 0.0)
    pose[names.index("right_shoulder"), :2] = (-0.5, 0.0)
    pose[names.index("nose"), :2] = (0.0, -0.8)
    frames[:, POSE_SLICE] = pose.reshape(-1)

    hand_shape = signer.normal(0, 0.05, size=(HAND_LANDMARK_COUNT, 3)).astype(np.float32)
    right = hand_shape[None] + np.concatenate([centre, np.zeros((length, 1))], axis=1)[:, None, :]
    right += rng.normal(0, 0.01, size=right.shape)
    frames[:, RIGHT_HAND_SLICE] = right.reshape(length, -1)
    frames[:, LEFT_HAND_SLICE] = 0.0
    frames[:, PRESENCE_SLICE.start] = 1.0
    frames[:, PRESENCE_SLICE.start + 2] = 1.0
    return frames


def write_synthetic_dataset(
    root: Path,
    *,
    labels: Sequence[str] = ("syn_circle", "syn_horizontal", "syn_vertical", "syn_hold"),
    signers: int = 8,
    samples_per_signer_label: int = 4,
    seed: int = 0,
) -> list[Sample]:
    """Create annotations + processed features under ``root`` (tests only)."""
    if len(labels) > len(SYNTHETIC_PATTERNS):
        raise ValueError(f"at most {len(SYNTHETIC_PATTERNS)} synthetic labels")
    root = Path(root)
    (root / "processed").mkdir(parents=True, exist_ok=True)
    (root / "annotations").mkdir(parents=True, exist_ok=True)
    (root / "splits").mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(seed)
    samples: list[Sample] = []
    for s in range(signers):
        signer_id = f"sg_syn{s:03d}"
        for label, pattern in zip(labels, SYNTHETIC_PATTERNS, strict=False):
            for k in range(samples_per_signer_label):
                sample_id = f"{signer_id}_{label}_{k}"
                length = int(rng.integers(24, 44))
                np.save(
                    root / "processed" / f"{sample_id}.npy",
                    synthetic_sequence(pattern, length, 1000 + s, rng),
                )
                samples.append(
                    Sample(
                        sample_id=sample_id,
                        signer_id=signer_id,
                        label=label,
                        video=f"{signer_id}/{sample_id}.mp4",
                        start_ms=0,
                        end_ms=int(length * 1000 / 15),
                        language_context="synthetic",
                        metadata={
                            "consent_ref": "synthetic",
                            "annotator_id": "synthetic",
                            "annotation_version": 1,
                        },
                    )
                )
    write_annotations(root / "annotations" / "annotations.jsonl", samples)
    return samples
