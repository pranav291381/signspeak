"""Model packs: a directory with ``manifest.json`` + ``model.pt``.

The manifest is what the app and backend read to decide whether a pack is usable:
feature spec version, labels, window size, calibration and headline evaluation.
Weights are verified by SHA-256 before loading.
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import torch

from ..data.annotations import UNKNOWN_LABEL
from ..features.spec import FEATURE_SPEC_VERSION, TARGET_FPS, WINDOW_FRAMES
from ..models.temporal import ModelConfig, TemporalSignClassifier

PACK_FORMAT_VERSION = 1
MANIFEST_FILE = "manifest.json"
WEIGHTS_FILE = "model.pt"
# Maximum expected calibration error (on test signers) for a pack to be marked calibrated.
MAX_CALIBRATED_ECE = 0.05


class ModelPackError(RuntimeError):
    pass


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def save_model_pack(
    directory: Path,
    model: TemporalSignClassifier,
    labels: list[str],
    *,
    model_id: str,
    temperature: float,
    test_ece: float | None,
    evaluation: dict[str, Any],
    dataset: dict[str, Any],
    notes: str = "",
) -> Path:
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    weights = directory / WEIGHTS_FILE
    torch.save(model.state_dict(), weights)
    manifest = {
        "format_version": PACK_FORMAT_VERSION,
        "model_id": model_id,
        "created_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "feature_spec_version": FEATURE_SPEC_VERSION,
        "target_fps": TARGET_FPS,
        "window_frames": WINDOW_FRAMES,
        "labels": labels,
        "unknown_label": UNKNOWN_LABEL if UNKNOWN_LABEL in labels else None,
        "architecture": "TemporalSignClassifier",
        "model_config": model.config.to_dict(),
        "calibration": {
            "method": "temperature",
            "temperature": temperature,
            "fitted_on": "val",
            "test_ece": test_ece,
        },
        # Only claim calibration if it was verified on held-out signers.
        "calibrated": test_ece is not None and test_ece <= MAX_CALIBRATED_ECE,
        "evaluation": evaluation,
        "dataset": dataset,
        "weights_sha256": _sha256(weights),
        "notes": notes,
    }
    (directory / MANIFEST_FILE).write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return directory


def read_manifest(directory: Path) -> dict[str, Any]:
    path = Path(directory) / MANIFEST_FILE
    if not path.is_file():
        raise ModelPackError(f"no {MANIFEST_FILE} in {directory}")
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("format_version") != PACK_FORMAT_VERSION:
        raise ModelPackError(f"unsupported pack format {manifest.get('format_version')}")
    if manifest.get("feature_spec_version") != FEATURE_SPEC_VERSION:
        raise ModelPackError(
            f"pack expects feature spec v{manifest.get('feature_spec_version')}, "
            f"this code produces v{FEATURE_SPEC_VERSION}"
        )
    return manifest


def load_model_pack(directory: Path, device: str = "cpu") -> tuple[TemporalSignClassifier, dict[str, Any]]:
    directory = Path(directory)
    manifest = read_manifest(directory)
    weights = directory / WEIGHTS_FILE
    if not weights.is_file():
        raise ModelPackError(f"missing {WEIGHTS_FILE}")
    if _sha256(weights) != manifest.get("weights_sha256"):
        raise ModelPackError("weights checksum mismatch: the pack is corrupt or was modified")
    model = TemporalSignClassifier(ModelConfig(**manifest["model_config"]))
    state = torch.load(weights, map_location=device, weights_only=True)
    model.load_state_dict(state)
    model.eval()
    return model.to(device), manifest
