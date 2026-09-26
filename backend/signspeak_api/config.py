"""Configuration from environment variables (see the repository's .env.example). No secrets in code."""

from __future__ import annotations

import os
from dataclasses import dataclass, field


def _list(value: str | None) -> list[str]:
    return [item.strip() for item in (value or "").split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    database_url: str = "sqlite:///./signspeak-dev.db"
    model_dir: str | None = None
    allowed_origins: list[str] = field(default_factory=list)
    max_request_bytes: int = 1_000_000
    feedback_retention_days: int = 180

    @classmethod
    def from_env(cls) -> Settings:
        return cls(
            database_url=os.environ.get("DATABASE_URL") or cls.database_url,
            model_dir=os.environ.get("SIGNSPEAK_MODEL_DIR") or None,
            allowed_origins=_list(os.environ.get("SIGNSPEAK_ALLOWED_ORIGINS")),
            max_request_bytes=int(os.environ.get("SIGNSPEAK_MAX_REQUEST_BYTES") or cls.max_request_bytes),
            feedback_retention_days=int(
                os.environ.get("SIGNSPEAK_FEEDBACK_RETENTION_DAYS") or cls.feedback_retention_days
            ),
        )
