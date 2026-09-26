# signspeak-api (optional backend)

The mobile app works fully **without** this service. It exists for NGO pilots and research:

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Liveness |
| `GET /v1/model` | Server-side model info. `available: false` unless a model pack is configured |
| `POST /v1/recognize` | Scores for **one window of landmark frames** (feature spec v1). Never accepts images or video. Nothing is stored. Returns `503 model_unavailable` when no model is installed |
| `POST /v1/feedback` | Minimal structured feedback (see `docs/pilot.md`). No IP address, account or device ID is stored |

## Run locally

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest
uvicorn signspeak_api.main:app --reload     # http://127.0.0.1:8000/docs
```

## Configuration (environment variables, see `../.env.example`)

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite:///./signspeak-dev.db` | Use PostgreSQL in deployment: `postgresql+psycopg://…` (`pip install -e ".[postgres]"`) |
| `SIGNSPEAK_MODEL_DIR` | empty | Model pack directory. Needs `pip install -e ".[ml]"` (PyTorch) |
| `SIGNSPEAK_ALLOWED_ORIGINS` | empty | CORS origins (only needed for web clients) |
| `SIGNSPEAK_MAX_REQUEST_BYTES` | `1000000` | Larger bodies get 413. Bodies must declare `Content-Length` (411 otherwise) |
| `SIGNSPEAK_FEEDBACK_RETENTION_DAYS` | `180` | Reported to clients. Enforce it with a scheduled `purge_older_than` job |

## Security notes

- Every request body is validated with strict schemas (unknown fields are rejected), and personal-data keys are refused in feedback metadata.
- Error responses never echo submitted values or internal details.
- There is no authentication yet. Deploy behind HTTPS with rate limiting at the reverse proxy, and add auth before any non-pilot use.
- The schema is created at start-up. Add migrations (Alembic) before production.
