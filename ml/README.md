# signspeak-ml

Landmark-based ISL recognition pipeline: dataset validation, signer-level splits, feature extraction, a small temporal model, training, calibration, evaluation and model packs.

> **No trained model and no dataset are included.** Models must be trained on an authorized, consented dataset ([`docs/dataset.md`](../docs/dataset.md)) and pass the release criteria in [`docs/model-evaluation.md`](../docs/model-evaluation.md). The tests use **synthetic** motion patterns that are not ISL.

## Setup

```bash
cd ml
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"             # numpy, torch, pytest, ruff
pip install -e ".[mediapipe]"       # only needed to extract landmarks from video
pytest
ruff check . && ruff format --check .
```

PyTorch from PyPI on Linux includes CUDA libraries (several GB). On machines without a GPU you can install the CPU build from PyTorch's own index instead, where your network allows it.

## Pipeline

```
video ──extract-features──▶ processed/*.npy ──train──▶ model pack ──evaluate──▶ report
            (MediaPipe)          (spec v1)        (calibrate on val,
                                                   evaluate on test signers)
```

```bash
export SIGNSPEAK_DATASET_ROOT=/secure/mount/isl-dataset-1.0.0

signspeak-ml validate-annotations
signspeak-ml make-splits --version v1              # signer-level, never overwritten
signspeak-ml extract-features --pose-model pose_landmarker_full.task --hand-model hand_landmarker.task
signspeak-ml train --split v1 --out runs/isl-mvp-001
signspeak-ml evaluate --pack runs/isl-mvp-001 --split v1 --subset test
```

`extract-features` needs the MediaPipe **Pose Landmarker** and **Hand Landmarker** `.task` model files. Download them from Google's official MediaPipe model cards, check their licence, and keep them out of git. Processing is entirely local.

Try the pipeline without real data (synthetic, **not ISL**):

```bash
signspeak-ml synthetic-demo --out /tmp/syn
signspeak-ml train --root /tmp/syn --out /tmp/syn-pack --epochs 5
```

## Package layout

| Module | Interface | Purpose |
| --- | --- | --- |
| `features/spec.py` | — | Feature contract v1 (156 floats per frame). Exported to `shared/feature_spec_v1.json` for the app; a test fails if they drift |
| `features/normalize.py`, `sequence.py`, `augment.py` | — | Body-centred normalization, resampling to 15 fps, windows, training augmentation |
| `features/extractor.py` | `FeatureExtractor` | Video → landmark sequence (`MediaPipeFeatureExtractor`) |
| `data/annotations.py` | — | JSONL schema; rejects personal data and requires consent references |
| `data/splits.py` | — | Signer-level splits and leakage checks |
| `data/dataset.py` | `DatasetLoader` | Annotations + features → train/val/test datasets |
| `models/temporal.py` | — | `TemporalSignClassifier` (temporal CNN + BiGRU + attention pooling, ~0.5 M params) |
| `models/segment_transformer.py` | — | `SegmentTransformer` (small pre-norm transformer over a whole sign; segment packs) |
| `training/trainer.py` | `ModelTrainer` | Seeded training, class weighting, early stopping on validation signers |
| `evaluation/` | `Evaluator` | Accuracy, P/R/F1, confusion, per-sign, per-signer, selective ("wrong sign shown"), calibration, latency |
| `inference/` | `InferenceEngine`, `SignRecognizer` | Checksummed model packs; ranked label probabilities for a window |

## Training the app's model from landmark recordings

`scripts/train_segments.py` trains the app's whole-sign model (segment pack, several averaged networks) from recordings exported with the app's own tracking; `scripts/train_from_landmarks.py` trains the older window model. Steps and options: [`docs/sign-packs.md`](../docs/sign-packs.md#trained-models). `scripts/make_segment_fixture.py` regenerates the parity fixture that pins the app's TypeScript to these models.

## Updating the feature contract

Changing the layout or normalization requires bumping `FEATURE_SPEC_VERSION` and regenerating the shared file:

```bash
signspeak-ml export-feature-spec --out ../shared/feature_spec_v1.json
```

The mobile app and all model packs must then be updated together. Packs record the version they need, and loading refuses a mismatch.

## Next steps (not implemented)

- Export packs to TFLite or ONNX for on-device inference, and implement `OnDeviceSignRecognizer` in the app (needs the frame-processing decision, `docs/architecture.md` D4)
- Face landmarks for non-manual markers (feature spec v2)
- Temporal transformer, then continuous recognition
