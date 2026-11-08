"""Consume device reports from RabbitMQ.

Devices publish MQTT. The RabbitMQ MQTT plugin lands those messages on the
amq.topic exchange. This module is the only AMQP consumer.

Topic:  hydrants/{hydrantId}/telemetry
Key:    hydrants.{hydrantId}.telemetry

The queue used to be bound to halo.v1.hydrants.*.telemetry. That pattern
came from an earlier plan. The firmware publishes hydrants/{id}/telemetry,
so messages sat on the exchange and never entered this queue.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import aio_pika
import aio_pika.abc

from app.core.config import settings
from app.models.payloads import DeviceReport
from app.services.telemetry_store import classify, save_report
from app.ws.manager import hub

logger = logging.getLogger(__name__)

QUEUE = "halo.device.reports"
ROUTING_KEY = "hydrants.*.telemetry"
OLD_ROUTING_KEY = "halo.v1.hydrants.*.telemetry"


class MqttIngest:
    def __init__(self, url: str | None = None) -> None:
        self.url = url or settings.rabbitmq_url
        self.connected = False
        self.received = 0
        self.rejected = 0
        self.latest: dict[str, DeviceReport] = {}
        self.states: dict[str, str] = {}
        self._stop = asyncio.Event()
        self._task: asyncio.Task[None] | None = None
        self._connection: aio_pika.abc.AbstractRobustConnection | None = None

    async def start(self) -> None:
        if self._task is not None:
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run(), name="mqtt-ingest")

    async def stop(self) -> None:
        self._stop.set()
        task = self._task
        self._task = None
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self.connected = False

    def snapshot(self) -> dict[str, Any]:
        return {
            "connected": self.connected,
            "received": self.received,
            "rejected": self.rejected,
            "hydrants": {
                report.hydrant_id: {
                    "deviceId": report.device_id,
                    "sequence": report.sequence,
                    "sideDistanceCm": report.side_distance_cm,
                    "snowDistanceCm": report.snow_distance_cm,
                    "distanceCm": report.side_distance_cm,
                    "state": self.states.get(report.hydrant_id, classify(report.side_distance_cm)),
                }
                for report in self.latest.values()
            },
        }

    async def _run(self) -> None:
        while not self._stop.is_set():
            try:
                connection = await aio_pika.connect_robust(self.url)
                self._connection = connection
                channel = await connection.channel()
                await channel.set_qos(prefetch_count=32)
                exchange = await channel.declare_exchange(
                    "amq.topic",
                    aio_pika.ExchangeType.TOPIC,
                    passive=True,
                )
                queue = await channel.declare_queue(QUEUE, durable=True)
                await queue.bind(exchange, routing_key=ROUTING_KEY)
                try:
                    await queue.unbind(exchange, routing_key=OLD_ROUTING_KEY)
                except Exception:
                    logger.info("old binding %s was already gone", OLD_ROUTING_KEY)
                await queue.consume(self._on_message)
                self.connected = True
                logger.info("mqtt ingest bound %s -> %s", ROUTING_KEY, QUEUE)
                await self._stop.wait()
                await connection.close()
            except asyncio.CancelledError:
                if self._connection is not None:
                    await self._connection.close()
                raise
            except Exception:
                self.connected = False
                logger.exception("mqtt ingest failed; retrying in 3s")
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=3)
                except asyncio.TimeoutError:
                    pass

    async def _on_message(self, message: aio_pika.abc.AbstractIncomingMessage) -> None:
        async with message.process(requeue=False):
            report = self._apply(message.body)
            if report is not None:
                await self._publish(report)

    def _apply(self, body: bytes) -> DeviceReport | None:
        try:
            report = DeviceReport.model_validate(json.loads(body))
        except Exception:
            self.rejected += 1
            logger.warning("dropped device payload: %s", body[:300])
            return None

        previous = self.latest.get(report.hydrant_id)
        if previous is not None and report.sequence < previous.sequence:
            return None

        self.latest[report.hydrant_id] = report
        self.received += 1
        if previous is None or previous.sequence != report.sequence:
            logger.info(
                "hydrant %s seq %s side %.1f cm snow %.1f cm",
                report.hydrant_id,
                report.sequence,
                report.side_distance_cm,
                report.snow_distance_cm,
            )
        return report

    async def _publish(self, report: DeviceReport) -> None:
        from datetime import datetime, timezone

        previous = self.states.get(report.hydrant_id)
        stored = await save_report(report, previous)
        state = stored or classify(report.side_distance_cm)
        self.states[report.hydrant_id] = state
        await hub.broadcast(
            {
                "type": "telemetry",
                "ts": datetime.now(timezone.utc).isoformat(),
                "data": {
                    "hydrant_id": report.hydrant_id,
                    "hydrantId": report.hydrant_id,
                    "deviceId": report.device_id,
                    "distance_cm": report.side_distance_cm,
                    "sideDistanceCm": report.side_distance_cm,
                    "snowDistanceCm": report.snow_distance_cm,
                    "sequence": report.sequence,
                    "source": "device",
                    "state": state,
                },
            }
        )


ingest = MqttIngest()
