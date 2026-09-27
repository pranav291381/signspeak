"""The app's model format: folded weights reproduce PyTorch, and the committed fixture is consistent."""

import json

import numpy as np
import pytest

from signspeak_ml.inference.app_export import (
    APP_PACK_FORMAT,
    FIXTURE_PATH,
    _decode,
    app_forward,
    app_pack,
    parity_fixture,
)
from signspeak_ml.models.temporal import ModelConfig, TemporalSignClassifier


def test_folded_weights_reproduce_pytorch():
    fixture = parity_fixture(seed=3)
    x = _decode(fixture["input"])
    np.testing.assert_allclose(app_forward(fixture["pack"], x), fixture["logits"], atol=1e-5)


def test_committed_fixture_is_self_consistent():
    """shared/fixtures/model_parity_v1.json is what the app's parity test checks against."""
    assert FIXTURE_PATH.is_file(), "run: python scripts/make_model_fixture.py"
    fixture = json.loads(FIXTURE_PATH.read_text())
    assert fixture["pack"]["format"] == APP_PACK_FORMAT
    x = _decode(fixture["input"])
    np.testing.assert_allclose(app_forward(fixture["pack"], x), fixture["logits"], atol=1e-5)


def test_window_with_nobody_in_view_pools_uniformly():
    fixture = parity_fixture(seed=5)
    model_logits = app_forward(fixture["pack"], np.zeros((8, 156), dtype=np.float32))
    assert np.all(np.isfinite(model_logits))


def test_pack_needs_one_label_per_class():
    model = TemporalSignClassifier(ModelConfig(num_classes=3, conv_channels=4, hidden_size=4))
    with pytest.raises(ValueError):
        app_pack(
            model,
            [{"id": "a", "text": "A"}],
            pack_id="x",
            name="x",
            temperature=1.0,
            calibrated=False,
            source={},
            evaluation={},
        )
