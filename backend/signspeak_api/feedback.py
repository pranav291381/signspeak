"""Feedback storage. SQLite for development and tests, PostgreSQL in deployment (DATABASE_URL)."""

from __future__ import annotations

import json
import secrets
from datetime import UTC, datetime, timedelta
from typing import Protocol

from sqlalchemy import DateTime, String, Text, create_engine, delete, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column
from sqlalchemy.pool import StaticPool

from .schemas import FeedbackIn


class Base(DeclarativeBase):
    pass


class FeedbackRecord(Base):
    """One report. No IP address, account or device identifier is stored."""

    __tablename__ = "feedback"

    report_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    feature: Mapped[str] = mapped_column(String(32))
    issue_type: Mapped[str] = mapped_column(String(32))
    payload: Mapped[str] = mapped_column(Text)


class FeedbackRepository(Protocol):
    def add(self, feedback: FeedbackIn) -> str: ...

    def get(self, report_id: str) -> dict | None: ...

    def purge_older_than(self, days: int, now: datetime | None = None) -> int: ...


def make_engine(database_url: str) -> Engine:
    if database_url.startswith("sqlite"):
        kwargs: dict = {"connect_args": {"check_same_thread": False}}
        if database_url in ("sqlite://", "sqlite:///:memory:"):
            kwargs["poolclass"] = StaticPool
        return create_engine(database_url, **kwargs)
    return create_engine(database_url, pool_pre_ping=True)


class SqlFeedbackRepository:
    def __init__(self, engine: Engine):
        self.engine = engine
        # Schema is created on start-up for now; use migrations (Alembic) before production.
        Base.metadata.create_all(engine)

    def add(self, feedback: FeedbackIn, now: datetime | None = None) -> str:
        report_id = secrets.token_hex(8)
        record = FeedbackRecord(
            report_id=report_id,
            created_at=now or datetime.now(UTC),
            feature=feedback.feature.value,
            issue_type=feedback.issue_type.value,
            payload=feedback.model_dump_json(),
        )
        with Session(self.engine) as session, session.begin():
            session.add(record)
        return report_id

    def get(self, report_id: str) -> dict | None:
        with Session(self.engine) as session:
            record = session.get(FeedbackRecord, report_id)
            if record is None:
                return None
            return {
                "report_id": record.report_id,
                "created_at": record.created_at,
                "feedback": json.loads(record.payload),
            }

    def purge_older_than(self, days: int, now: datetime | None = None) -> int:
        """Delete reports past the retention period. Returns how many were deleted."""
        cutoff = (now or datetime.now(UTC)) - timedelta(days=days)
        with Session(self.engine) as session, session.begin():
            result = session.execute(delete(FeedbackRecord).where(FeedbackRecord.created_at < cutoff))
            return int(result.rowcount or 0)

    def count(self) -> int:
        with Session(self.engine) as session:
            return len(session.execute(select(FeedbackRecord.report_id)).all())
