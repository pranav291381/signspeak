import numpy as np
import pytest

from signspeak_ml.evaluation.calibration import expected_calibration_error, fit_temperature, softmax
from signspeak_ml.evaluation.metrics import (
    classification_report,
    confusion_matrix,
    per_group_accuracy,
    selective_metrics,
)

LABELS = ["a", "b", "c"]


def test_confusion_matrix_rows_are_true_classes():
    cm = confusion_matrix(np.array([0, 0, 1, 2]), np.array([0, 1, 1, 1]), 3)
    assert cm.tolist() == [[1, 1, 0], [0, 1, 0], [0, 1, 0]]


def test_classification_report_matches_hand_computation():
    y_true = np.array([0, 0, 1, 1, 2, 2])
    y_pred = np.array([0, 1, 1, 1, 2, 0])
    report = classification_report(y_true, y_pred, LABELS)
    # a: P=1/2 R=1/2; b: P=2/3 R=1; c: P=1 R=1/2
    assert report["accuracy"] == pytest.approx(4 / 6)
    assert report["per_class"]["a"]["precision"] == pytest.approx(0.5)
    assert report["per_class"]["b"]["recall"] == pytest.approx(1.0)
    assert report["per_class"]["c"]["f1"] == pytest.approx(2 * 1 * 0.5 / 1.5)
    assert report["macro_recall"] == pytest.approx((0.5 + 1 + 0.5) / 3)
    assert report["confusion_matrix"][2] == [1, 0, 1]


def test_macro_average_ignores_classes_absent_from_the_split():
    report = classification_report(np.array([0, 0]), np.array([0, 0]), LABELS)
    assert report["macro_f1"] == pytest.approx(1.0)
    assert report["per_class"]["c"]["support"] == 0


def test_per_signer_accuracy():
    groups = ["sg_1", "sg_1", "sg_2"]
    result = per_group_accuracy(np.array([0, 1, 2]), np.array([0, 0, 2]), groups)
    assert result == {"sg_1": {"accuracy": 0.5, "n": 2}, "sg_2": {"accuracy": 1.0, "n": 1}}


def test_selective_metrics_count_wrong_signs_shown():
    probs = np.array(
        [
            [0.9, 0.05, 0.05],  # correct, confident
            [0.1, 0.8, 0.1],  # wrong (true 0), confident
            [0.4, 0.3, 0.3],  # correct but unsure -> "not sure"
            [0.05, 0.05, 0.9],  # confident unknown class -> never shown
        ]
    )
    y = np.array([0, 0, 0, 1])
    at_07 = selective_metrics(probs, y, [0.7], unknown_index=2)[0]
    assert at_07["coverage"] == pytest.approx(0.5)
    assert at_07["selective_accuracy"] == pytest.approx(0.5)
    assert at_07["wrong_shown_rate"] == pytest.approx(0.25)
    at_095 = selective_metrics(probs, y, [0.95], unknown_index=2)[0]
    assert at_095 == {"threshold": 0.95, "coverage": 0.0, "selective_accuracy": None, "wrong_shown_rate": 0.0}


def test_ece_is_zero_for_perfectly_calibrated_predictions():
    probs = np.array([[1.0, 0.0], [0.0, 1.0]])
    assert expected_calibration_error(probs, np.array([0, 1])) == pytest.approx(0.0)
    overconfident = np.array([[0.99, 0.01]] * 10)
    y = np.array([0] * 5 + [1] * 5)
    assert expected_calibration_error(overconfident, y) == pytest.approx(0.49, abs=1e-6)


def test_temperature_scaling_softens_overconfident_logits():
    rng = np.random.default_rng(0)
    y = rng.integers(0, 3, size=500)
    clean = np.eye(3)[y] * 2.0 + rng.normal(0, 1.0, size=(500, 3))
    overconfident = clean * 4.0
    t = fit_temperature(overconfident, y)
    assert t > 1.0  # softens overconfident scores
    before = expected_calibration_error(softmax(overconfident), y)
    after = expected_calibration_error(softmax(overconfident, t), y)
    assert after < before


def test_softmax_rows_sum_to_one():
    probs = softmax(np.array([[1000.0, 0.0], [-5.0, 5.0]]))
    np.testing.assert_allclose(probs.sum(axis=1), 1.0)
    assert np.all(np.isfinite(probs))
