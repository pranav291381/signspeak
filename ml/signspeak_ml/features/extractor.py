"""Video -> landmark feature sequence.

``FeatureExtractor`` is the interface; ``MediaPipeFeatureExtractor`` is the first
implementation. MediaPipe and OpenCV are optional dependencies
(``pip install -e ".[mediapipe]"``) and the MediaPipe ``.task`` model files must be
downloaded separately from Google's official model cards and passed by path.
Nothing here uploads video anywhere; processing is local.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

import numpy as np

from .normalize import normalize_frame
from .sequence import resample_sequence
from .spec import FRAME_DIM, TARGET_FPS


@dataclass
class ExtractedSequence:
    frames: np.ndarray  # (T, FRAME_DIM) at TARGET_FPS
    source_fps: float
    frames_with_signer: int


class FeatureExtractor(Protocol):
    def extract(
        self, video_path: Path, start_ms: int | None = None, end_ms: int | None = None
    ) -> ExtractedSequence: ...


def _landmarks_to_array(landmarks: Any) -> np.ndarray:
    return np.array([[lm.x, lm.y, lm.z] for lm in landmarks], dtype=np.float32)


def frame_from_mediapipe(pose_result: Any, hand_result: Any) -> np.ndarray:
    """Convert MediaPipe Tasks results for one image into a feature-spec frame.

    Only the first detected pose is used. Hands are assigned by MediaPipe's
    handedness label (see feature spec notes on mirroring).
    """
    pose = None
    if pose_result is not None and getattr(pose_result, "pose_landmarks", None):
        pose = _landmarks_to_array(pose_result.pose_landmarks[0])
    left = right = None
    if hand_result is not None and getattr(hand_result, "hand_landmarks", None):
        best: dict[str, tuple[float, np.ndarray]] = {}
        for landmarks, handedness in zip(hand_result.hand_landmarks, hand_result.handedness, strict=False):
            category = handedness[0]
            name = category.category_name.lower()
            if name not in ("left", "right"):
                continue
            if name not in best or category.score > best[name][0]:
                best[name] = (category.score, _landmarks_to_array(landmarks))
        left = best.get("left", (0.0, None))[1]
        right = best.get("right", (0.0, None))[1]
    return normalize_frame(pose, left, right)


class MediaPipeFeatureExtractor:
    """Extract features with MediaPipe Pose + Hand landmarkers (Tasks API, VIDEO mode)."""

    def __init__(self, pose_model: Path, hand_model: Path, min_confidence: float = 0.5):
        try:
            import mediapipe as mp  # noqa: F401
        except ImportError as exc:  # pragma: no cover - depends on optional extra
            raise RuntimeError('MediaPipe is not installed. Run: pip install -e ".[mediapipe]"') from exc
        for path in (pose_model, hand_model):
            if not Path(path).is_file():
                raise FileNotFoundError(f"MediaPipe model file not found: {path} (see ml/README.md)")
        self.pose_model = Path(pose_model)
        self.hand_model = Path(hand_model)
        self.min_confidence = min_confidence

    def extract(
        self, video_path: Path, start_ms: int | None = None, end_ms: int | None = None
    ) -> ExtractedSequence:  # pragma: no cover - needs MediaPipe models and video fixtures
        import cv2
        import mediapipe as mp

        vision = mp.tasks.vision
        base = mp.tasks.BaseOptions
        pose_options = vision.PoseLandmarkerOptions(
            base_options=base(model_asset_path=str(self.pose_model)),
            running_mode=vision.RunningMode.VIDEO,
            min_pose_detection_confidence=self.min_confidence,
        )
        hand_options = vision.HandLandmarkerOptions(
            base_options=base(model_asset_path=str(self.hand_model)),
            running_mode=vision.RunningMode.VIDEO,
            num_hands=2,
            min_hand_detection_confidence=self.min_confidence,
        )
        capture = cv2.VideoCapture(str(video_path))
        if not capture.isOpened():
            raise RuntimeError(f"Could not open video: {video_path}")
        fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
        frames: list[np.ndarray] = []
        stamps: list[float] = []
        try:
            with (
                vision.PoseLandmarker.create_from_options(pose_options) as pose_landmarker,
                vision.HandLandmarker.create_from_options(hand_options) as hand_landmarker,
            ):
                index = 0
                while True:
                    ok, bgr = capture.read()
                    if not ok:
                        break
                    timestamp = int(index * 1000.0 / fps)
                    index += 1
                    if start_ms is not None and timestamp < start_ms:
                        continue
                    if end_ms is not None and timestamp > end_ms:
                        break
                    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
                    image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                    frames.append(
                        frame_from_mediapipe(
                            pose_landmarker.detect_for_video(image, timestamp),
                            hand_landmarker.detect_for_video(image, timestamp),
                        )
                    )
                    stamps.append(float(timestamp))
        finally:
            capture.release()

        if not frames:
            return ExtractedSequence(np.zeros((0, FRAME_DIM), np.float32), fps, 0)
        resampled = resample_sequence(np.stack(frames), np.array(stamps), TARGET_FPS)
        present = int(np.sum(resampled[:, -3] > 0.5))
        return ExtractedSequence(resampled, fps, present)
