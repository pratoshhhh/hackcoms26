from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db import close_db, init_db, ping


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await init_db()
    yield
    await close_db()


app = FastAPI(title="Hydrant Halo API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    # TODO: report RabbitMQ connectivity
    database = "ok"
    try:
        await ping()
    except Exception:
        database = "error"
    return {
        "status": "ok" if database == "ok" else "degraded",
        "mode": settings.app_mode,
        "database": database,
    }


# Routers (to be implemented):
#   app.api.hydrants, app.api.incidents, app.api.claims,
#   app.api.payouts, app.api.analytics, app.api.ingest
# WebSocket: app.ws.manager -> /ws
# Startup: app.mqtt.consumer (RabbitMQ), offline sweeper
