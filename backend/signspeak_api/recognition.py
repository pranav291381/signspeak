"""Server-side recognition provider.

Server inference is optional and off unless a model pack is configured
(SIGNSPEAK_MODEL_DIR). It only ever receives landmark sequences, keeps nothing,
and must be enabled in the app only with the user's explicit consent
(docs/privacy.md, "Server inference").
"""

from __future__ import annotations

from typing import Protocol

from .schemas import ModelInfo, RecognizeResponse, ScoredLabel

TOP_K = 5


class ModelUnavailableError(RuntimeError):
    pass


class RecognitionProvider(Protocol):
    def info(self) -> ModelInfo: ...

    def recognize(self, frames: list[list[float]]) -> RecognizeResponse: ...


class NoModelProvider:
    """Default: honest 'no model installed'."""

    def info(self) -> ModelInfo:
        return ModelInfo(available=False)

    def recognize(self, frames: list[list[float]]) -> RecognizeResponse:
        raise ModelUnavailableError("no recognition model is installed on this server")


class ModelPackProvider:  # pragma: no cover - exercised only with a trained pack and the [ml] extra
    """Adapter over signspeak_ml.InferenceEngine (imported lazily; needs PyTorch)."""

    def __init__(self, model_dir: str):
        from signspeak_ml.inference import InferenceEngine

        self.engine = InferenceEngine(model_dir)

    def info(self) -> ModelInfo:
        info = self.engine.info
        return ModelInfo(
            available=True,
            model_id=info["id"],
            labels=info["labels"],
            calibrated=info["calibrated"],
            feature_spec_version=info["feature_spec_version"],
            window_frames=info["window_frames"],
        )

    def recognize(self, frames: list[list[float]]) -> RecognizeResponse:
        import numpy as np

        prediction = self.engine.predict(np.asarray(frames, dtype=np.float32))
        info = self.engine.info
        return RecognizeResponse(
            model_id=info["id"],
            calibrated=info["calibrated"],
            scores=[ScoredLabel(label=s.label, score=s.score) for s in prediction.scores[:TOP_K]],
            latency_ms=prediction.latency_ms,
        )


def provider_from_settings(model_dir: str | None) -> RecognitionProvider:
    return ModelPackProvider(model_dir) if model_dir else NoModelProvider()
