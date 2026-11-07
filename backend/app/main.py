from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

app = FastAPI(title="Hydrant Halo API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    # TODO: report DB + RabbitMQ connectivity
    return {"status": "ok", "mode": settings.app_mode}


# Routers (to be implemented):
#   app.api.hydrants, app.api.incidents, app.api.claims,
#   app.api.payouts, app.api.analytics, app.api.ingest
# WebSocket: app.ws.manager -> /ws
# Startup: app.mqtt.consumer (RabbitMQ), offline sweeper
