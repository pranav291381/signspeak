"""Train the app's sign model from landmark recordings.

    python scripts/train_from_landmarks.py --data landmarks.jsonl --out build/model \\
        --id include-model --name "INCLUDE signs" --source-name ... --source-url ... --permission ...

``landmarks.jsonl`` comes from the app's own tracking (mobile: ``npm run export:landmarks``):
one recording per line with the sign's text and a ``group`` (signer or recording
session). For every sign, whole groups are held out for validation and testing,
so the reported accuracy is on recordings the model never saw. Writes the app
model pack (``<out>/<id>.signpack``) and a report (``<out>/report.json``).
"""

from __future__ import annotations

import argparse
import base64
import json
import re
import shutil
import tempfile
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader

from signspeak_ml.data.annotations import UNKNOWN_LABEL, Sample
from signspeak_ml.data.dataset import LandmarkWindowDataset
from signspeak_ml.evaluation.calibration import expected_calibration_error, fit_temperature, softmax
from signspeak_ml.features.spec import COORDS, FRAME_DIM, POSE_LANDMARKS, WINDOW_FRAMES
from signspeak_ml.inference.app_export import app_pack, save_app_pack
from signspeak_ml.models.temporal import ModelConfig, TemporalSignClassifier
from signspeak_ml.training.trainer import ModelTrainer, TrainConfig

XY_DIM = 105  # x, y of 51 landmarks + 3 presence flags (the app's pack layout)
LEFT_WRIST_Y, RIGHT_WRIST_Y, LEFT_PRESENT, RIGHT_PRESENT = 28, 91, 154, 155
POSE_PRESENT = 153
POSE_LEFT_WRIST_Y = list(POSE_LANDMARKS).index("left_wrist") * COORDS + 1  # 16
POSE_RIGHT_WRIST_Y = list(POSE_LANDMARKS).index("right_wrist") * COORDS + 1  # 19
REST_WRIST_Y = 1.2  # as REST_WRIST_Y (and `signing`) in mobile/src/recognition/features.ts
CONTEXT = 8  # frames after a sign's end at which windows still count as the sign
MIN_SIGN_FRAMES = 4
POSITIVES = 6  # windows per recording labelled with the sign


def decode(recording: dict) -> np.ndarray:
    """A recording (Int16 x 1000, base64, no depth) as spec-v1 frames (T, 156), depth 0."""
    raw = np.frombuffer(base64.b64decode(recording["data"]), dtype="<i2").astype(np.float32) / 1000.0
    raw = raw.reshape(recording["frames"], recording["dim"])
    if raw.shape[1] != XY_DIM:
        raise ValueError(f"expected {XY_DIM} values per frame, got {raw.shape[1]}")
    frames = np.zeros((raw.shape[0], FRAME_DIM), dtype=np.float32)
    frames[:, 0:153:3] = raw[:, 0:102:2]
    frames[:, 1:153:3] = raw[:, 1:102:2]
    frames[:, 153:] = raw[:, 102:]
    frames[recording.get("missing", [])] = 0.0
    return frames


def raised(frames: np.ndarray) -> np.ndarray:
    """Frames where someone signs: a hand or a pose wrist raised (as `signing` in the app).

    The hand tracker often loses fast-moving hands (motion blur) while the pose
    tracker keeps the arm, so the pose wrist alone counts too.
    """
    left = (frames[:, LEFT_PRESENT] > 0.5) & (frames[:, LEFT_WRIST_Y] < REST_WRIST_Y)
    right = (frames[:, RIGHT_PRESENT] > 0.5) & (frames[:, RIGHT_WRIST_Y] < REST_WRIST_Y)
    arms = (frames[:, POSE_PRESENT] > 0.5) & (
        (frames[:, POSE_LEFT_WRIST_Y] < REST_WRIST_Y) | (frames[:, POSE_RIGHT_WRIST_Y] < REST_WRIST_Y)
    )
    return left | right | arms


