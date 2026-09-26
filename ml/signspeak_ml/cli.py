"""Command-line entry point: ``signspeak-ml <command>`` (or ``python -m signspeak_ml.cli``).

Commands follow the pipeline order:

    validate-annotations -> make-splits -> extract-features -> train -> evaluate

``export-feature-spec`` writes the shared contract; ``synthetic-demo`` creates a
synthetic dataset to smoke-test the pipeline (it is not ISL).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np


def _dataset_root(value: str | None) -> Path:
    root = value or os.environ.get("SIGNSPEAK_DATASET_ROOT")
    if not root:
        sys.exit("dataset root required: pass --root or set SIGNSPEAK_DATASET_ROOT")
    return Path(root)


def cmd_validate(args: argparse.Namespace) -> int:
    from .data.annotations import load_annotations

    report = load_annotations(_dataset_root(args.root) / "annotations" / "annotations.jsonl")
    for error in report.errors:
        print(f"ERROR {error}")
    signers = {s.signer_id for s in report.samples}
    labels = {s.label for s in report.samples}
    print(
        f"{len(report.samples)} valid samples, {len(signers)} signers, "
        f"{len(labels)} labels, {len(report.errors)} errors"
    )
    return 0 if report.ok else 1


def cmd_make_splits(args: argparse.Namespace) -> int:
    from .data.annotations import load_annotations
    from .data.splits import check_split, make_signer_split

    root = _dataset_root(args.root)
    report = load_annotations(root / "annotations" / "annotations.jsonl")
    if not report.ok:
        print("fix annotation errors first (validate-annotations)")
        return 1
    split = make_signer_split(
        report.samples, val_fraction=args.val, test_fraction=args.test, seed=args.seed, version=args.version
    )
    errors, warnings = check_split(split, report.samples)
    for w in warnings:
        print(f"WARNING {w}")
    if errors:
        for e in errors:
            print(f"ERROR {e}")
        return 1
    path = root / "splits" / f"{args.version}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and not args.overwrite:
        print(f"{path} exists; splits are versioned. Use a new --version or --overwrite.")
        return 1
    split.save(path)
    print(f"wrote {path}: {len(split.train)} train / {len(split.val)} val / {len(split.test)} test signers")
    return 0


def cmd_extract(args: argparse.Namespace) -> int:  # pragma: no cover - needs MediaPipe models + videos
    from .data.annotations import load_annotations
    from .features.extractor import MediaPipeFeatureExtractor

    root = _dataset_root(args.root)
    report = load_annotations(root / "annotations" / "annotations.jsonl")
    if not report.ok:
        print("fix annotation errors first (validate-annotations)")
        return 1
    extractor = MediaPipeFeatureExtractor(Path(args.pose_model), Path(args.hand_model))
    out_dir = root / "processed"
    out_dir.mkdir(parents=True, exist_ok=True)
    for sample in report.samples:
        target = out_dir / f"{sample.sample_id}.npy"
        if target.exists() and not args.overwrite:
            continue
        result = extractor.extract(root / "raw" / sample.video, sample.start_ms, sample.end_ms)
        np.save(target, result.frames)
        print(
            f"{sample.sample_id}: {len(result.frames)} frames, signer visible in {result.frames_with_signer}"
        )
    return 0


def cmd_train(args: argparse.Namespace) -> int:
    from .data.dataset import DatasetLoader
    from .evaluation.calibration import fit_temperature
    from .evaluation.evaluator import Evaluator
    from .inference.pack import save_model_pack
    from .models.temporal import ModelConfig, TemporalSignClassifier, count_parameters
    from .training.trainer import ModelTrainer, TrainConfig, set_seed

    root = _dataset_root(args.root)
    splits = DatasetLoader(root, args.split).load(seed=args.seed)
    for w in splits.warnings:
        print(f"WARNING {w}")
    set_seed(args.seed)  # before building the model so initial weights are reproducible
    model = TemporalSignClassifier(ModelConfig(num_classes=len(splits.labels)))
    print(f"{len(splits.labels)} classes, {count_parameters(model):,} parameters")
    config = TrainConfig(epochs=args.epochs, batch_size=args.batch_size, seed=args.seed)
    result = ModelTrainer(config).fit(model, splits.train, splits.val)

    # Calibrate on validation signers, then evaluate once on unseen test signers.
    val_logits, val_y = Evaluator(model, splits.labels).logits(splits.val)
    temperature = fit_temperature(val_logits, val_y)
    report = Evaluator(model, splits.labels, temperature).evaluate(splits.test, split="test")

    out = Path(args.out)
    save_model_pack(
        out,
        model,
        splits.labels,
        model_id=args.model_id or out.name,
        temperature=temperature,
        test_ece=report.ece,
        evaluation={
            "split": "test",
            "accuracy": report.metrics["accuracy"],
            "macro_f1": report.metrics["macro_f1"],
            "n_signers": report.n_signers,
            "selective": report.selective,
        },
        dataset={
            "root_name": root.name,
            "split_version": args.split,
            "language_context": args.language_context,
        },
        notes=args.notes,
    )
    (out / "evaluation.json").write_text(report.to_json(), encoding="utf-8")
    (out / "evaluation.md").write_text(report.to_markdown(), encoding="utf-8")
    (out / "training_history.json").write_text(
        json.dumps(
            {"config": config.to_dict(), "best_epoch": result.best_epoch, "history": result.history}, indent=2
        ),
        encoding="utf-8",
    )
    print(report.to_markdown())
    print(f"model pack written to {out}")
    return 0


def cmd_evaluate(args: argparse.Namespace) -> int:
    from .data.dataset import DatasetLoader
    from .evaluation.evaluator import Evaluator
    from .inference.pack import load_model_pack

    model, manifest = load_model_pack(Path(args.pack))
    splits = DatasetLoader(_dataset_root(args.root), args.split).load()
    if splits.labels != manifest["labels"]:
        print("label set of this dataset split differs from the model pack")
        return 1
    dataset = getattr(splits, args.subset)
    report = Evaluator(model, manifest["labels"], manifest["calibration"]["temperature"]).evaluate(
        dataset, args.subset
    )
    print(report.to_json() if args.json else report.to_markdown())
    return 0


def cmd_export_spec(args: argparse.Namespace) -> int:
    from .features.spec import spec_json

    Path(args.out).write_text(spec_json(), encoding="utf-8")
    print(f"wrote {args.out}")
    return 0


def cmd_synthetic(args: argparse.Namespace) -> int:
    from .data.annotations import load_annotations
    from .data.splits import make_signer_split
    from .data.synthetic import write_synthetic_dataset

    root = Path(args.out)
    write_synthetic_dataset(root, signers=args.signers, seed=args.seed)
    samples = load_annotations(root / "annotations" / "annotations.jsonl").samples
    make_signer_split(samples, seed=args.seed).save(root / "splits" / "v1.json")
    print(f"SYNTHETIC (not ISL) dataset written to {root}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="signspeak-ml", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("validate-annotations", help="check annotations.jsonl")
    p.add_argument("--root")
    p.set_defaults(func=cmd_validate)

    p = sub.add_parser("make-splits", help="create a signer-level split")
    p.add_argument("--root")
    p.add_argument("--version", default="v1")
    p.add_argument("--val", type=float, default=0.15)
    p.add_argument("--test", type=float, default=0.15)
    p.add_argument("--seed", type=int, default=13)
    p.add_argument("--overwrite", action="store_true")
    p.set_defaults(func=cmd_make_splits)

    p = sub.add_parser("extract-features", help="videos -> processed/*.npy with MediaPipe")
    p.add_argument("--root")
    p.add_argument("--pose-model", required=True)
    p.add_argument("--hand-model", required=True)
    p.add_argument("--overwrite", action="store_true")
    p.set_defaults(func=cmd_extract)

    p = sub.add_parser("train", help="train, calibrate on val, evaluate on test, write a model pack")
    p.add_argument("--root")
    p.add_argument("--split", default="v1")
    p.add_argument("--out", required=True)
    p.add_argument("--model-id")
    p.add_argument("--epochs", type=int, default=40)
    p.add_argument("--batch-size", type=int, default=32)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--language-context", default="isl")
    p.add_argument("--notes", default="")
    p.set_defaults(func=cmd_train)

    p = sub.add_parser("evaluate", help="evaluate a model pack on a split")
    p.add_argument("--pack", required=True)
    p.add_argument("--root")
    p.add_argument("--split", default="v1")
    p.add_argument("--subset", choices=["val", "test"], default="test")
    p.add_argument("--json", action="store_true")
    p.set_defaults(func=cmd_evaluate)

    p = sub.add_parser("export-feature-spec", help="write the shared feature contract JSON")
    p.add_argument("--out", required=True)
    p.set_defaults(func=cmd_export_spec)

    p = sub.add_parser("synthetic-demo", help="write a SYNTHETIC (not ISL) dataset for smoke tests")
    p.add_argument("--out", required=True)
    p.add_argument("--signers", type=int, default=8)
    p.add_argument("--seed", type=int, default=0)
    p.set_defaults(func=cmd_synthetic)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return int(args.func(args) or 0)


if __name__ == "__main__":
    raise SystemExit(main())
