"""Dataset loading: annotations + processed feature files -> fixed-length windows.

Layout under the dataset root (see docs/dataset.md)::

    raw/          original videos (never committed)
    processed/    <sample_id>.npy, float32 (T, FRAME_DIM) at TARGET_FPS
    annotations/  annotations.jsonl
    splits/       <version>.json (signer-level)
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import Dataset

from ..features.augment import AugmentConfig, augmented_window
from ..features.sequence import fit_window
from ..features.spec import FRAME_DIM, WINDOW_FRAMES
from .annotations import UNKNOWN_LABEL, Sample, load_annotations
from .splits import SignerSplit, check_split, samples_for


def build_label_map(samples: Sequence[Sample]) -> list[str]:
    """Sorted label list; the unknown class (if present) is always index 0."""
    labels = sorted({s.label for s in samples} - {UNKNOWN_LABEL})
    if any(s.label == UNKNOWN_LABEL for s in samples):
        labels.insert(0, UNKNOWN_LABEL)
    return labels


def load_features(features_dir: Path, sample_id: str) -> np.ndarray:
    path = Path(features_dir) / f"{sample_id}.npy"
    array = np.load(path, allow_pickle=False)
    if array.ndim != 2 or array.shape[1] != FRAME_DIM:
        raise ValueError(f"{path}: expected (T, {FRAME_DIM}), got {array.shape}")
    if not np.all(np.isfinite(array)):
        raise ValueError(f"{path}: contains non-finite values")
    return array.astype(np.float32)


class LandmarkWindowDataset(Dataset):
    """One fixed-length window per sample. Training crops/augments randomly."""

    def __init__(
        self,
        samples: Sequence[Sample],
        features_dir: Path,
        labels: Sequence[str],
        *,
        window: int = WINDOW_FRAMES,
        train: bool = False,
        augment: AugmentConfig | None = None,
        seed: int = 0,
    ):
        index = {label: i for i, label in enumerate(labels)}
        unknown = sorted({s.label for s in samples} - set(index))
        if unknown:
            raise ValueError(f"labels not in label map: {unknown}")
        self.samples = list(samples)
        self.labels = list(labels)
        self.targets = [index[s.label] for s in self.samples]
        self.sequences = [load_features(features_dir, s.sample_id) for s in self.samples]
        self.window = window
        self.train = train
        self.augment = augment or AugmentConfig(enabled=train)
        self.rng = np.random.default_rng(seed)

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, i: int) -> tuple[torch.Tensor, int]:
        sequence = self.sequences[i]
        if self.train:
            window = augmented_window(sequence, self.rng, self.window, self.augment)
        else:
            window = fit_window(sequence, self.window)
        return torch.from_numpy(window), self.targets[i]

    def signer_ids(self) -> list[str]:
        return [s.signer_id for s in self.samples]


@dataclass
class DatasetSplits:
    labels: list[str]
    train: LandmarkWindowDataset
    val: LandmarkWindowDataset
    test: LandmarkWindowDataset
    warnings: list[str]


class DatasetLoader:
    """Loads a dataset root and returns signer-independent train/val/test datasets."""

    def __init__(self, root: Path, split_version: str = "v1", window: int = WINDOW_FRAMES):
        self.root = Path(root)
        self.split_version = split_version
        self.window = window

    @property
    def annotations_path(self) -> Path:
        return self.root / "annotations" / "annotations.jsonl"

    @property
    def split_path(self) -> Path:
        return self.root / "splits" / f"{self.split_version}.json"

    def load(self, *, seed: int = 0, augment: AugmentConfig | None = None) -> DatasetSplits:
        report = load_annotations(self.annotations_path)
        if not report.ok:
            raise ValueError("invalid annotations:\n" + "\n".join(report.errors[:20]))
        split = SignerSplit.load(self.split_path)
        errors, warnings = check_split(split, report.samples)
        if errors:
            raise ValueError("invalid split:\n" + "\n".join(errors))
        train_samples = samples_for(split, report.samples, "train")
        labels = build_label_map(train_samples)
        known = set(labels)
        features = self.root / "processed"

        def make(name: str, train: bool) -> LandmarkWindowDataset:
            chosen = [s for s in samples_for(split, report.samples, name) if s.label in known]
            return LandmarkWindowDataset(
                chosen, features, labels, window=self.window, train=train, augment=augment, seed=seed
            )

        return DatasetSplits(labels, make("train", True), make("val", False), make("test", False), warnings)
