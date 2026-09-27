import json
from pathlib import Path

import numpy as np
import pytest

from signspeak_ml.features.augment import AugmentConfig, augment, mirror, time_warp
from signspeak_ml.features.normalize import normalize_frame, signer_present
from signspeak_ml.features.sequence import fit_window, resample_sequence, sliding_windows
from signspeak_ml.features.spec import (
    FRAME_DIM,
    LEFT_HAND_SLICE,
    POSE_LANDMARKS,
    POSE_SLICE,
    PRESENCE_SLICE,
    RIGHT_HAND_SLICE,
    current_spec,
    spec_json,
)

SHARED_SPEC = Path(__file__).resolve().parents[2] / "shared" / "feature_spec_v1.json"


def make_pose(ls=(0.6, 0.4), rs=(0.4, 0.4)) -> np.ndarray:
    pose = np.full((33, 4), 0.5, dtype=np.float32)
    pose[:, 2] = 0.0
    pose[POSE_LANDMARKS["left_shoulder"], :2] = ls
    pose[POSE_LANDMARKS["right_shoulder"], :2] = rs
    return pose


def make_hand(center=(0.5, 0.6)) -> np.ndarray:
    hand = np.zeros((21, 3), dtype=np.float32)
    hand[:, :2] = center
    hand[:, 0] += np.linspace(-0.02, 0.02, 21)
    return hand


class TestSpec:
    def test_layout_is_contiguous_and_complete(self):
        spec = current_spec()
        assert spec.frame_dim == FRAME_DIM == 156
        bounds = [spec.layout[k] for k in ("pose", "left_hand", "right_hand", "presence")]
        assert bounds[0][0] == 0
        for (_, end), (start, _) in zip(bounds, bounds[1:], strict=False):
            assert end == start
        assert bounds[-1][1] == FRAME_DIM

    def test_shared_contract_matches_code(self):
        """shared/feature_spec_v1.json is what the app reads; it must never drift."""
        assert SHARED_SPEC.is_file(), (
            "run: signspeak-ml export-feature-spec --out ../shared/feature_spec_v1.json"
        )
        assert json.loads(SHARED_SPEC.read_text()) == json.loads(spec_json())


class TestNormalize:
    def test_body_centred_and_scaled_by_shoulder_width(self):
        frame = normalize_frame(make_pose(), None, None)
        pose = frame[POSE_SLICE].reshape(-1, 3)
        names = list(POSE_LANDMARKS)
        np.testing.assert_allclose(pose[names.index("left_shoulder")], [0.5, 0.0, 0.0], atol=1e-6)
        np.testing.assert_allclose(pose[names.index("right_shoulder")], [-0.5, 0.0, 0.0], atol=1e-6)
        assert frame[PRESENCE_SLICE].tolist() == [1.0, 0.0, 0.0]

    def test_invariant_to_camera_distance_and_position(self):
        near = normalize_frame(make_pose((0.7, 0.4), (0.3, 0.4)), None, make_hand((0.5, 0.7)))
        # Same pose, twice as far away and shifted: halve distances around a new centre.
        far = normalize_frame(make_pose((0.35, 0.3), (0.15, 0.3)), None, make_hand((0.25, 0.45)))
        hand_near = near[RIGHT_HAND_SLICE].reshape(-1, 3)[:, :2]
        hand_far = far[RIGHT_HAND_SLICE].reshape(-1, 3)[:, :2]
        np.testing.assert_allclose(hand_near[:, 1], hand_far[:, 1], atol=1e-5)

    def test_missing_hand_is_zero_with_flag_off(self):
        frame = normalize_frame(make_pose(), make_hand(), None)
        assert frame[PRESENCE_SLICE].tolist() == [1.0, 1.0, 0.0]
        assert not frame[RIGHT_HAND_SLICE].any()
        assert frame[LEFT_HAND_SLICE].any()

    @pytest.mark.parametrize(
        "pose",
        [None, make_pose((0.5, 0.4), (0.5, 0.4))],
        ids=["no pose", "degenerate shoulders"],
    )
    def test_no_signer_frames_are_all_zero(self, pose):
        frame = normalize_frame(pose, make_hand(), make_hand())
        assert frame.shape == (FRAME_DIM,)
        assert not frame.any()

    def test_non_finite_input_is_treated_as_missing(self):
        pose = make_pose()
        pose[POSE_LANDMARKS["nose"], 0] = np.nan
        assert not normalize_frame(pose, None, None).any()
        hand = make_hand()
        hand[3, 1] = np.inf
        assert normalize_frame(make_pose(), hand, None)[PRESENCE_SLICE].tolist() == [1.0, 0.0, 0.0]

    def test_rejects_wrong_shapes(self):
        with pytest.raises(ValueError):
            normalize_frame(np.zeros((10, 3)), None, None)

    def test_signer_present_mask(self):
        frames = np.stack([normalize_frame(make_pose(), None, None), np.zeros(FRAME_DIM, np.float32)])
        assert signer_present(frames).tolist() == [True, False]


