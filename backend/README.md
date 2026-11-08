# Hydrant Halo — Backend

FastAPI service deployed on Vultr via Docker Compose.

| Module | Responsibility |
|---|---|
| `app/core` | settings (env vars), logging, auth helpers |
| `app/db` | asyncpg pool + SQL queries |
| `app/models` | Pydantic models for MQTT payloads, API I/O, Gemini output schema |
| `app/mqtt` | RabbitMQ consumer bound to `amq.topic` (`halo.v1.hydrants.*.telemetry`) |
| `app/services` | `state_machine` (pure), `incidents`, `gemini`, `opencv_check`, `storage` |
| `app/api` | REST routers under `/api/v1` |
| `app/ws` | WebSocket manager, `/ws` endpoint |
| `db/init` | TimescaleDB schema — run against Tiger Data with `psql "$DATABASE_URL" -f db/init/001_schema.sql` |
| `simulator` | Fake sensor nodes for dev/demo (always `source=simulated`) |

## Run locally

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Or from the repo root: `docker compose up -d --build`.
