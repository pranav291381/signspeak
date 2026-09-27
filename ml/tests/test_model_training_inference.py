import json

import numpy as np
import pytest
import torch

from signspeak_ml.cli import main
from signspeak_ml.data.dataset import DatasetLoader
from signspeak_ml.data.splits import make_signer_split
from signspeak_ml.data.synthetic import write_synthetic_dataset
from signspeak_ml.evaluation.calibration import fit_temperature
from signspeak_ml.evaluation.evaluator import Evaluator
from signspeak_ml.features.spec import FRAME_DIM
from signspeak_ml.inference.engine import InferenceEngine
from signspeak_ml.inference.pack import ModelPackError, load_model_pack, save_model_pack
from signspeak_ml.models.temporal import ModelConfig, TemporalSignClassifier, count_parameters
from signspeak_ml.training.trainer import ModelTrainer, TrainConfig, class_weights, set_seed


class TestModel:
    def test_output_shape_and_size_budget(self):
        model = TemporalSignClassifier(ModelConfig(num_classes=40)).eval()
        x = torch.zeros(3, 32, FRAME_DIM)
        x[..., -3] = 1
        assert model(x).shape == (3, 40)
        # Must stay small enough for phones (see docs/product-spec.md: < 15 MB per pack).
        assert count_parameters(model) < 1_000_000

    def test_empty_window_gives_finite_output(self):
        model = TemporalSignClassifier(ModelConfig(num_classes=3)).eval()
        assert torch.isfinite(model(torch.zeros(1, 32, FRAME_DIM))).all()

    def test_partially_empty_window_gives_finite_output(self):
        torch.manual_seed(0)
        model = TemporalSignClassifier(ModelConfig(num_classes=3)).eval()
        x = torch.randn(2, 32, FRAME_DIM)
        x[..., -3] = 1
        x[:, 20:] = 0  # trailing frames: nobody in view (excluded from attention pooling)
        assert torch.isfinite(model(x)).all()

    def test_rejects_wrong_input_shape(self):
        with pytest.raises(ValueError):
            TemporalSignClassifier(ModelConfig(num_classes=3))(torch.zeros(1, 32, 10))

    def test_needs_two_classes(self):
        with pytest.raises(ValueError):
            TemporalSignClassifier(ModelConfig(num_classes=1))


def test_class_weights_favour_rare_classes():
    weights = class_weights([0, 0, 0, 1], 3)
    assert weights[1] > weights[0]
    assert weights[2] == 0


@pytest.fixture(scope="module")
def trained(tmp_path_factory):
    """Train on SYNTHETIC patterns (not ISL) to verify the pipeline end to end."""
    root = tmp_path_factory.mktemp("synthetic")
    samples = write_synthetic_dataset(root, signers=10, samples_per_signer_label=4, seed=0)
    make_signer_split(samples, seed=2).save(root / "splits" / "v1.json")
    splits = DatasetLoader(root).load(seed=0)
    set_seed(0)
    model = TemporalSignClassifier(ModelConfig(num_classes=len(splits.labels)))
    result = ModelTrainer(TrainConfig(epochs=15, batch_size=16, patience=6, seed=0), log=lambda _: None).fit(
        model, splits.train, splits.val
    )
    return root, splits, model, result


def test_training_learns_and_generalises_to_unseen_signers(trained):
    _, splits, model, result = trained
    assert result.best_val_macro_f1 > 0.8
    report = Evaluator(model, splits.labels).evaluate(splits.test, "test")
    assert report.n_signers >= 1
    assert report.metrics["accuracy"] > 0.8
    assert set(report.per_signer) == set(splits.test.signer_ids())
    assert report.latency_ms["median"] > 0
    assert "Macro F1" in report.to_markdown()
    json.loads(report.to_json())


def test_training_is_reproducible(tmp_path):
    samples = write_synthetic_dataset(tmp_path, signers=5, samples_per_signer_label=2, seed=0)
    make_signer_split(samples, seed=1).save(tmp_path / "splits" / "v1.json")
    results = []
    for _ in range(2):
        splits = DatasetLoader(tmp_path).load(seed=0)
        set_seed(0)
        model = TemporalSignClassifier(ModelConfig(num_classes=len(splits.labels)))
        ModelTrainer(TrainConfig(epochs=2, batch_size=8, seed=0), log=lambda _: None).fit(
            model, splits.train, splits.val
        )
        results.append([p.detach().clone() for p in model.parameters()])
    for a, b in zip(*results, strict=True):
        torch.testing.assert_close(a, b)