class TestSequence:
    def test_resample_30_to_15_fps(self):
        frames = np.arange(30, dtype=np.float32)[:, None] * np.ones((1, FRAME_DIM), np.float32)
        stamps = np.arange(30) * (1000 / 30)
        out = resample_sequence(frames, stamps, 15)
        assert len(out) == 15
        np.testing.assert_array_equal(out[:, 0], np.arange(0, 30, 2))

    def test_resample_validates_input(self):
        with pytest.raises(ValueError):
            resample_sequence(np.zeros((3, FRAME_DIM)), np.array([0, 20, 10]))
        with pytest.raises(ValueError):
            resample_sequence(np.zeros((3, 5)), np.array([0, 10, 20]))

    def test_fit_window_pads_with_no_signer_frames(self):
        seq = np.ones((10, FRAME_DIM), np.float32)
        out = fit_window(seq, 32)
        assert out.shape == (32, FRAME_DIM)
        assert out.sum(axis=1).tolist().count(0.0) == 22
        assert out[11:21].all()  # centred

    def test_fit_window_crops(self):
        seq = np.arange(50, dtype=np.float32)[:, None] * np.ones((1, FRAME_DIM), np.float32)
        assert fit_window(seq, 32)[0, 0] == 9  # centred crop
        random_crop = fit_window(seq, 32, rng=np.random.default_rng(0))
        assert random_crop.shape == (32, FRAME_DIM)

    def test_sliding_windows_match_app_stride(self):
        seq = np.zeros((40, FRAME_DIM), np.float32)
        assert sliding_windows(seq, 32, 4).shape == (3, 32, FRAME_DIM)
        assert sliding_windows(np.zeros((5, FRAME_DIM), np.float32), 32).shape == (1, 32, FRAME_DIM)


class TestAugment:
    def sequence(self) -> np.ndarray:
        return np.stack([normalize_frame(make_pose(), make_hand((0.55, 0.6)), None) for _ in range(20)])

    def test_mirror_twice_is_identity(self):
        seq = self.sequence()
        np.testing.assert_allclose(mirror(mirror(seq)), seq, atol=1e-6)

    def test_mirror_swaps_hands(self):
        mirrored = mirror(self.sequence())
        assert mirrored[0, PRESENCE_SLICE].tolist() == [1.0, 0.0, 1.0]
        assert not mirrored[:, LEFT_HAND_SLICE].any()

    def test_augment_keeps_absent_parts_zero_and_values_finite(self):
        rng = np.random.default_rng(1)
        for _ in range(20):
            out = augment(self.sequence(), rng, AugmentConfig(hand_dropout_prob=0.2))
            assert np.all(np.isfinite(out))
            left_absent = out[:, PRESENCE_SLICE.start + 1] < 0.5
            right_absent = out[:, PRESENCE_SLICE.start + 2] < 0.5
            assert not out[left_absent][:, LEFT_HAND_SLICE].any()
            assert not out[right_absent][:, RIGHT_HAND_SLICE].any()

    def test_time_warp_changes_length(self):
        seq = self.sequence()
        assert len(time_warp(seq, 2.0)) == 10
        assert len(time_warp(seq, 0.5)) == 40

    def test_disabled_augmentation_is_a_copy(self):
        seq = self.sequence()
        out = augment(seq, np.random.default_rng(0), AugmentConfig(enabled=False))
        np.testing.assert_array_equal(out, seq)
        assert out is not seq


class TestMediaPipeConversion:
    """frame_from_mediapipe with stand-in result objects (no MediaPipe models needed)."""

    @staticmethod
    def landmarks(points):
        from types import SimpleNamespace

        return [SimpleNamespace(x=float(x), y=float(y), z=float(z)) for x, y, z in points]

    def result(self, hands):
        from types import SimpleNamespace

        return SimpleNamespace(
            hand_landmarks=[self.landmarks(points) for points, _, _ in hands],
            handedness=[[SimpleNamespace(category_name=name, score=score)] for _, name, score in hands],
        )

    def test_assigns_hands_by_handedness_and_keeps_the_most_confident(self):
        from types import SimpleNamespace

        from signspeak_ml.features.extractor import frame_from_mediapipe

        pose = SimpleNamespace(pose_landmarks=[self.landmarks(make_pose()[:, :3])])
        low, high = make_hand((0.45, 0.6)), make_hand((0.55, 0.7))
        hands = self.result([(low, "Right", 0.6), (high, "Right", 0.9)])
        frame = frame_from_mediapipe(pose, hands)
        assert frame[PRESENCE_SLICE].tolist() == [1.0, 0.0, 1.0]
        expected = normalize_frame(make_pose(), None, high)
        np.testing.assert_allclose(frame, expected, atol=1e-6)

    def test_same_scene_in_portrait_and_landscape_gives_the_same_frame(self):
        from types import SimpleNamespace

        from signspeak_ml.features.extractor import frame_from_mediapipe

        pose_px, hand_px = make_pose()[:, :3] * 1000, make_hand((0.45, 0.6)) * 1000

        def seen(width, height):
            scale = np.array([1 / width, 1 / height, 1 / width])
            pose = SimpleNamespace(pose_landmarks=[self.landmarks(pose_px * scale)])
            return frame_from_mediapipe(pose, self.result([(hand_px * scale, "Right", 0.9)]), height / width)

        np.testing.assert_allclose(seen(1280, 720), seen(720, 1280), atol=1e-5)

    def test_no_pose_means_no_signer(self):
        from types import SimpleNamespace

        from signspeak_ml.features.extractor import frame_from_mediapipe

        frame = frame_from_mediapipe(
            SimpleNamespace(pose_landmarks=[]), self.result([(make_hand(), "Left", 0.9)])
        )
        assert not frame.any()


def test_app_parity_fixture_is_current():
    """shared/fixtures/feature_parity_v1.json pins the app's TypeScript port to this code."""
    from signspeak_ml.features.fixtures import FIXTURE_PATH, fixture_json

    assert FIXTURE_PATH.is_file(), "run: python scripts/make_feature_fixtures.py"
    assert json.loads(FIXTURE_PATH.read_text()) == json.loads(fixture_json())
