import json
from datetime import UTC, datetime, timedelta

import pytest

from signspeak_api.schemas import FeedbackIn

from .conftest import feedback_body, window


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


class TestRecognize:
    def test_reports_no_model_honestly(self, client):
        assert client.get("/v1/model").json()["available"] is False
        response = client.post("/v1/recognize", json={"feature_spec_version": 1, "frames": window()})
        assert response.status_code == 503
        assert response.json()["detail"]["error"] == "model_unavailable"

    def test_returns_scores_from_a_model(self, model_client):
        info = model_client.get("/v1/model").json()
        assert info["available"] is True and info["model_id"] == "fake"
        response = model_client.post("/v1/recognize", json={"feature_spec_version": 1, "frames": window()})
        assert response.status_code == 200
        body = response.json()
        assert body["scores"][0] == {"label": "hello", "score": 0.8}
        assert "decides whether a result is confident enough" in body["note"]

    @pytest.mark.parametrize(
        "payload",
        [
            {"feature_spec_version": 2, "frames": window()},  # other contract version
            {"feature_spec_version": 1, "frames": []},  # empty
            {"feature_spec_version": 1, "frames": [[0.0] * 10]},  # wrong frame size
            {"feature_spec_version": 1, "frames": window(121)},  # too long
            {
                "feature_spec_version": 1,
                "frames": window(),
                "image": "base64...",
            },  # no extra fields (e.g. pixels)
            {"feature_spec_version": 1, "frames": [["a"] * 156]},  # not numbers
        ],
        ids=["spec-version", "empty", "frame-size", "too-long", "extra-field", "not-numbers"],
    )
    def test_rejects_malformed_input(self, model_client, payload):
        assert model_client.post("/v1/recognize", json=payload).status_code == 422
        assert model_client.provider.calls == 0

    def test_rejects_non_finite_values(self, model_client):
        body = json.dumps({"feature_spec_version": 1, "frames": window()}).replace("0.0", "NaN", 1)
        response = model_client.post(
            "/v1/recognize", content=body, headers={"content-type": "application/json"}
        )
        assert response.status_code == 422
        assert model_client.provider.calls == 0

    def test_errors_do_not_echo_submitted_values(self, client):
        response = client.post("/v1/feedback", json=feedback_body(metadata={"email": "someone@example.com"}))
        assert response.status_code == 422
        assert "someone@example.com" not in response.text
        assert response.json()["detail"]["error"] == "invalid_request"

    def test_a_full_window_of_real_values_fits_the_default_limit(self, model_client):
        frames = [[-0.123456789] * 156 for _ in range(120)]
        response = model_client.post("/v1/recognize", json={"feature_spec_version": 1, "frames": frames})
        assert response.status_code == 200

    def test_rejects_invalid_json(self, model_client):
        response = model_client.post(
            "/v1/recognize", content=b"{", headers={"content-type": "application/json"}
        )
        assert response.status_code == 422


class TestFeedback:
    def test_stores_minimal_feedback(self, client, repo):
        response = client.post("/v1/feedback", json=feedback_body())
        assert response.status_code == 201
        body = response.json()
        assert body["retention_days"] == 180
        stored = repo.get(body["report_id"])
        assert stored["feedback"]["issue_type"] == "wrong_recognition"
        assert stored["feedback"]["model_prediction"]["simulated"] is True

    def test_does_not_store_client_address_or_identifiers(self, client, repo):
        report_id = client.post("/v1/feedback", json=feedback_body()).json()["report_id"]
        stored = json.dumps(repo.get(report_id), default=str)
        assert "testclient" not in stored  # TestClient's client host
        assert "user-agent" not in stored.lower()

    @pytest.mark.parametrize("key", ["email", "phone", "name", "aadhaar", "device_id"])
    def test_refuses_personal_data_in_metadata(self, client, key):
        response = client.post("/v1/feedback", json=feedback_body(metadata={key: "x"}))
        assert response.status_code == 422

    @pytest.mark.parametrize(
        "override",
        [
            {"feature": "camera"},
            {"issue_type": "rant"},
            {"description": ""},
            {"description": "x" * 2001},
            {"metadata": {f"k{i}": i for i in range(21)}},
            {"metadata": {"Bad Key": 1}},
            {"metadata": {"note": "x" * 101}},
            {"contact": "me@example.com"},
        ],
        ids=[
            "feature",
            "issue",
            "empty",
            "too-long",
            "too-many-keys",
            "bad-key",
            "long-value",
            "extra-field",
        ],
    )
    def test_validates_every_field(self, client, override):
        assert client.post("/v1/feedback", json=feedback_body(**override)).status_code == 422

    def test_purges_reports_after_retention(self, repo):
        now = datetime(2026, 9, 1, tzinfo=UTC)
        old = repo.add(FeedbackIn(**feedback_body()), now=now - timedelta(days=200))
        recent = repo.add(FeedbackIn(**feedback_body()), now=now - timedelta(days=10))
        assert repo.purge_older_than(180, now=now) == 1
        assert repo.get(old) is None
        assert repo.get(recent) is not None


class TestLimits:
    def test_rejects_oversized_bodies_before_parsing(self, client):
        response = client.post(
            "/v1/feedback", content=b"x" * 1_100_000, headers={"content-type": "application/json"}
        )
        assert response.status_code == 413
        assert response.json()["detail"]["error"] == "request_too_large"

    def test_requires_a_declared_length(self, client):
        def chunks():
            yield b'{"feature": "other"}'

        response = client.post("/v1/feedback", content=chunks(), headers={"content-type": "application/json"})
        assert response.status_code == 411

    def test_no_cors_unless_configured(self, client):
        response = client.options(
            "/v1/feedback",
            headers={"origin": "https://evil.example", "access-control-request-method": "POST"},
        )
        assert "access-control-allow-origin" not in response.headers

    def test_cors_for_configured_origins(self, repo):
        from fastapi.testclient import TestClient

        from signspeak_api.config import Settings
        from signspeak_api.main import create_app

        app = create_app(
            Settings(database_url="sqlite://", allowed_origins=["https://pilot.example"]), feedback=repo
        )
        response = TestClient(app).options(
            "/v1/feedback",
            headers={"origin": "https://pilot.example", "access-control-request-method": "POST"},
        )
        assert response.headers["access-control-allow-origin"] == "https://pilot.example"

    def test_internal_errors_do_not_leak_details(self, settings):
        from fastapi.testclient import TestClient

        from signspeak_api.main import create_app

        class BrokenRepo:
            def add(self, _):
                raise RuntimeError("database password=hunter2 is wrong")

        client = TestClient(create_app(settings, feedback=BrokenRepo()), raise_server_exceptions=False)
        response = client.post("/v1/feedback", json=feedback_body())
        assert response.status_code == 500
        assert "hunter2" not in response.text


def test_settings_from_environment(monkeypatch):
    from signspeak_api.config import Settings

    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    monkeypatch.setenv("SIGNSPEAK_ALLOWED_ORIGINS", "https://a.example, https://b.example")
    monkeypatch.setenv("SIGNSPEAK_MAX_REQUEST_BYTES", "1234")
    monkeypatch.delenv("SIGNSPEAK_MODEL_DIR", raising=False)
    settings = Settings.from_env()
    assert settings.allowed_origins == ["https://a.example", "https://b.example"]
    assert settings.max_request_bytes == 1234
    assert settings.model_dir is None
