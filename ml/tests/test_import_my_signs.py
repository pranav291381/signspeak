"""Turning the app's "Export my signs" files into training recordings."""

import base64
import json
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import import_my_signs as ims  # noqa: E402
from train_from_landmarks import decode, slug  # noqa: E402


def take(frames: np.ndarray) -> dict:
    data = np.round(frames * 1000).astype("<i2").tobytes()
    return {"frames": len(frames), "dim": 156, "data": base64.b64encode(data).decode(), "recordedAt": ""}


def export(signs: list[dict]) -> dict:
    return {
        "format": "signspeak.my-signs",
        "version": 1,
        "featureSpecVersion": 1,
        "frameDim": 156,
        "fps": 15,
        "signs": signs,
    }


def frames(count: int = 8, seed: int = 0) -> np.ndarray:
    values = np.random.default_rng(seed).uniform(-2, 2, (count, 156)).astype(np.float32)
    values[:, 153:] = 1
    return np.round(values * 1000) / 1000


def sign(target: dict, takes: list[np.ndarray]) -> dict:
    return {"id": "x", "target": target, "samples": [take(f) for f in takes]}


def test_vocabulary_takes_become_training_rows_with_the_models_label():
    original = frames()
    rows = ims.import_export(
        export(
            [
                sign(
                    {
                        "kind": "vocabulary",
                        "label": "include:good-morning",
                        "text": "Good morning",
                        "language": "en",
                    },
                    [original, frames(seed=1)],
                )
            ]
        ),
        contributor="c01",
    )
    assert len(rows) == 2
    assert slug(rows[0]["text"]) == "good-morning"
    assert rows[0]["group"].startswith("personal/c01/x/")
    assert rows[0]["group"] != rows[1]["group"]
    # The trainer reads the row back as the same x/y and presence flags (depth dropped).
    back = decode(rows[0]["recording"])
    expected = original.copy()
    expected[:, 2:153:3] = 0
    np.testing.assert_allclose(back, expected, atol=1e-3)


def test_own_words_and_letters_only_when_asked_and_other_packs_never():
    signs = [
        sign({"kind": "custom", "text": "Chai", "language": "en"}, [frames(seed=1)]),
        sign({"kind": "letter", "letter": "a"}, [frames(seed=2)]),
        sign(
            {"kind": "vocabulary", "label": "other:water", "text": "Water", "language": "en"},
            [frames(seed=3)],
        ),
    ]
    assert ims.import_export(export(signs), contributor="c01") == []
    rows = ims.import_export(export(signs), contributor="c01", own=True)
    assert [(r["text"], r["category"]) for r in rows] == [("Chai", "Own words"), ("letter a", "Letters")]


def test_rejects_files_that_are_not_exports_or_use_another_feature_spec():
    with pytest.raises(ValueError, match="format"):
        ims.import_export({"format": "something-else", "version": 1}, contributor="c01")
    with pytest.raises(ValueError, match="feature spec"):
        ims.import_export({**export([]), "frameDim": 105}, contributor="c01")


def test_command_line_writes_jsonl(tmp_path, capsys):
    path = tmp_path / "export.json"
    path.write_text(
        json.dumps(
            export(
                [
                    sign(
                        {
                            "kind": "vocabulary",
                            "label": "include:teacher",
                            "text": "Teacher",
                            "language": "en",
                        },
                        [frames()],
                    )
                ]
            )
        )
    )
    out = tmp_path / "my-signs.jsonl"
    assert ims.main([str(path), "--contributor", "c01", "--out", str(out)]) == 0
    rows = [json.loads(line) for line in out.read_text().splitlines()]
    assert [r["text"] for r in rows] == ["teacher"]
    assert "1 takes of 1 signs" in capsys.readouterr().err


def test_a_later_export_does_not_repeat_takes_already_imported():
    teacher = {"kind": "vocabulary", "label": "include:teacher", "text": "Teacher", "language": "en"}
    first, second = frames(seed=1), frames(seed=2)
    seen, skipped = set(), ims.Counter()
    rows = ims.import_export(export([sign(teacher, [first])]), "c01", seen=seen, skipped=skipped)
    rows += ims.import_export(export([sign(teacher, [first, second])]), "c01", seen=seen, skipped=skipped)
    assert len(rows) == 2
    assert skipped["takes already imported"] == 1


def test_unreadable_takes_and_other_frame_rates_are_not_imported():
    teacher = {"kind": "vocabulary", "label": "include:teacher", "text": "Teacher", "language": "en"}
    broken = {**take(frames()), "dim": 105}
    skipped = ims.Counter()
    rows = ims.import_export(export([sign(teacher, [frames()])]), "c01", skipped=skipped)
    data = export([sign(teacher, [frames(seed=3)])])
    data["signs"][0]["samples"].append(broken)
    rows = ims.import_export(data, "c01", skipped=skipped)
    assert len(rows) == 1 and skipped["unreadable takes"] == 1
    with pytest.raises(ValueError, match="frame rate"):
        ims.import_export({**export([]), "fps": 30}, contributor="c01")
