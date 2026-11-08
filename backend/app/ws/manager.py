"""WebSocket fan-out for live ESP32 telemetry."""

from __future__ import annotations

import json
from typing import Any

from fastapi import WebSocket


class Hub:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()

    async def connect(self, socket: WebSocket) -> None:
        await socket.accept()
        self._clients.add(socket)

    def disconnect(self, socket: WebSocket) -> None:
        self._clients.discard(socket)

    async def broadcast(self, payload: dict[str, Any]) -> None:
        if not self._clients:
            return
        text = json.dumps(payload)
        dead: list[WebSocket] = []
        for socket in list(self._clients):
            try:
                await socket.send_text(text)
            except Exception:
                dead.append(socket)
        for socket in dead:
            self.disconnect(socket)


hub = Hub()
