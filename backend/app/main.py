import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.mqtt.consumer import ingest
from app.ws.manager import hub

try:
    from app.api.ask import router as ask_router
except Exception:
    ask_router = None

try:
    from app.api.notify import router as notify_router
except Exception:
    notify_router = None

try:
    from app.db import close_db, init_db, ping
except Exception:
    close_db = init_db = ping = None

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if init_db is not None:
        try:
            await init_db()
        except Exception:
            logger.exception("database init failed; MQTT ingest will still run")
    await ingest.start()
    yield
    await ingest.stop()
    if close_db is not None:
        await close_db()


app = FastAPI(title="Fire Fighters API", version="0.1.0", lifespan=lifespan)

if ask_router is not None:
    app.include_router(ask_router)
if notify_router is not None:
    app.include_router(notify_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    mqtt = ingest.snapshot()
    database = "unavailable"
    if ping is not None:
        database = "ok"
        try:
            await ping()
        except Exception:
            database = "error"
    return {
        "status": "ok" if database == "ok" else "degraded",
        "mode": settings.app_mode,
        "database": database,
        "mqtt_connected": mqtt["connected"],
        "mqtt_received": mqtt["received"],
        "mqtt_rejected": mqtt["rejected"],
    }


@app.get("/api/v1/live")
async def live() -> dict:
    """Latest ESP32 report. Also written to Timescale when the pool is up."""
    return ingest.snapshot()


@app.websocket("/ws")
async def websocket(socket: WebSocket) -> None:
    await hub.connect(socket)
    try:
        while True:
            await socket.receive_text()
    except WebSocketDisconnect:
        hub.disconnect(socket)
