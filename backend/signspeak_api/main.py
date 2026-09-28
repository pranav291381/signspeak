"""SignSpeak optional backend.

The app works fully without this service. It provides:
- GET  /health
- GET  /v1/model       server-side model info ("available": false by default)
- POST /v1/recognize   landmark windows only (never images/video); nothing is stored
- POST /v1/feedback    minimal structured feedback; no IP, account or device ID stored

Run: uvicorn signspeak_api.main:app
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import __version__
from .config import Settings
from .feedback import FeedbackRepository, SqlFeedbackRepository, make_engine
from .recognition import ModelUnavailableError, RecognitionProvider, provider_from_settings
from .schemas import FeedbackIn, FeedbackOut, Health, ModelInfo, RecognizeRequest, RecognizeResponse

_BODY_METHODS = {b"POST", b"PUT", b"PATCH"}


class RequestSizeLimit:
    """Reject bodies over the limit before reading them (pure ASGI middleware).

    Requests with a body must declare Content-Length; the server (h11/httptools)
    guarantees the body does not exceed it.
    """

    def __init__(self, app: Any, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope["type"] == "http" and scope["method"].encode() in _BODY_METHODS:
            headers = dict(scope["headers"])
            length = headers.get(b"content-length")
            if length is None or not length.isdigit():
                await self._reject(send, status.HTTP_411_LENGTH_REQUIRED, "length_required")
                return
            if int(length) > self.max_bytes:
                await self._reject(send, status.HTTP_413_CONTENT_TOO_LARGE, "request_too_large")
                return
        await self.app(scope, receive, send)

    @staticmethod
    async def _reject(send: Any, code: int, error: str) -> None:
        body = f'{{"detail":{{"error":"{error}"}}}}'.encode()
        await send(
            {
                "type": "http.response.start",
                "status": code,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})


def create_app(
    settings: Settings | None = None,
    *,
    feedback: FeedbackRepository | None = None,
    recognition: RecognitionProvider | None = None,
) -> FastAPI:
    settings = settings or Settings.from_env()
    feedback_repo = feedback or SqlFeedbackRepository(make_engine(settings.database_url))
    provider = recognition or provider_from_settings(settings.model_dir)

    app = FastAPI(title="SignSpeak API", version=__version__)
    app.add_middleware(RequestSizeLimit, max_bytes=settings.max_request_bytes)
    if settings.allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.allowed_origins,
            allow_methods=["GET", "POST"],
            allow_headers=["content-type"],
        )

    @app.get("/health", response_model=Health)
    def health() -> Health:
        return Health(status="ok", version=__version__)

    @app.get("/v1/model", response_model=ModelInfo)
    def model_info() -> ModelInfo:
        return provider.info()

    @app.post(
        "/v1/recognize",
        response_model=RecognizeResponse,
        responses={503: {"description": "No recognition model is installed"}},
    )
    def recognize(request: RecognizeRequest) -> RecognizeResponse:
        try:
            return provider.recognize(request.frames)
        except ModelUnavailableError as exc:
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"error": "model_unavailable", "message": str(exc)},
            ) from exc

    @app.post("/v1/feedback", response_model=FeedbackOut, status_code=status.HTTP_201_CREATED)
    def submit_feedback(report: FeedbackIn) -> FeedbackOut:
        report_id = feedback_repo.add(report)
        return FeedbackOut(report_id=report_id, retention_days=settings.feedback_retention_days)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_request: Any, exc: RequestValidationError) -> JSONResponse:
        # Report where and why, but never echo submitted values back.
        errors = [
            {"loc": list(e.get("loc", ())), "msg": e.get("msg"), "type": e.get("type")} for e in exc.errors()
        ]
        return JSONResponse(
            status_code=422, content={"detail": {"error": "invalid_request", "errors": errors}}
        )

    @app.exception_handler(Exception)
    async def unexpected_error(_request: Any, _exc: Exception) -> JSONResponse:
        # Never echo internals (or request data) back to clients.
        return JSONResponse(status_code=500, content={"detail": {"error": "internal_error"}})

    return app


def __getattr__(name: str) -> Any:
    # `uvicorn signspeak_api.main:app` builds the app on first access, so importing
    # this module (e.g. in tests) has no side effects such as creating a database.
    if name == "app":
        return create_app()
    raise AttributeError(name)
