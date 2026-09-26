"""Annotation schema (one JSON object per line) and validation.

Example line::

    {"sample_id": "s000123", "signer_id": "sg_0042", "label": "hello",
     "video": "sg_0042/clip_0007.mp4", "start_ms": 1200, "end_ms": 2900,
     "language_context": "isl",
     "metadata": {"consent_ref": "c-2026-0042", "annotator_id": "an_03",
                  "annotation_version": 1, "handedness": "right",
                  "camera": "phone_front", "lighting": "indoor",
                  "background": "plain", "distance": "medium", "region": "north"}}

``signer_id`` is a pseudonym. The mapping from pseudonym to a real person lives
only in the consent register held by the data steward, never in the dataset
(docs/dataset.md). Validation rejects fields that look like personal data.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Any

UNKNOWN_LABEL = "__unknown__"

SAMPLE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
SIGNER_ID_RE = re.compile(r"^sg_[a-z0-9]{3,32}$")
LABEL_RE = re.compile(r"^(?:[a-z0-9_]{1,64}|__unknown__)$")

REQUIRED_FIELDS = (
    "sample_id",
    "signer_id",
    "label",
    "video",
    "start_ms",
    "end_ms",
    "language_context",
    "metadata",
)
REQUIRED_METADATA = ("consent_ref", "annotator_id", "annotation_version")
ALLOWED_METADATA = {
    *REQUIRED_METADATA,
    "handedness",
    "camera",
    "lighting",
    "background",
    "distance",
    "region",
    "notes",
    "quality",
}
# Keys that must never appear: identity belongs in the consent register only.
FORBIDDEN_KEYS = {
    "name",
    "full_name",
    "signer_name",
    "email",
    "phone",
    "address",
    "dob",
    "date_of_birth",
    "age",
    "aadhaar",
    "face_image",
    "photo",
    "ip",
    "location_gps",
}


@dataclass(frozen=True)
class Sample:
    sample_id: str
    signer_id: str
    label: str
    video: str
    start_ms: int
    end_ms: int
    language_context: str
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def duration_ms(self) -> int:
        return self.end_ms - self.start_ms


@dataclass
class ValidationReport:
    samples: list[Sample]
    errors: list[str]

    @property
    def ok(self) -> bool:
        return not self.errors


def _validate_record(record: dict[str, Any], where: str) -> list[str]:
    errors: list[str] = []
    missing = [f for f in REQUIRED_FIELDS if f not in record]
    if missing:
        return [f"{where}: missing fields {missing}"]
    extra = set(record) - set(REQUIRED_FIELDS)
    if extra:
        errors.append(f"{where}: unexpected fields {sorted(extra)}")
    forbidden = (set(record) | set(record.get("metadata") or {})) & FORBIDDEN_KEYS
    if forbidden:
        errors.append(f"{where}: personal data fields are not allowed: {sorted(forbidden)}")

    if not isinstance(record["sample_id"], str) or not SAMPLE_ID_RE.match(record["sample_id"]):
        errors.append(f"{where}: invalid sample_id")
    if not isinstance(record["signer_id"], str) or not SIGNER_ID_RE.match(record["signer_id"]):
        errors.append(f"{where}: signer_id must be a pseudonym like 'sg_0042'")
    if not isinstance(record["label"], str) or not LABEL_RE.match(record["label"]):
        errors.append(f"{where}: label must be snake_case or {UNKNOWN_LABEL}")

    video = record["video"]
    if not isinstance(video, str) or not video:
        errors.append(f"{where}: video must be a relative path")
    else:
        path = PurePosixPath(video)
        if path.is_absolute() or ".." in path.parts or "\\" in video:
            errors.append(f"{where}: video must be a relative path inside raw/")

    start, end = record["start_ms"], record["end_ms"]
    if (
        not (isinstance(start, int) and isinstance(end, int))
        or isinstance(start, bool)
        or isinstance(end, bool)
    ):
        errors.append(f"{where}: start_ms and end_ms must be integers")
    elif start < 0 or end <= start:
        errors.append(f"{where}: require 0 <= start_ms < end_ms")

    if not isinstance(record["language_context"], str) or not record["language_context"]:
        errors.append(f"{where}: language_context is required")

    metadata = record["metadata"]
    if not isinstance(metadata, dict):
        errors.append(f"{where}: metadata must be an object")
    else:
        missing_meta = [k for k in REQUIRED_METADATA if not metadata.get(k)]
        if missing_meta:
            errors.append(f"{where}: metadata missing {missing_meta} (consent reference is mandatory)")
        unknown_meta = set(metadata) - ALLOWED_METADATA - FORBIDDEN_KEYS
        if unknown_meta:
            errors.append(f"{where}: unknown metadata keys {sorted(unknown_meta)}")
    return errors


def parse_records(lines: Iterable[str]) -> ValidationReport:
    samples: list[Sample] = []
    errors: list[str] = []
    seen: set[str] = set()
    for number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        where = f"line {number}"
        try:
            record = json.loads(line)
        except json.JSONDecodeError as exc:
            errors.append(f"{where}: invalid JSON ({exc.msg})")
            continue
        if not isinstance(record, dict):
            errors.append(f"{where}: expected a JSON object")
            continue
        record_errors = _validate_record(record, where)
        if not record_errors and record["sample_id"] in seen:
            record_errors.append(f"{where}: duplicate sample_id {record['sample_id']}")
        if record_errors:
            errors.extend(record_errors)
            continue
        seen.add(record["sample_id"])
        samples.append(Sample(**{k: record[k] for k in REQUIRED_FIELDS}))
    return ValidationReport(samples, errors)


def load_annotations(path: Path) -> ValidationReport:
    with Path(path).open(encoding="utf-8") as handle:
        return parse_records(handle)


def write_annotations(path: Path, samples: Iterable[Sample]) -> None:
    with Path(path).open("w", encoding="utf-8") as handle:
        for s in samples:
            record = {k: getattr(s, k) for k in REQUIRED_FIELDS}
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
