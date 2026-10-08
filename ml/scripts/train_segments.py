"""Train the app's whole-sign model (segment pack) from landmark recordings.

    python scripts/train_segments.py --data landmarks.jsonl --out build/model \\
        --id include --name "INCLUDE signs" --source-name ... --source-url ... --permission ...

Each recording is cut to the sign itself (2 frames before the hands rise to 2
after they come down, as the app's SignSegmenter does live), resampled to 32
frames and classified whole. Several small networks are trained (different
input features and seeds) and their logits averaged: they make different
mistakes, so together they are right more often than any one of them.

``landmarks.jsonl`` comes from the app's own tracking (mobile: ``npm run
export:landmarks``), one recording per line with the sign's text and a
``group`` (signer or recording session). Per sign, the last group is held out
for testing and the one before for validation (as train_from_landmarks.py), so
reported accuracy is on signers the model never saw. ``--train-all`` then trains
the model to ship on every recording with the same settings.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import torch
from torch import nn
from train_from_landmarks import decode, raised, slug, split_groups

from signspeak_ml.evaluation.calibration import expected_calibration_error, fit_temperature, softmax
from signspeak_ml.features.spec import FEATURE_SPEC_VERSION, TARGET_FPS
from signspeak_ml.inference.app_export import APP_PACK_FORMAT, _encode, app_weights, save_app_pack
from signspeak_ml.models.segment_transformer import SegmentTransformer, TransformerConfig, transformer_weights
from signspeak_ml.models.temporal import ModelConfig, TemporalSignClassifier

SEGMENT_PACK_VERSION = 2
SEGMENT_FRAMES = 32
MARGIN = 2  # as SignSegmenter's margin (mobile/src/recognition/segmenter.ts)
POSE, LEFT, RIGHT = slice(0, 9), slice(9, 30), slice(30, 51)  # of the 51 points
FEATURES = ("xy", "xy+hands+vel", "xy+angles", "xy+hands+vel+angles")
# tfl: the transformer, larger (width 192, 4 layers)
ARCHITECTURES = {
    "gru": "temporal-conv-bigru-v1",
    "tf": "segment-transformer-v1",
    "tfl": "segment-transformer-v1",
}
LEARNING_RATES = {"gru": 2e-3, "tf": 1e-3, "tfl": 1e-3}
MIXUP = 0.4  # Beta(α, α) of mixup, for members trained with it (":mix")
# MediaPipe hand bones, as (from, to) point indices within a hand
BONES = (
    (0, 1),
    (1, 2),
    (2, 3),
    (3, 4),
    (0, 5),
    (5, 6),
    (6, 7),
    (7, 8),
    (0, 9),
    (9, 10),
    (10, 11),
    (11, 12),
    (0, 13),
    (13, 14),
    (14, 15),
    (15, 16),
    (0, 17),
    (17, 18),
    (18, 19),
    (19, 20),
)


# ---- The sign, as the app sees it -------------------------------------------------------------


def segment(frames: np.ndarray) -> np.ndarray:
    """MARGIN frames before the first raised frame to MARGIN after the last (all frames if none)."""
    up = np.flatnonzero(raised(frames))
    if len(up) == 0:
        return frames
    return frames[max(0, up[0] - MARGIN) : min(len(frames), up[-1] + 1 + MARGIN)]


def points(frames: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Spec-v1 frames (T, 156) -> x/y of the 51 points (T, 51, 2) and presence flags (T, 3)."""
    return np.stack([frames[:, 0:153:3], frames[:, 1:153:3]], -1), frames[:, 153:156]


def from_points(xy: np.ndarray, presence: np.ndarray) -> np.ndarray:
    out = np.zeros((len(xy), 156), dtype=np.float32)
    out[:, 0:153:3] = xy[..., 0]
    out[:, 1:153:3] = xy[..., 1]
    out[:, 153:156] = presence
    return out


