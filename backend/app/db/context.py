"""Bounded operational snapshot for Gemini answers."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from app.db.pool import get_pool


def _jsonable(value: object) -> object:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _rows(records: list) -> list[dict]:
    return [{key: _jsonable(value) for key, value in record.items()} for record in records]


async def load_ops_snapshot() -> dict:
    """Hydrants, risk scores, recent incidents, and recent block transitions."""
    pool = get_pool()
    async with pool.acquire() as conn:
        hydrants = await conn.fetch(
            """
            SELECT id, name, address, state, state_since, last_seen_at
            FROM hydrants
            ORDER BY id
            """
        )
        risk = await conn.fetch(
            """
            SELECT hydrant_id, incidents_30d, avg_clear_s, last_incident_at, risk_score
            FROM hydrant_risk
            """
        )
        incidents = await conn.fetch(
            """
            SELECT id, hydrant_id, status, obstruction_type, opened_at,
                   sensor_cleared_at, ai_summary
            FROM incidents
            WHERE opened_at > now() - INTERVAL '30 days'
               OR status NOT IN ('RESOLVED', 'DISMISSED')
            ORDER BY opened_at DESC
            LIMIT 100
            """
        )
        blocked = await conn.fetch(
            """
            SELECT time, hydrant_id, from_state, reason
            FROM hydrant_state_changes
            WHERE to_state = 'BLOCKED'
            ORDER BY time DESC
            LIMIT 50
            """
        )
    return {
        "hydrants": _rows(hydrants),
        "risk": _rows(risk),
        "incidents": _rows(incidents),
        "recent_blocks": _rows(blocked),
    }