def live_windows(frames: np.ndarray, label: str, positives: int = POSITIVES) -> list[tuple[str, np.ndarray]]:
    """Windows as the app sees them live, with their labels.

    The app looks at the last WINDOW_FRAMES frames, with the person in view
    before and after signing, so the recording is extended by holding its first
    and last frame. A window that holds most of the sign is the sign; a window
    where the sign has only begun, or that holds only rest, is "none of these",
    so the model does not guess from the first movements of a sign.
    """
    up = np.flatnonzero(raised(frames))
    if len(up) < MIN_SIGN_FRAMES:
        return []
    lead, tail = WINDOW_FRAMES, CONTEXT + 4
    seq = np.concatenate([np.repeat(frames[:1], lead, 0), frames, np.repeat(frames[-1:], tail, 0)])
    first, last = int(up[0]) + lead, int(up[-1]) + lead
    span = last - first + 1
    window = lambda end: seq[end - WINDOW_FRAMES + 1 : end + 1]  # noqa: E731
    ends = np.arange(last - int(0.2 * span), min(last + CONTEXT, len(seq) - 1) + 1)
    out = [(label, window(int(e))) for e in np.linspace(ends[0], ends[-1], min(len(ends), positives)).round()]
    onset = np.arange(first + 1, first + max(2, int(0.45 * span)))
    onset_ends = np.linspace(onset[0], onset[-1], min(len(onset), 3)).round()
    out += [(UNKNOWN_LABEL, window(int(e))) for e in onset_ends]
    if first - 3 >= WINDOW_FRAMES - 1:
        out.append((UNKNOWN_LABEL, window(first - 3)))
    return out


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "sign"


