"""Temporal handling: resample to the spec frame rate and fit fixed-length windows."""

from __future__ import annotations

import numpy as np

from .spec import FRAME_DIM, TARGET_FPS, WINDOW_FRAMES


def resample_sequence(
    frames: np.ndarray,
    timestamps_ms: np.ndarray,
    target_fps: int = TARGET_FPS,
) -> np.ndarray:
    """Nearest-frame resampling to a fixed rate.

    Nearest (not linear) interpolation keeps presence flags binary and never
    invents hand positions between a detected and a missing hand.
    """
    frames = np.asarray(frames, dtype=np.float32)
    timestamps_ms = np.asarray(timestamps_ms, dtype=np.float64)
    if frames.ndim != 2 or frames.shape[1] != FRAME_DIM:
        raise ValueError(f"frames must be (T, {FRAME_DIM}), got {frames.shape}")
    if len(frames) != len(timestamps_ms):
        raise ValueError("frames and timestamps must have the same length")
    if len(frames) == 0:
        return frames.reshape(0, FRAME_DIM)
    if np.any(np.diff(timestamps_ms) < 0):
        raise ValueError("timestamps must be non-decreasing")

    step = 1000.0 / target_fps
    targets = np.arange(timestamps_ms[0], timestamps_ms[-1] + 1e-6, step)
    idx = np.searchsorted(timestamps_ms, targets)
    idx = np.clip(idx, 1, len(timestamps_ms) - 1) if len(timestamps_ms) > 1 else np.zeros_like(idx)
    if len(timestamps_ms) > 1:
        left = idx - 1
        choose_left = (targets - timestamps_ms[left]) <= (timestamps_ms[idx] - targets)
        idx = np.where(choose_left, left, idx)
    return frames[idx]


def fit_window(
    sequence: np.ndarray,
    window: int = WINDOW_FRAMES,
    *,
    rng: np.random.Generator | None = None,
) -> np.ndarray:
    """Crop or zero-pad a (T, D) sequence to (window, D).

    With ``rng`` the crop position is random (training); otherwise centred
    (evaluation). Padding uses all-zero frames, i.e. "no signer".
    """
    sequence = np.asarray(sequence, dtype=np.float32)
    length = len(sequence)
    if length >= window:
        start = int(rng.integers(0, length - window + 1)) if rng is not None else (length - window) // 2
        return sequence[start : start + window]
    out = np.zeros((window, sequence.shape[1]), dtype=np.float32)
    offset = int(rng.integers(0, window - length + 1)) if rng is not None else (window - length) // 2
    out[offset : offset + length] = sequence
    return out


def sliding_windows(sequence: np.ndarray, window: int = WINDOW_FRAMES, stride: int = 4) -> np.ndarray:
    """All (window, D) windows with the given stride, as used by the app at inference."""
    sequence = np.asarray(sequence, dtype=np.float32)
    if len(sequence) < window:
        return fit_window(sequence, window)[None]
    starts = range(0, len(sequence) - window + 1, stride)
    return np.stack([sequence[s : s + window] for s in starts])