def test_training_without_validation_runs_every_epoch(tmp_path):
    """A final model on every recording: fixed epochs, last weights kept."""
    samples = write_synthetic_dataset(tmp_path, signers=4, samples_per_signer_label=2, seed=0)
    make_signer_split(samples, seed=1).save(tmp_path / "splits" / "v1.json")
    splits = DatasetLoader(tmp_path).load(seed=0)
    set_seed(0)
    model = TemporalSignClassifier(ModelConfig(num_classes=len(splits.labels)))
    before = [p.detach().clone() for p in model.parameters()]
    result = ModelTrainer(TrainConfig(epochs=3, batch_size=8, seed=0), log=lambda _: None).fit(
        model, splits.train, None
    )
    assert result.best_epoch == 2
    assert [row["epoch"] for row in result.history] == [0, 1, 2]
    assert all("val_macro_f1" not in row for row in result.history)
    assert any(not torch.equal(a, b) for a, b in zip(before, model.parameters(), strict=True))


def test_trainer_requires_held_out_signers(trained):
    _, splits, model, _ = trained
    empty = splits.val
    original = empty.samples, empty.targets, empty.sequences
    empty.samples, empty.targets, empty.sequences = [], [], []
    try:
        with pytest.raises(ValueError, match="validation set is empty"):
            ModelTrainer(TrainConfig(epochs=1)).fit(model, splits.train, empty)
    finally:
        empty.samples, empty.targets, empty.sequences = original


class TestModelPack:
    def save(self, trained, directory, test_ece=0.01):
        _, splits, model, _ = trained
        logits, y = Evaluator(model, splits.labels).logits(splits.val)
        return save_model_pack(
            directory,
            model,
            splits.labels,
            model_id="synthetic-test",
            temperature=fit_temperature(logits, y),
            test_ece=test_ece,
            evaluation={"accuracy": 1.0},
            dataset={"root_name": "synthetic"},
        )

    def test_round_trip_and_inference(self, trained, tmp_path):
        _, splits, model, _ = trained
        pack = self.save(trained, tmp_path / "pack")
        engine = InferenceEngine(pack)
        assert engine.info["labels"] == splits.labels
        assert engine.info["calibrated"] is True
        predictions = [engine.predict(seq) for seq in splits.test.sequences]
        correct = [p.top.label == s.label for p, s in zip(predictions, splits.test.samples, strict=True)]
        assert np.mean(correct) > 0.8  # unseen (synthetic) signers
        for prediction in predictions:
            assert sum(s.score for s in prediction.scores) == pytest.approx(1.0, abs=1e-5)
            assert prediction.scores == sorted(prediction.scores, key=lambda s: -s.score)

    def test_calibration_is_only_claimed_when_verified(self, trained, tmp_path):
        assert InferenceEngine(self.save(trained, tmp_path / "a", test_ece=0.2)).info["calibrated"] is False
        assert InferenceEngine(self.save(trained, tmp_path / "b", test_ece=None)).info["calibrated"] is False

    def test_detects_tampered_weights(self, trained, tmp_path):
        pack = self.save(trained, tmp_path / "pack")
        with (pack / "model.pt").open("ab") as handle:
            handle.write(b"x")
        with pytest.raises(ModelPackError, match="checksum"):
            load_model_pack(pack)

    def test_refuses_other_feature_spec_versions(self, trained, tmp_path):
        pack = self.save(trained, tmp_path / "pack")
        manifest = json.loads((pack / "manifest.json").read_text())
        manifest["feature_spec_version"] = 99
        (pack / "manifest.json").write_text(json.dumps(manifest))
        with pytest.raises(ModelPackError, match="feature spec"):
            load_model_pack(pack)

    def test_engine_validates_input(self, trained, tmp_path):
        engine = InferenceEngine(self.save(trained, tmp_path / "pack"))
        with pytest.raises(ValueError):
            engine.predict(np.zeros((32, 10)))
        with pytest.raises(ValueError):
            engine.predict(np.full((32, FRAME_DIM), np.nan))
        # Short windows are padded like the app does.
        assert len(engine.predict(np.zeros((5, FRAME_DIM))).scores) == len(engine.labels)


def test_cli_end_to_end(tmp_path, capsys):
    root = tmp_path / "data"
    assert main(["synthetic-demo", "--out", str(root), "--signers", "6"]) == 0
    assert main(["validate-annotations", "--root", str(root)]) == 0
    assert main(["make-splits", "--root", str(root), "--version", "v1"]) == 1  # exists: splits are versioned
    assert main(["make-splits", "--root", str(root), "--version", "v2"]) == 0
    pack = tmp_path / "pack"
    assert main(["train", "--root", str(root), "--split", "v2", "--out", str(pack), "--epochs", "2"]) == 0
    for name in ("manifest.json", "model.pt", "evaluation.json", "evaluation.md", "training_history.json"):
        assert (pack / name).is_file()
    assert main(["evaluate", "--pack", str(pack), "--root", str(root), "--split", "v2", "--json"]) == 0
    out = capsys.readouterr().out
    assert "SYNTHETIC (not ISL)" in out
