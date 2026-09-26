import json

import numpy as np
import pytest

from signspeak_ml.data.annotations import UNKNOWN_LABEL, Sample, parse_records
from signspeak_ml.data.dataset import DatasetLoader, build_label_map
from signspeak_ml.data.splits import SignerSplit, check_split, make_signer_split
from signspeak_ml.data.synthetic import write_synthetic_dataset
from signspeak_ml.features.spec import FRAME_DIM


def record(**overrides):
    base = {
        "sample_id": "s0001",
        "signer_id": "sg_0042",
        "label": "hello",
        "video": "sg_0042/clip_0001.mp4",
        "start_ms": 100,
        "end_ms": 1500,
        "language_context": "isl",
        "metadata": {
            "consent_ref": "c-001",
            "annotator_id": "an_01",
            "annotation_version": 1,
            "handedness": "right",
        },
    }
    base.update(overrides)
    return json.dumps(base)


def sample(sample_id: str, signer: str, label: str) -> Sample:
    return Sample(sample_id, signer, label, f"{signer}/{sample_id}.mp4", 0, 1000, "isl", {"consent_ref": "c"})


class TestAnnotations:
    def test_accepts_a_valid_record(self):
        report = parse_records([record()])
        assert report.ok, report.errors
        assert report.samples[0].duration_ms == 1400

    @pytest.mark.parametrize("key", ["name", "phone", "email", "aadhaar"])
    def test_rejects_personal_data(self, key):
        meta = {"consent_ref": "c", "annotator_id": "a", "annotation_version": 1, key: "x"}
        report = parse_records([record(metadata=meta)])
        assert any("personal data" in e for e in report.errors)

    def test_requires_consent_reference(self):
        report = parse_records([record(metadata={"annotator_id": "a", "annotation_version": 1})])
        assert any("consent_ref" in e for e in report.errors)

    @pytest.mark.parametrize("signer_id", ["Priya Sharma", "sg_", "42", "priya@example.com"])
    def test_signer_id_must_be_a_pseudonym(self, signer_id):
        assert not parse_records([record(signer_id=signer_id)]).ok

    @pytest.mark.parametrize("video", ["/etc/passwd", "../outside.mp4", "a\\b.mp4", ""])
    def test_video_must_stay_inside_raw(self, video):
        assert not parse_records([record(video=video)]).ok

    def test_rejects_bad_timestamps_and_labels(self):
        assert not parse_records([record(start_ms=500, end_ms=500)]).ok
        assert not parse_records([record(start_ms=True)]).ok
        assert not parse_records([record(label="Hello World")]).ok
        assert parse_records([record(label=UNKNOWN_LABEL)]).ok

    def test_reports_duplicates_and_bad_json_by_line(self):
        report = parse_records([record(), record(), "{oops", "[]", ""])
        assert len(report.samples) == 1
        assert any("line 2" in e and "duplicate" in e for e in report.errors)
        assert any("line 3" in e and "invalid JSON" in e for e in report.errors)
        assert any("line 4" in e for e in report.errors)

    def test_rejects_unexpected_fields(self):
        data = json.loads(record())
        data["extra"] = 1
        assert not parse_records([json.dumps(data)]).ok


class TestSplits:
    samples = [
        sample(f"s{i}_{label}", f"sg_{i:04d}", label) for i in range(10) for label in ("hello", "water")
    ]

    def test_signers_never_appear_in_two_splits(self):
        split = make_signer_split(self.samples, seed=3)
        groups = [set(split.train), set(split.val), set(split.test)]
        assert not (groups[0] & groups[1]) and not (groups[0] & groups[2]) and not (groups[1] & groups[2])
        assert set().union(*groups) == {s.signer_id for s in self.samples}
        assert check_split(split, self.samples) == ([], [])

    def test_deterministic_for_a_seed(self):
        assert make_signer_split(self.samples, seed=5) == make_signer_split(self.samples, seed=5)
        assert make_signer_split(self.samples, seed=5) != make_signer_split(self.samples, seed=6)

    def test_needs_at_least_three_signers(self):
        with pytest.raises(ValueError, match="at least 3 signers"):
            make_signer_split(self.samples[:4])

    def test_detects_leakage_and_unassigned_signers(self):
        split = SignerSplit("bad", 0, train=["sg_0000", "sg_0001"], val=["sg_0001"], test=["sg_0002"])
        errors, _ = check_split(split, self.samples)
        assert any("both train and val" in e for e in errors)
        assert any("not assigned" in e for e in errors)

    def test_warns_when_a_label_cannot_be_evaluated(self):
        samples = [*self.samples, sample("rare", "sg_0000", "doctor")]
        split = SignerSplit(
            "v", 0, train=[f"sg_{i:04d}" for i in range(8)], val=["sg_0008"], test=["sg_0009"]
        )
        _, warnings = check_split(split, samples)
        assert any("doctor" in w and "test" in w for w in warnings)

    def test_save_and_load(self, tmp_path):
        split = make_signer_split(self.samples)
        split.save(tmp_path / "v1.json")
        assert SignerSplit.load(tmp_path / "v1.json") == split


class TestDataset:
    def test_label_map_puts_unknown_first(self):
        samples = [
            sample("a", "sg_0001", "water"),
            sample("b", "sg_0001", UNKNOWN_LABEL),
            sample("c", "sg_0001", "hello"),
        ]
        assert build_label_map(samples) == [UNKNOWN_LABEL, "hello", "water"]

    def test_loads_signer_independent_windows(self, tmp_path):
        samples = write_synthetic_dataset(tmp_path, signers=6, samples_per_signer_label=2)
        make_signer_split(samples, seed=1).save(tmp_path / "splits" / "v1.json")
        splits = DatasetLoader(tmp_path).load(seed=0)
        assert len(splits.labels) == 4
        x, y = splits.train[0]
        assert tuple(x.shape) == (32, FRAME_DIM)
        assert 0 <= y < 4
        train_signers = set(splits.train.signer_ids())
        assert not train_signers & set(splits.test.signer_ids())
        assert not train_signers & set(splits.val.signer_ids())

    def test_rejects_corrupt_feature_files(self, tmp_path):
        samples = write_synthetic_dataset(tmp_path, signers=3, samples_per_signer_label=1)
        np.save(
            tmp_path / "processed" / f"{samples[0].sample_id}.npy",
            np.full((5, FRAME_DIM), np.nan, np.float32),
        )
        make_signer_split(samples).save(tmp_path / "splits" / "v1.json")
        with pytest.raises(ValueError, match="non-finite"):
            DatasetLoader(tmp_path).load()

    def test_refuses_leaky_split_files(self, tmp_path):
        samples = write_synthetic_dataset(tmp_path, signers=3, samples_per_signer_label=1)
        SignerSplit("v1", 0, train=["sg_syn000", "sg_syn001"], val=["sg_syn001"], test=["sg_syn002"]).save(
            tmp_path / "splits" / "v1.json"
        )
        with pytest.raises(ValueError, match="invalid split"):
            DatasetLoader(tmp_path).load()
        assert samples
