"""Request/response schemas. Everything is validated; nothing accepts images or video."""

from __future__ import annotations

import math
import re
from enum import Enum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

FEATURE_SPEC_VERSION = 1
FRAME_DIM = 156
MAX_FRAMES = 120  # 8 s at 15 fps; the app sends 32-frame windows

# Keys that would carry personal data are refused in free-form metadata.
FORBIDDEN_METADATA_KEYS = {
    "name",
    "full_name",
    "email",
    "phone",
    "address",
    "dob",
    "date_of_birth",
    "age",
    "aadhaar",
    "ip",
    "location",
    "gps",
    "device_id",
    "advertising_id",
}
METADATA_KEY_RE = re.compile(r"^[a-z][a-z0-9_]{0,31}$")


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


# ---- Health / model ------------------------------------------------------


class Health(StrictModel):
    status: str
    version: str


class ModelInfo(StrictModel):
    available: bool
    model_id: str | None = None
    labels: list[str] = []
    calibrated: bool = False
    feature_spec_version: int = FEATURE_SPEC_VERSION
    window_frames: int | None = None


# ---- Recognition -----------------------------------------------------------

Frame = Annotated[list[float], Field(min_length=FRAME_DIM, max_length=FRAME_DIM)]


class RecognizeRequest(StrictModel):
    """A window of landmark frames (feature spec v1). Never pixels."""

    feature_spec_version: int
    frames: Annotated[list[Frame], Field(min_length=1, max_length=MAX_FRAMES)]

    @field_validator("feature_spec_version")
    @classmethod
    def _spec(cls, value: int) -> int:
        if value != FEATURE_SPEC_VERSION:
            raise ValueError(f"feature_spec_version must be {FEATURE_SPEC_VERSION}")
        return value

    @field_validator("frames")
    @classmethod
    def _finite(cls, frames: list[list[float]]) -> list[list[float]]:
        for frame in frames:
            if not all(math.isfinite(v) for v in frame):
                raise ValueError("frames must contain only finite numbers")
        return frames


class ScoredLabel(StrictModel):
    label: str
    score: float


class RecognizeResponse(StrictModel):
    model_id: str
    calibrated: bool
    scores: list[ScoredLabel]
    latency_ms: float
    note: str = "Scores only. The app decides whether a result is confident enough to show."


# ---- Feedback ----------------------------------------------------------------


class Feature(str, Enum):
    sign_to_text = "sign_to_text"
    text_to_isl = "text_to_isl"
    learn = "learn"
    history = "history"
    settings = "settings"
    other = "other"


class IssueType(str, Enum):
    wrong_recognition = "wrong_recognition"
    not_recognized = "not_recognized"
    accessibility = "accessibility"
    content = "content"
    language = "language"
    crash = "crash"
    performance = "performance"
    privacy = "privacy"
    feature_request = "feature_request"
    other = "other"


class Platform(str, Enum):
    android = "android"
    ios = "ios"
    web = "web"
    other = "other"


class Environment(StrictModel):
    app_version: Annotated[str, Field(max_length=32)]
    platform: Platform
    os_version: Annotated[str | None, Field(max_length=32)] = None
    app_language: Annotated[str, Field(pattern=r"^[a-z]{2,3}$")]
    output_language: Annotated[str, Field(pattern=r"^[a-z]{2,3}$")]


class ModelPrediction(StrictModel):
    label: Annotated[str | None, Field(max_length=64)] = None
    band: Annotated[str | None, Field(pattern=r"^(high|medium)$")] = None
    model_id: Annotated[str | None, Field(max_length=64)] = None
    simulated: bool = False


MetadataValue = str | int | float | bool


class FeedbackIn(StrictModel):
    feature: Feature
    issue_type: IssueType
    description: Annotated[str, Field(min_length=1, max_length=2000)]
    expected_result: Annotated[str | None, Field(max_length=500)] = None
    model_prediction: ModelPrediction | None = None
    environment: Environment
    metadata: Annotated[dict[str, MetadataValue], Field(max_length=20)] = {}

    @field_validator("metadata")
    @classmethod
    def _metadata(cls, value: dict[str, MetadataValue]) -> dict[str, MetadataValue]:
        for key, item in value.items():
            if not METADATA_KEY_RE.match(key):
                raise ValueError(f"invalid metadata key: {key!r}")
            if key in FORBIDDEN_METADATA_KEYS:
                raise ValueError(f"personal data is not accepted: {key!r}")
            if isinstance(item, str) and len(item) > 100:
                raise ValueError(f"metadata value too long: {key!r}")
        return value


class FeedbackOut(StrictModel):
    report_id: str
    retention_days: int
