"""Landmarks -> feature vector (spec v1). Pure numpy so it is easy to port to the app."""

from __future__ import annotations

import numpy as np
from numpy.typing import ArrayLike

from .spec import (
    FRAME_DIM,
    HAND_LANDMARK_COUNT,
    LEFT_HAND_SLICE,
    MIN_SHOULDER_WIDTH,
    POSE_LANDMARKS,
    POSE_SLICE,
    PRESENCE_SLICE,
    RIGHT_HAND_SLICE,
)

_POSE_INDICES = list(POSE_LANDMARKS.values())
_LEFT_SHOULDER = POSE_LANDMARKS["left_shoulder"]
_RIGHT_SHOULDER = POSE_LANDMARKS["right_shoulder"]


def _as_points(points: ArrayLike, expected: int, name: str) -> np.ndarray:
    arr = np.asarray(points, dtype=np.float32)
    if arr.ndim != 2 or arr.shape[0] != expected or arr.shape[1] < 3:
        raise ValueError(f"{name}: expected shape ({expected}, >=3), got {arr.shape}")
    return arr[:, :3]


def normalize_frame(
    pose: ArrayLike | None,
    left_hand: ArrayLike | None,
    right_hand: ArrayLike | None,
) -> np.ndarray:
    """Build one 156-d frame vector.

    Args:
        pose: 33 MediaPipe pose landmarks (x, y, z[, visibility]) or None.
        left_hand / right_hand: 21 MediaPipe hand landmarks (x, y, z) or None.

    Returns an all-zero vector (every presence flag 0) when the pose is missing,
    degenerate or non-finite: such a frame means "no signer".
    """
    out = np.zeros(FRAME_DIM, dtype=np.float32)
    if pose is None:
        return out
    pose_pts = _as_points(pose, 33, "pose")
    if not np.all(np.isfinite(pose_pts[_POSE_INDICES])):
        return out

    origin = (pose_pts[_LEFT_SHOULDER, :2] + pose_pts[_RIGHT_SHOULDER, :2]) / 2.0
    scale = float(np.linalg.norm(pose_pts[_LEFT_SHOULDER, :2] - pose_pts[_RIGHT_SHOULDER, :2]))
    if not np.isfinite(scale) or scale < MIN_SHOULDER_WIDTH:
        return out

    def body_frame(points: np.ndarray) -> np.ndarray:
        result = np.empty_like(points)
        result[:, :2] = (points[:, :2] - origin) / scale
        result[:, 2] = points[:, 2] / scale
        return result.reshape(-1)

    out[POSE_SLICE] = body_frame(pose_pts[_POSE_INDICES])
    out[PRESENCE_SLICE.start] = 1.0

    for hand, hand_slice, flag in (
        (left_hand, LEFT_HAND_SLICE, PRESENCE_SLICE.start + 1),
        (right_hand, RIGHT_HAND_SLICE, PRESENCE_SLICE.start + 2),
    ):
        if hand is None:
            continue
        pts = _as_points(hand, HAND_LANDMARK_COUNT, "hand")
        if not np.all(np.isfinite(pts)):
            continue
        out[hand_slice] = body_frame(pts)
        out[flag] = 1.0
    return out


def signer_present(frames: np.ndarray) -> np.ndarray:
    """Boolean mask (T,) of frames where a pose was detected."""
    return frames[..., PRESENCE_SLICE.start] > 0.5
