"""Training-time augmentation on normalized feature sequences.

Every augmentation here must be validated with ISL experts before relying on it.
In particular, mirroring (swapping the dominant hand) is valid for most signs and
helps left-handed signers, but it can be wrong for signs whose meaning depends
on a specific side. Disable it per label if educators flag such signs.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .sequence import fit_window
from .spec import (
    COORDS,
    LEFT_HAND_SLICE,
    POSE_LANDMARKS,
    POSE_SLICE,
    PRESENCE_SLICE,
    RIGHT_HAND_SLICE,
)

_POSE_NAMES = list(POSE_LANDMARKS)
_POSE_MIRROR_ORDER = [
    _POSE_NAMES.index(name.replace("left", "@").replace("right", "left").replace("@", "right"))
    for name in _POSE_NAMES
]


def _xyz(frames: np.ndarray, s: slice) -> np.ndarray:
    return frames[:, s].reshape(len(frames), -1, COORDS)


def mirror(frames: np.ndarray) -> np.ndarray:
    """Left/right mirror: negate x, swap hands and left/right pose points."""
    out = frames.copy()
    pose = _xyz(frames, POSE_SLICE)[:, _POSE_MIRROR_ORDER].copy()
    pose[..., 0] *= -1
    out[:, POSE_SLICE] = pose.reshape(len(frames), -1)
    left = _xyz(frames, LEFT_HAND_SLICE).copy()
    right = _xyz(frames, RIGHT_HAND_SLICE).copy()
    left[..., 0] *= -1
    right[..., 0] *= -1
    out[:, LEFT_HAND_SLICE] = right.reshape(len(frames), -1)
    out[:, RIGHT_HAND_SLICE] = left.reshape(len(frames), -1)
    flags = frames[:, PRESENCE_SLICE]
    out[:, PRESENCE_SLICE] = flags[:, [0, 2, 1]]
    return out


def _transform_points(frames: np.ndarray, scale: float, angle: float, shift: np.ndarray) -> np.ndarray:
    out = frames.copy()
    cos, sin = np.cos(angle), np.sin(angle)
    rot = np.array([[cos, -sin], [sin, cos]], dtype=np.float32)
    present = frames[:, PRESENCE_SLICE]
    for s, flag in ((POSE_SLICE, 0), (LEFT_HAND_SLICE, 1), (RIGHT_HAND_SLICE, 2)):
        pts = _xyz(frames, s).copy()
        pts[..., :2] = (pts[..., :2] @ rot.T) * scale + shift
        pts[..., 2] *= scale
        pts[present[:, flag] < 0.5] = 0.0  # keep absent parts exactly zero
        out[:, s] = pts.reshape(len(frames), -1)
    return out


def time_warp(frames: np.ndarray, factor: float) -> np.ndarray:
    """Play the sequence faster (>1) or slower (<1) with nearest-frame sampling."""
    length = max(1, int(round(len(frames) / factor)))
    idx = np.clip(np.round(np.linspace(0, len(frames) - 1, length)).astype(int), 0, len(frames) - 1)
    return frames[idx]


@dataclass
class AugmentConfig:
    mirror_prob: float = 0.5
    scale_range: tuple[float, float] = (0.9, 1.1)
    max_rotation_rad: float = 0.12
    max_shift: float = 0.1
    speed_range: tuple[float, float] = (0.8, 1.25)
    hand_dropout_prob: float = 0.05
    enabled: bool = True


def augment(frames: np.ndarray, rng: np.random.Generator, config: AugmentConfig | None = None) -> np.ndarray:
    """Randomly augment a (T, D) sequence. Returns a new array; length may change."""
    config = config or AugmentConfig()
    if not config.enabled or len(frames) == 0:
        return frames.copy()
    out = frames
    if rng.random() < config.mirror_prob:
        out = mirror(out)
    out = time_warp(out, float(rng.uniform(*config.speed_range)))
    out = _transform_points(
        out,
        scale=float(rng.uniform(*config.scale_range)),
        angle=float(rng.uniform(-config.max_rotation_rad, config.max_rotation_rad)),
        shift=rng.uniform(-config.max_shift, config.max_shift, size=2).astype(np.float32),
    )
    if config.hand_dropout_prob > 0:
        # Simulate brief tracking loss of a hand.
        for s, flag in ((LEFT_HAND_SLICE, 1), (RIGHT_HAND_SLICE, 2)):
            drop = rng.random(len(out)) < config.hand_dropout_prob
            out[drop, s] = 0.0
            out[drop, PRESENCE_SLICE.start + flag] = 0.0
    return out.astype(np.float32)


def augmented_window(
    frames: np.ndarray, rng: np.random.Generator, window: int, config: AugmentConfig
) -> np.ndarray:
    return fit_window(augment(frames, rng, config), window, rng=rng)


__all__ = ["AugmentConfig", "augment", "augmented_window", "mirror", "time_warp"]
