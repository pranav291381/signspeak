"""Turn "Export my signs" files from the app into training recordings.

The app's My signs tab exports what a person taught on their phone (hand and
body points per take, no video) as `signspeak-my-signs-<date>.json`. This
writes those takes as landmark JSONL, the format `train_segments.py --extra`
reads, so they can be added to training:

    python scripts/import_my_signs.py export.json --contributor c01 --out my-signs.jsonl
    python scripts/train_segments.py ... --extra my-signs.jsonl

Only use files whose contributors agreed that their signs may be used to train
the model (see docs/dataset.md, "Signs exported from the app").

By default only signs the model already knows (`--pack`, e.g. `include:teacher`)
are written: those are what training can use. `--own` also writes the person's
own words and letters (category "Own words" / "Letters"), for a future vocabulary.
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
from pathlib import Path

import numpy as np

FORMAT = "signspeak.my-signs"
VERSION = 1
FEATURE_SPEC_VERSION = 1
FRAME_DIM = 156  # x, y, z of 51 points, then 3 presence flags
XY_DIM = 105  # x, y of 51 points, then the 3 presence flags (the training format)
SCALE = 1000.0


def decode_take(take: dict) -> np.ndarray:
    """A stored take (Int16 x 1000, little-endian, base64) as (frames, FRAME_DIM) floats."""
    raw = np.frombuffer(base64.b64decode(take["data"]), dtype="<i2").astype(np.float32) / SCALE
    if take.get("dim") != FRAME_DIM or raw.size != take["frames"] * FRAME_DIM:
        raise ValueError(f"take has {raw.size} values, expected {take['frames']} x {FRAME_DIM}")
    return raw.reshape(take["frames"], FRAME_DIM)


def to_xy(frames: np.ndarray) -> np.ndarray:
    """Drops depth: [x0, y0, x1, y1, ..., flags], as `toXY` in mobile/src/personal/codec.ts."""
    out = np.zeros((len(frames), XY_DIM), dtype=np.float32)
    out[:, 0:102:2] = frames[:, 0:153:3]
    out[:, 1:102:2] = frames[:, 1:153:3]
    out[:, 102:] = frames[:, 153:]
    return out


def encode(frames: np.ndarray) -> dict:
    scaled = np.clip(np.round(frames * SCALE), -32767, 32767).astype("<i2")
    return {
        "frames": len(frames),
        "dim": frames.shape[1],
        "data": base64.b64encode(scaled.tobytes()).decode("ascii"),
        "missing": [],
    }


def describe(target: dict, pack: str, own: bool) -> tuple[str, str] | None:
    """(text, category) of a sign to write, or None to skip it."""
    kind = target.get("kind")
    if kind == "vocabulary":
        prefix, _, sign = str(target.get("label", "")).partition(":")
        # The model's label is `<pack>:<slug of its text>`; training derives it from the text again.
        return (sign.replace("-", " "), "Vocabulary") if prefix == pack and sign else None
    if not own:
        return None
    if kind == "custom" and str(target.get("text", "")).strip():
        return str(target["text"]).strip(), "Own words"
    if kind == "letter" and str(target.get("letter", "")).isalpha():
        return f"letter {str(target['letter']).lower()}", "Letters"
    return None


def import_export(data: dict, contributor: str, pack: str = "include", own: bool = False) -> list[dict]:
    """Training rows for one export file."""
    if data.get("format") != FORMAT or data.get("version") != VERSION:
        raise ValueError("not a SignSpeak My signs export (format/version)")
    if data.get("featureSpecVersion") != FEATURE_SPEC_VERSION or data.get("frameDim") != FRAME_DIM:
        raise ValueError("export uses a different feature spec")
    rows = []
    for sign in data.get("signs", []):
        described = describe(sign.get("target") or {}, pack, own)
        if not described:
            continue
        text, category = described
        for i, take in enumerate(sign.get("samples", [])):
            frames = to_xy(decode_take(take))
            rows.append(
                {
                    "text": text,
                    "group": f"personal/{contributor}/{sign.get('id')}/{i}",
                    "category": category,
                    "recording": encode(frames),
                }
            )
    return rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("exports", nargs="+", type=Path, help="signspeak-my-signs-*.json files")
    parser.add_argument("--contributor", required=True, help="a pseudonymous ID for the person (no names)")
    parser.add_argument("--out", required=True, type=Path, help="landmark JSONL to write")
    parser.add_argument("--pack", default="include", help="pack id of the model's labels (default: include)")
    parser.add_argument("--own", action="store_true", help="also write own words and letters")
    args = parser.parse_args(argv)

    rows: list[dict] = []
    for path in args.exports:
        rows += import_export(
            json.loads(path.read_text(encoding="utf-8")), args.contributor, args.pack, args.own
        )
    args.out.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")
    signs = len({row["text"] for row in rows})
    print(f"{len(rows)} takes of {signs} signs -> {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