def resample(x: np.ndarray, length: int) -> np.ndarray:
    """Linear interpolation to `length` frames (as resampleFrames in mobile/src/model/signModel.ts)."""
    count = len(x)
    position = (
        np.zeros(length) if count == 1 or length == 1 else np.arange(length) * (count - 1) / (length - 1)
    )
    i0 = np.floor(position).astype(int)
    i1 = np.minimum(i0 + 1, count - 1)
    w = (position - i0).reshape((-1,) + (1,) * (x.ndim - 1))
    return (x[i0] * (1 - w) + x[i1] * w).astype(np.float32)


def member_input(frames: np.ndarray, features: str) -> np.ndarray:
    """Per-frame network input (T, D) of a sign; see memberInput in mobile/src/model/signModel.ts.

    xy: the 51 points' x/y and the 3 presence flags (105).
    xy+hands+vel: also each hand's shape (points relative to its wrist, in units of
    wrist-to-middle-knuckle length; 84) and how every point moved since the
    previous frame (102).
    +angles: also each hand's bones (20) as directions relative to the palm
    (wrist to middle knuckle), cosine and sine (80): the handshape, whatever
    the hand's size or turn.
    The presence flags stay last: the network reads the third-to-last value as
    "a person is in view".
    """
    xy, presence = points(frames)
    count = len(xy)
    parts = [xy.reshape(count, -1)]
    if features.startswith("xy+hands+vel"):
        for hand, flag in ((LEFT, 1), (RIGHT, 2)):
            h = xy[:, hand]
            size = np.linalg.norm(h[:, 9] - h[:, 0], axis=-1)[:, None, None]
            local = (h - h[:, :1]) / np.maximum(size, 1e-3) * (presence[:, flag] > 0.5)[:, None, None]
            parts.append(local.reshape(count, -1))
        flat = xy.reshape(count, -1)
        parts.append(np.diff(flat, axis=0, prepend=flat[:1]))
    if features.endswith("+angles"):
        parts.append(hand_angles(xy, presence))
    parts.append(presence)
    return np.concatenate(parts, -1).astype(np.float32)


def hand_angles(xy: np.ndarray, presence: np.ndarray) -> np.ndarray:
    """Per hand, each bone's direction relative to the palm: cosines, then sines (T, 80)."""
    out = []
    for hand, flag in ((LEFT, 1), (RIGHT, 2)):
        h = xy[:, hand].astype(np.float64)
        palm = h[:, 9] - h[:, 0]
        base = np.arctan2(palm[:, 1], palm[:, 0])
        d = np.stack([h[:, b] - h[:, a] for a, b in BONES], 1)
        angle = np.arctan2(d[..., 1], d[..., 0]) - base[:, None]
        shown = (presence[:, flag] > 0.5)[:, None]
        out.append(np.concatenate([np.cos(angle) * shown, np.sin(angle) * shown], 1))
    return np.concatenate(out, 1).astype(np.float32)


def network_input(frames: np.ndarray, features: str) -> np.ndarray:
    """A whole sign (already cut) as the network reads it: (SEGMENT_FRAMES, D)."""
    return resample(member_input(frames, features), SEGMENT_FRAMES)


# ---- Training ---------------------------------------------------------------------------------


