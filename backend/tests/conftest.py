import pytest
from fastapi.testclient import TestClient

from signspeak_api.config import Settings
from signspeak_api.feedback import SqlFeedbackRepository, make_engine
from signspeak_api.main import create_app
from signspeak_api.schemas import FRAME_DIM, ModelInfo, RecognizeResponse, ScoredLabel


class FakeProvider:
    """Stands in for a trained model pack in tests."""

    def __init__(self):
        self.calls = 0

    def info(self) -> ModelInfo:
        return ModelInfo(
            available=True, model_id="fake", labels=["hello", "water"], calibrated=False, window_frames=32
        )

    def recognize(self, frames):
        self.calls += 1
        return RecognizeResponse(
            model_id="fake",
            calibrated=False,
            scores=[ScoredLabel(label="hello", score=0.8), ScoredLabel(label="water", score=0.2)],
            latency_ms=1.0,
        )


@pytest.fixture
def repo():
    return SqlFeedbackRepository(make_engine("sqlite://"))


@pytest.fixture
def settings():
    return Settings(database_url="sqlite://")  # production default body limit (1 MB)


@pytest.fixture
def client(settings, repo):
    return TestClient(create_app(settings, feedback=repo))


@pytest.fixture
def model_client(settings, repo):
    provider = FakeProvider()
    client = TestClient(create_app(settings, feedback=repo, recognition=provider))
    client.provider = provider
    return client


def window(frames: int = 32, value: float = 0.0):
    return [[value] * FRAME_DIM for _ in range(frames)]


def feedback_body(**overrides):
    body = {
        "feature": "sign_to_text",
        "issue_type": "wrong_recognition",
        "description": "Showed WATER when I signed THANK YOU in low light.",
        "expected_result": "Thank you",
        "model_prediction": {"label": "water", "band": None, "model_id": "mock-demo", "simulated": True},
        "environment": {
            "app_version": "0.1.0",
            "platform": "android",
            "os_version": "14",
            "app_language": "hi",
            "output_language": "en",
        },
        "metadata": {"lighting": "low", "camera": "back"},
    }
    body.update(overrides)
    return body
