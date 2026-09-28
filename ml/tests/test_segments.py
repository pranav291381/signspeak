"""Whole-sign (segment) models: cutting and resampling signs, network inputs, the transformer, the fixture."""

import json
import sys
from pathlib import Path

import numpy as np
import pytest
import torch

from signspeak_ml.models.segment_transformer import SegmentTransformer, TransformerConfig, transformer_weights

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import train_segments as ts  # noqa: E402

FIXTURE = Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "segment_parity_v2.json"


def frames_with(raised_rows: list[int], count: int = 20) -> np.ndarray:
    """A person in view; the left hand raised (wrist above the resting height) in the given rows."""
    frames = np.zeros((count, 156), dtype=np.float32)
    frames[:, 153] = 1
    frames[:, 154] = 1
    frames[:, 28] = 1.6  # left hand wrist y: resting
    frames[:, 16] = frames[:, 19] = 1.6  # pose wrists y: resting
    frames[raised_rows, 28] = 0.2
    return frames


def test_segment_keeps_two_frames_either_side_of_the_raised_ones():
    frames = frames_with(list(range(6, 12)))
    frames[:, 0] = np.arange(20)  # frame numbers, to see which were kept
    assert ts.segment(frames)[:, 0].tolist() == list(range(4, 14))


def test_segment_keeps_everything_when_nothing_is_raised():
    frames = frames_with([])
    assert len(ts.segment(frames)) == 20


def test_resample_interpolates_linearly():
    x = np.array([[0.0, 10.0], [2.0, 20.0], [4.0, 40.0]], dtype=np.float32)
    np.testing.assert_allclose(ts.resample(x, 5), [[0, 10], [1, 15], [2, 20], [3, 30], [4, 40]])
    np.testing.assert_allclose(ts.resample(x[:1], 3), [[0, 10]] * 3)


def test_network_input_shapes_keep_presence_last():
    frames = frames_with(list(range(3, 15)))
    plain = ts.network_input(frames, "xy")
    rich = ts.network_input(frames, "xy+hands+vel")
    assert plain.shape == (ts.SEGMENT_FRAMES, 105)
    assert rich.shape == (ts.SEGMENT_FRAMES, 105 + 84 + 102)
    np.testing.assert_allclose(rich[:, -3:], plain[:, -3:])


def test_augmentation_keeps_the_frame_layout():
    frames = frames_with(list(range(3, 15)))
    out = ts.augment(frames, np.random.default_rng(0))
    assert out.shape[1] == 156 and 4 <= len(out) <= len(frames)
    # Absent points stay exactly zero.
    assert np.all(out[out[:, 155] < 0.5][:, 90:153] == 0)


def test_transformer_forward_and_exported_weights():
    config = TransformerConfig(num_classes=5, input_dim=105, frames=32, width=16, layers=2, heads=4)
    model = SegmentTransformer(config).eval()
    assert model(torch.zeros(2, 32, 105)).shape == (2, 5)
    with pytest.raises(ValueError):
        model(torch.zeros(2, 16, 105))
    weights = transformer_weights(model)
    assert weights["position"].shape == (32, 16)
    assert weights["layers.1.attention.in.weight"].shape == (48, 16)
    assert weights["layers.1.ff2.weight"].shape == (16, 32)


def test_member_entry_names_each_architecture():
    config = TransformerConfig(num_classes=3, input_dim=105, frames=32, width=8, layers=1, heads=2)
    entry = ts.member_entry("tf", "xy", SegmentTransformer(config).eval())
    assert entry["architecture"] == "segment-transformer-v1"
    expected = {"inputDim": 105, "frames": 32, "width": 8, "layers": 1, "heads": 2, "numClasses": 3}
    assert entry["config"] == expected


def test_committed_fixture_is_a_segment_pack():
    """shared/fixtures/segment_parity_v2.json is what the app's parity test checks against."""
    assert FIXTURE.is_file(), "run: python scripts/make_segment_fixture.py"
    fixture = json.loads(FIXTURE.read_text())
    pack = fixture["pack"]
    assert pack["version"] == ts.SEGMENT_PACK_VERSION and pack["mode"] == "segment"
    assert [m["architecture"] for m in pack["members"]] == [
        "temporal-conv-bigru-v1",
        "temporal-conv-bigru-v1",
        "segment-transformer-v1",
    ]
    assert len(fixture["logits"]) == len(pack["labels"])