def split_groups(groups: list[str]) -> dict[str, str]:
    """Per sign: the last group is test, the one before validation (with 3+ groups), the rest train."""
    ordered = sorted(set(groups))
    split = dict.fromkeys(ordered, "train")
    if len(ordered) >= 2:
        split[ordered[-1]] = "test"
    if len(ordered) >= 3:
        split[ordered[-2]] = "val"
    return split


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--data", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--id", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--source-name", required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--permission", required=True)
    parser.add_argument("--language", default="en")
    parser.add_argument("--epochs", type=int, default=80)
    parser.add_argument("--patience", type=int, default=15)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--positives", type=int, default=POSITIVES, help="sign windows per recording")
    parser.add_argument("--conv-channels", type=int, default=128)
    parser.add_argument("--hidden-size", type=int, default=96)
    parser.add_argument("--dropout", type=float, default=0.3)
    parser.add_argument(
        "--train-all",
        action="store_true",
        help="final model: train on every recording for exactly --epochs (from a held-out run), "
        "with that run's --temperature and --evaluation-from report",
    )
    parser.add_argument("--temperature", type=float)
    parser.add_argument("--evaluation-from", type=Path, help="report.json of the held-out run")
    args = parser.parse_args()
    if args.train_all and (args.temperature is None or args.evaluation_from is None):
        parser.error("--train-all needs --temperature and --evaluation-from (from a held-out run)")

    lines = args.data.read_text(encoding="utf-8").splitlines()
    records = [json.loads(line) for line in lines if line.strip()]
    texts: dict[str, str] = {}
    groups_by_label: dict[str, list[str]] = defaultdict(list)
    for record in records:
        label = f"{args.id}:{slug(record['text'])}"
        texts.setdefault(label, record["text"])
        record["label"] = label
        groups_by_label[label].append(str(record.get("group") or "all"))
    splits = {label: split_groups(groups) for label, groups in groups_by_label.items()}

    work = Path(tempfile.mkdtemp(prefix="signs-"))
    samples: dict[str, list[Sample]] = {"train": [], "val": [], "test": []}
    skipped = Counter()
    for i, record in enumerate(records):
        frames = decode(record["recording"])
        part = "train" if args.train_all else splits[record["label"]][str(record.get("group") or "all")]
        windows = live_windows(frames, record["label"], args.positives)
        if not windows:
            skipped["no sign seen"] += 1
            continue
        for k, (label, window) in enumerate(windows):
            sample_id = f"s{i:05d}_{k}"
            np.save(work / f"{sample_id}.npy", window.astype(np.float32))
            samples[part].append(Sample(sample_id, "sg_data", label, "", 0, 0, "isl"))

    labels = [UNKNOWN_LABEL] + sorted(texts)
    datasets = {
        part: LandmarkWindowDataset(items, work, labels, train=part == "train", seed=args.seed)
        for part, items in samples.items()
    }
    shutil.rmtree(work, ignore_errors=True)  # the datasets hold every window in memory now
    print({part: len(d) for part, d in datasets.items()}, "skipped:", dict(skipped))

    torch.set_num_threads(max(1, torch.get_num_threads()))
    model = TemporalSignClassifier(
        ModelConfig(
            num_classes=len(labels),
            conv_channels=args.conv_channels,
            hidden_size=args.hidden_size,
            dropout=args.dropout,
        )
    )
    config = TrainConfig(epochs=args.epochs, patience=args.patience, batch_size=64, seed=args.seed)
    trainer = ModelTrainer(config)
    result = trainer.fit(model, datasets["train"], None if args.train_all else datasets["val"])
    if args.train_all:
        held_out = json.loads(args.evaluation_from.read_text(encoding="utf-8"))
        held_out.pop("most_confused", None)
        evaluation = {
            **held_out,
            "final_model": f"trained on every recording with the same settings after this evaluation "
            f"({args.epochs} epochs, {len(datasets['train'])} windows)",
        }
        export(args, model, labels, texts, args.temperature, evaluation, [])
        return

    @torch.no_grad()
    def logits_of(dataset: LandmarkWindowDataset) -> tuple[np.ndarray, np.ndarray]:
        model.eval()
        xs, ys = [], []
        for x, y in DataLoader(dataset, batch_size=256):
            xs.append(model(x).numpy())
            ys.append(y.numpy())
        return np.concatenate(xs), np.concatenate(ys)

    val_logits, val_y = logits_of(datasets["val"])
    temperature = fit_temperature(val_logits, val_y)
    test_logits, test_y = logits_of(datasets["test"])
    probs = softmax(test_logits, temperature)
    signs = test_y != 0
    top5 = np.argsort(-probs, axis=1)[:, :5]
    confusions = Counter(
        (labels[t], labels[p]) for t, p in zip(test_y[signs], probs[signs].argmax(1), strict=True) if t != p
    )
    evaluation = {
        "split": "per sign, whole recording groups held out (test: last group, validation: the one before)",
        "test_sign_windows": int(signs.sum()),
        "test_top1": float((probs[signs].argmax(1) == test_y[signs]).mean()),
        "test_top5": float(np.mean([t in row for t, row in zip(test_y[signs], top5[signs], strict=True)])),
        "test_rest_windows": int((~signs).sum()),
        "test_rest_correct": float((probs[~signs].argmax(1) == 0).mean()) if (~signs).any() else None,
        "test_ece": float(expected_calibration_error(probs, test_y)),
        "temperature": float(temperature),
        "best_epoch": result.best_epoch,
        "val_macro_f1": result.best_val_macro_f1,
        "signs": len(labels) - 1,
        "train_windows": len(datasets["train"]),
    }
    print(json.dumps(evaluation, indent=2))
    export(args, model, labels, texts, temperature, evaluation, confusions.most_common(30))


def export(args, model, labels, texts, temperature, evaluation, confused) -> None:
    pack = app_pack(
        model,
        [{"id": label, "text": texts.get(label, "")} for label in labels],
        pack_id=args.id,
        name=args.name,
        temperature=temperature,
        # A final model trained on everything has no held-out data to verify its calibration.
        calibrated=evaluation["test_ece"] <= 0.05 and not args.train_all,
        source={"name": args.source_name, "url": args.source_url, "permission": args.permission},
        evaluation=evaluation,
        language=args.language,
    )
    args.out.mkdir(parents=True, exist_ok=True)
    save_app_pack(args.out / f"{args.id}.signpack", pack)
    report = {**evaluation, "most_confused": [[a, b, n] for (a, b), n in confused]}
    (args.out / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {args.out / f'{args.id}.signpack'} and report.json")


if __name__ == "__main__":
    main()