def augment(frames: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Variation between signers and cameras: trimmed ends, framing, arm and hand pose, tracking gaps."""
    n = len(frames)
    cut = int(n * 0.1)
    start, end = rng.integers(0, cut + 1), n - rng.integers(0, cut + 1)
    frames = frames[start : max(end, start + 4)]
    xy, presence = points(frames)
    xy, presence = xy.copy(), presence.copy()
    count = len(xy)
    # Rotation, uneven scale, shear and shift of the whole picture.
    angle = rng.uniform(-0.15, 0.15)
    sx, sy = rng.uniform(0.88, 1.12, 2)
    shear = rng.uniform(-0.1, 0.1)
    rot = np.array([[math.cos(angle), -math.sin(angle)], [math.sin(angle), math.cos(angle)]])
    m = rot @ np.array([[sx, shear], [0, sy]])
    shown = (
        np.concatenate(
            [
                np.repeat(presence[:, :1], 9, 1),
                np.repeat(presence[:, 1:2], 21, 1),
                np.repeat(presence[:, 2:3], 21, 1),
            ],
            1,
        )
        > 0.5
    )
    xy = (xy @ m.T + rng.uniform(-0.1, 0.1, 2)) * shown[..., None]
    # Each hand's shape turned and scaled a little around its wrist.
    for hand, flag in ((LEFT, 1), (RIGHT, 2)):
        r, k = rng.uniform(-0.2, 0.2), rng.uniform(0.9, 1.1)
        turn = np.array([[math.cos(r), -math.sin(r)], [math.sin(r), math.cos(r)]]) * k
        wrist = xy[:, hand][:, :1]
        xy[:, hand] = ((xy[:, hand] - wrist) @ turn.T + wrist) * (presence[:, flag] > 0.5)[:, None, None]
    xy = xy + rng.normal(0, 0.01, xy.shape) * shown[..., None]
    # A hand now and then lost by the tracker.
    for flag, hand in ((1, LEFT), (2, RIGHT)):
        lost = rng.random(count) < 0.05
        presence[lost, flag] = 0
        xy[lost, hand] = 0
    return from_points(xy.astype(np.float32), presence)


def new_network(arch: str, classes: int, dim: int) -> nn.Module:
    if arch in ("tf", "tfl"):
        size = {"width": 192, "layers": 4} if arch == "tfl" else {}
        config = TransformerConfig(num_classes=classes, input_dim=dim, frames=SEGMENT_FRAMES, **size)
        return SegmentTransformer(config)
    return TemporalSignClassifier(ModelConfig(num_classes=classes, input_dim=dim))


def train_member(
    train: list[tuple[int, np.ndarray]],
    classes: int,
    arch: str,
    features: str,
    seed: int,
    epochs: int,
    log,
    mixup: bool = False,
) -> nn.Module:
    torch.manual_seed(seed)
    rng = np.random.default_rng(seed)
    dim = network_input(train[0][1], features).shape[1]
    model = new_network(arch, classes, dim)
    batch = 64
    lr = LEARNING_RATES[arch]
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.05)
    steps = epochs * math.ceil(len(train) / batch)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, lr, total_steps=steps, pct_start=0.1)
    loss_fn = nn.CrossEntropyLoss(label_smoothing=0.1)
    for epoch in range(epochs):
        model.train()
        order = rng.permutation(len(train))
        total = 0.0
        for i in range(0, len(order), batch):
            chosen = [train[j] for j in order[i : i + batch]]
            x = torch.tensor(np.stack([network_input(augment(f, rng), features) for _, f in chosen]))
            y = torch.tensor([label for label, _ in chosen])
            opt.zero_grad()
            if mixup:
                # a blend of two signs, scored as both in proportion
                lam = float(rng.beta(MIXUP, MIXUP))
                other = torch.as_tensor(rng.permutation(len(y)))
                out = model(lam * x + (1 - lam) * x[other])
                loss = lam * loss_fn(out, y) + (1 - lam) * loss_fn(out, y[other])
            else:
                loss = loss_fn(model(x), y)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            sched.step()
            total += float(loss.detach()) * len(y)
        if (epoch + 1) % 10 == 0:
            log(f"  {arch} {features} seed {seed}: epoch {epoch + 1} loss {total / len(train):.3f}")
    return model.eval()


@torch.no_grad()
def logits_of(model: nn.Module, recordings: list[tuple[int, np.ndarray]], features: str) -> np.ndarray:
    if not recordings:
        return np.zeros((0, 0), dtype=np.float32)
    x = torch.tensor(np.stack([network_input(f, features) for _, f in recordings]))
    return model(x).numpy()


def topk(probs: np.ndarray, y: np.ndarray, k: int) -> float:
    return float(np.mean([t in row for t, row in zip(y, np.argsort(-probs, 1)[:, :k], strict=True)]))


# ---- Main -------------------------------------------------------------------------------------


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
    parser.add_argument(
        "--members",
        default="gru:xy:0,gru:xy+hands+vel:0,tf:xy:0",
        help="networks to train and average, as arch:features:seed[:mix] "
        f"(arch: {', '.join(ARCHITECTURES)}; features: {', '.join(FEATURES)}; mix: trained with mixup)",
    )
    parser.add_argument(
        "--extra",
        type=Path,
        action="append",
        default=[],
        help="more recordings (same format) used for training only, whatever the split, "
        "e.g. another signer's; signs not in --data are skipped",
    )
    parser.add_argument(
        "--train-val",
        action="store_true",
        help="also train on the validation recordings and test on the test ones, with --temperature "
        "(from a run without it): accuracy with more data, still on recordings the model never saw",
    )
    parser.add_argument(
        "--train-all", action="store_true", help="the model to ship: train on every recording"
    )
    parser.add_argument("--temperature", type=float, help="with --train-all: the held-out run's temperature")
    parser.add_argument(
        "--evaluation-from", type=Path, help="with --train-all: the held-out run's report.json"
    )
    parser.add_argument("--threads", type=int, default=0)
    args = parser.parse_args()
    if args.train_all and (args.temperature is None or args.evaluation_from is None):
        parser.error("--train-all needs --temperature and --evaluation-from (from a held-out run)")
    if args.threads:
        torch.set_num_threads(args.threads)
    if args.train_val and args.temperature is None:
        parser.error("--train-val needs --temperature (from a run without --train-val)")
    members = []
    for spec in args.members.split(","):
        arch, features, seed, *flags = spec.split(":")
        if arch not in ARCHITECTURES or features not in FEATURES or set(flags) - {"mix"}:
            parser.error(
                f"unknown member {spec!r} (arch: {', '.join(ARCHITECTURES)}; features: {', '.join(FEATURES)})"
            )
        members.append((arch, features, int(seed), "mix" in flags))

    records = [
        json.loads(line) for line in args.data.read_text(encoding="utf-8").splitlines() if line.strip()
    ]
    texts: dict[str, str] = {}
    groups: dict[str, list[str]] = defaultdict(list)
    for record in records:
        record["label"] = f"{args.id}:{slug(record['text'])}"
        texts.setdefault(record["label"], record["text"])
        groups[record["label"]].append(str(record.get("group") or "all"))
    splits = {label: split_groups(g) for label, g in groups.items()}
    labels = sorted(texts)
    index = {label: i for i, label in enumerate(labels)}
    parts: dict[str, list[tuple[int, np.ndarray]]] = {"train": [], "val": [], "test": []}
    for record in records:
        frames = segment(decode(record["recording"]))
        part = "train" if args.train_all else splits[record["label"]][str(record.get("group") or "all")]
        if args.train_val and part == "val":
            part = "train"
        parts[part].append((index[record["label"]], frames))
    extra = 0
    for path in args.extra:
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            record = json.loads(line)
            label = f"{args.id}:{slug(record['text'])}"
            if label in index:
                parts["train"].append((index[label], segment(decode(record["recording"]))))
                extra += 1
    print(
        {part: len(items) for part, items in parts.items()},
        f"(extra: {extra})" if args.extra else "",
        flush=True,
    )

    # Each finished member is kept in <out>/members, so an interrupted run picks up where it stopped.
    saved = args.out / "members"
    saved.mkdir(parents=True, exist_ok=True)
    trained = []
    for arch, features, seed, mixup in members:
        key = f"{arch}_{features}_{seed}{'_mix' if mixup else ''}_e{args.epochs}_n{len(parts['train'])}"
        path = saved / f"{re.sub(r'[^a-z0-9_]+', '-', key)}.pt"
        if path.exists():
            model = new_network(arch, len(labels), network_input(parts["train"][0][1], features).shape[1])
            model.load_state_dict(torch.load(path, weights_only=True))
            model.eval()
            print(f"  {arch} {features} seed {seed}: loaded from {path.name}", flush=True)
        else:
            model = train_member(
                parts["train"],
                len(labels),
                arch,
                features,
                seed,
                args.epochs,
                lambda m: print(m, flush=True),
                mixup=mixup,
            )
            torch.save(model.state_dict(), path)
        trained.append((arch, features, model))

    if args.train_all:
        held_out = json.loads(args.evaluation_from.read_text(encoding="utf-8"))
        held_out.pop("most_confused", None)
        evaluation = {
            **held_out,
            "final_model": "trained on every recording with the same settings "
            f"({len(parts['train'])} recordings)",
        }
        export(args, trained, labels, texts, args.temperature, evaluation, [], calibrated=False)
        return

    def ensemble(part: str) -> tuple[np.ndarray, np.ndarray]:
        y = np.array([label for label, _ in parts[part]])
        return np.mean([logits_of(m, parts[part], f) for _, f, m in trained], 0), y

    if args.train_val:
        val_logits, val_y = np.zeros((0, len(labels))), np.zeros(0, dtype=int)
        temperature = args.temperature
    else:
        val_logits, val_y = ensemble("val")
        temperature = fit_temperature(val_logits, val_y)
    test_logits, test_y = ensemble("test")
    probs = softmax(test_logits, temperature)
    confused = Counter((labels[t], labels[p]) for t, p in zip(test_y, probs.argmax(1), strict=True) if t != p)
    evaluation = {
        "split": "per sign, whole recording groups held out (test: last group, validation: the one before)"
        + ("; validation recordings also used for training" if args.train_val else ""),
        "mode": "whole sign (segment)",
        "test_recordings": len(test_y),
        "test_top1": float((probs.argmax(1) == test_y).mean()),
        "test_top3": topk(probs, test_y, 3),
        "test_top5": topk(probs, test_y, 5),
        "test_members_top1": [
            float((logits_of(m, parts["test"], f).argmax(1) == test_y).mean()) for _, f, m in trained
        ],
        "val_top1": float((val_logits.argmax(1) == val_y).mean()) if len(val_y) else None,
        "test_ece": float(expected_calibration_error(probs, test_y)),
        "temperature": float(temperature),
        "signs": len(labels),
        "train_recordings": len(parts["train"]),
        "members": [f"{a}:{f}" for a, f, _ in trained],
    }
    print(json.dumps(evaluation, indent=2))
    export(
        args,
        trained,
        labels,
        texts,
        temperature,
        evaluation,
        confused.most_common(30),
        calibrated=evaluation["test_ece"] <= 0.05 and not args.train_val,
    )


def member_entry(arch: str, features: str, model: nn.Module) -> dict:
    """One network of the pack, as the app reads it (mobile/src/model/modelPack.ts)."""
    c = model.config
    if arch in ("tf", "tfl"):
        config = {
            "inputDim": c.input_dim,
            "frames": c.frames,
            "width": c.width,
            "layers": c.layers,
            "heads": c.heads,
            "numClasses": c.num_classes,
        }
        weights = {name: _encode(value.numpy()) for name, value in transformer_weights(model).items()}
    else:
        config = {
            "inputDim": c.input_dim,
            "convChannels": c.conv_channels,
            "kernelSize": c.kernel_size,
            "hiddenSize": c.hidden_size,
            "numClasses": c.num_classes,
        }
        weights = app_weights(model)
    return {"architecture": ARCHITECTURES[arch], "features": features, "config": config, "weights": weights}


def export(args, trained, labels, texts, temperature, evaluation, confused, calibrated: bool) -> None:
    from datetime import UTC, datetime

    pack = {
        "format": APP_PACK_FORMAT,
        "version": SEGMENT_PACK_VERSION,
        "id": args.id,
        "name": args.name,
        "createdAt": datetime.now(UTC).isoformat(timespec="seconds"),
        "featureSpecVersion": FEATURE_SPEC_VERSION,
        "targetFps": TARGET_FPS,
        "windowFrames": SEGMENT_FRAMES,
        "mode": "segment",
        "members": [member_entry(arch, features, model) for arch, features, model in trained],
        "labels": [{"id": label, "text": texts[label]} for label in labels],
        "language": args.language,
        "unknownLabel": None,
        "temperature": float(temperature),
        "calibrated": bool(calibrated),
        "stabilizer": None,
        "source": {"name": args.source_name, "url": args.source_url, "permission": args.permission},
        "evaluation": evaluation,
    }
    args.out.mkdir(parents=True, exist_ok=True)
    save_app_pack(args.out / f"{args.id}.signpack", pack)
    report = {**evaluation, "most_confused": [[a, b, n] for (a, b), n in confused]}
    (args.out / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {args.out / f'{args.id}.signpack'} and report.json")


if __name__ == "__main__":
    main()
