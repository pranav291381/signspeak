"""Signer-level train/validation/test splits.

Samples are split by *signer*, never by clip, so the model is always evaluated on
people it has never seen. Splitting clips of the same person across train and
test lets a model memorise individual signing styles and overstates accuracy.
"""

from __future__ import annotations

import json
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

from .annotations import Sample


@dataclass
class SignerSplit:
    version: str
    seed: int
    train: list[str]
    val: list[str]
    test: list[str]

    def split_of(self, signer_id: str) -> str | None:
        for name in ("train", "val", "test"):
            if signer_id in getattr(self, name):
                return name
        return None

    def save(self, path: Path) -> None:
        Path(path).write_text(json.dumps(asdict(self), indent=2, sort_keys=True) + "\n", encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> SignerSplit:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls(**data)


def make_signer_split(
    samples: Sequence[Sample],
    *,
    val_fraction: float = 0.15,
    test_fraction: float = 0.15,
    seed: int = 13,
    version: str = "v1",
) -> SignerSplit:
    """Randomly assign whole signers to train/val/test.

    Requires at least three signers. With few signers the fractions are rounded
    up so validation and test each get at least one person.
    """
    if not (0 < val_fraction < 1 and 0 < test_fraction < 1 and val_fraction + test_fraction < 1):
        raise ValueError("fractions must be in (0, 1) and sum to less than 1")
    signers = sorted({s.signer_id for s in samples})
    if len(signers) < 3:
        raise ValueError(f"need at least 3 signers for a signer-independent split, got {len(signers)}")
    rng = np.random.default_rng(seed)
    order = [signers[i] for i in rng.permutation(len(signers))]
    n_test = max(1, round(len(signers) * test_fraction))
    n_val = max(1, round(len(signers) * val_fraction))
    if n_test + n_val >= len(signers):
        n_test, n_val = 1, 1
    test = sorted(order[:n_test])
    val = sorted(order[n_test : n_test + n_val])
    train = sorted(order[n_test + n_val :])
    return SignerSplit(version=version, seed=seed, train=train, val=val, test=test)


def check_split(split: SignerSplit, samples: Sequence[Sample]) -> tuple[list[str], list[str]]:
    """Return (errors, warnings). Errors make the split unusable."""
    errors: list[str] = []
    warnings: list[str] = []
    groups = {"train": set(split.train), "val": set(split.val), "test": set(split.test)}
    for a, b in (("train", "val"), ("train", "test"), ("val", "test")):
        overlap = groups[a] & groups[b]
        if overlap:
            errors.append(f"signers in both {a} and {b}: {sorted(overlap)}")

    assigned = set().union(*groups.values())
    unassigned = sorted({s.signer_id for s in samples} - assigned)
    if unassigned:
        errors.append(f"signers not assigned to any split: {unassigned}")

    labels_by_split: dict[str, set[str]] = defaultdict(set)
    for s in samples:
        name = split.split_of(s.signer_id)
        if name:
            labels_by_split[name].add(s.label)
    for name in ("val", "test"):
        missing = sorted(labels_by_split["train"] - labels_by_split[name])
        if missing:
            warnings.append(f"labels with no {name} samples (cannot be evaluated): {missing}")
        unseen = sorted(labels_by_split[name] - labels_by_split["train"])
        if unseen:
            warnings.append(f"labels in {name} but not in train: {unseen}")
    return errors, warnings


def samples_for(split: SignerSplit, samples: Sequence[Sample], name: str) -> list[Sample]:
    signers = set(getattr(split, name))
    return [s for s in samples if s.signer_id in signers]
