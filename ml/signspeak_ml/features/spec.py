"""Feature contract v1 shared by training (Python) and inference (mobile).

Any change here that alters the vector layout or normalization MUST bump
``FEATURE_SPEC_VERSION`` and regenerate ``shared/feature_spec_v1.json`` (or a new
versioned file). Model packs record the version they were trained with and the
app refuses packs with a different version.

Per-frame vector layout (156 floats):

    [ pose (9 x 3) | left hand (21 x 3) | right hand (21 x 3) | presence (3) ]

* Pose points are a subset of MediaPipe Pose (33-point topology).
* Hand points follow MediaPipe Hands (21-point topology). "Left"/"right" are the
  handedness labels reported by MediaPipe on **unmirrored** frames.
* x and y are body-centred: origin at the shoulder midpoint, scaled by the
  shoulder width, so the vector is robust to camera distance and framing while
  keeping where the hands are relative to the body (location matters in ISL).
  z keeps MediaPipe's own reference (hip midpoint for pose, wrist for hands) and
  is only divided by the shoulder width.
* A missing hand is all zeros with its presence flag set to 0. A frame without a
  detected pose is all zeros with every presence flag 0 (the app treats such
  frames as "no signer").
* Face landmarks (non-manual markers) are reserved for a future version.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass

FEATURE_SPEC_VERSION = 1

# MediaPipe Pose indices used (upper body only; legs are rarely in frame).
POSE_LANDMARKS: dict[str, int] = {
    "nose": 0,
    "left_shoulder": 11,
    "right_shoulder": 12,
    "left_elbow": 13,
    "right_elbow": 14,
    "left_wrist": 15,
    "right_wrist": 16,
    "left_hip": 23,
    "right_hip": 24,
}

HAND_LANDMARK_COUNT = 21
COORDS = 3  # x, y, z

POSE_DIM = len(POSE_LANDMARKS) * COORDS
HAND_DIM = HAND_LANDMARK_COUNT * COORDS
PRESENCE_FLAGS = ("pose_present", "left_hand_present", "right_hand_present")
FRAME_DIM = POSE_DIM + 2 * HAND_DIM + len(PRESENCE_FLAGS)

POSE_SLICE = slice(0, POSE_DIM)
LEFT_HAND_SLICE = slice(POSE_DIM, POSE_DIM + HAND_DIM)
RIGHT_HAND_SLICE = slice(POSE_DIM + HAND_DIM, POSE_DIM + 2 * HAND_DIM)
PRESENCE_SLICE = slice(POSE_DIM + 2 * HAND_DIM, FRAME_DIM)

TARGET_FPS = 15
WINDOW_FRAMES = 32  # ~2.1 s at 15 fps
MIN_SHOULDER_WIDTH = 1e-3  # below this the pose is considered degenerate


@dataclass(frozen=True)
class FeatureSpec:
    version: int
    frame_dim: int
    target_fps: int
    window_frames: int
    pose_landmarks: dict[str, int]
    hand_landmark_count: int
    coords: int
    layout: dict[str, list[int]]
    presence_flags: tuple[str, ...]
    normalization: str
    handedness: str


def current_spec() -> FeatureSpec:
    return FeatureSpec(
        version=FEATURE_SPEC_VERSION,
        frame_dim=FRAME_DIM,
        target_fps=TARGET_FPS,
        window_frames=WINDOW_FRAMES,
        pose_landmarks=dict(POSE_LANDMARKS),
        hand_landmark_count=HAND_LANDMARK_COUNT,
        coords=COORDS,
        layout={
            "pose": [POSE_SLICE.start, POSE_SLICE.stop],
            "left_hand": [LEFT_HAND_SLICE.start, LEFT_HAND_SLICE.stop],
            "right_hand": [RIGHT_HAND_SLICE.start, RIGHT_HAND_SLICE.stop],
            "presence": [PRESENCE_SLICE.start, PRESENCE_SLICE.stop],
        },
        presence_flags=PRESENCE_FLAGS,
        normalization=(
            "Input x in normalized image coordinates (x / image width, as MediaPipe reports it); "
            "y in the same units (MediaPipe's y x image height / image width), so features do not "
            "depend on the image's shape (portrait or landscape); z as reported by MediaPipe "
            "(pose: relative to hip midpoint, hands: relative to the wrist). "
            "origin = midpoint(left_shoulder, right_shoulder) in (x, y); "
            "scale = euclidean distance between the shoulders in (x, y); "
            "x' = (x - origin_x) / scale, y' = (y - origin_y) / scale, z' = z / scale"
        ),
        handedness="MediaPipe handedness labels on unmirrored frames",
    )


def spec_json() -> str:
    """Canonical JSON for shared/feature_spec_v<N>.json."""
    data = asdict(current_spec())
    data["presence_flags"] = list(data["presence_flags"])
    return json.dumps(data, indent=2, sort_keys=True) + "\n"
