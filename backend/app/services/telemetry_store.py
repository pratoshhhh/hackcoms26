"""Write an ESP32 report into Tiger Data (TimescaleDB).

distance_cm is the side distance. That is the value the dashboard treats as
"something beside the hydrant." snow_distance_cm is stored and not used for state.
Temperature is not part of this report.
"""

from __future__ import annotations

import logging

from app.models.payloads import DeviceReport

logger = logging.getLogger(__name__)

BLOCK_CM = 40.0
CLEAR_CM = 60.0


def classify(side_distance_cm: float) -> str:
    if side_distance_cm < BLOCK_CM:
        return "BLOCKED"
    if side_distance_cm > CLEAR_CM:
        return "CLEAR"
    return "POSSIBLY_BLOCKED"


async def save_report(report: DeviceReport, previous_state: str | None) -> str | None:
    """Upsert the hydrant and insert one reading. Returns the new state, or None if the DB is down."""
    try:
        from app.db.pool import get_pool

        pool = get_pool()
    except Exception:
        return None

    state = classify(report.side_distance_cm)
    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(
                    """
                    INSERT INTO hydrants (id, name, lat, lng, qr_token, state, last_seen_at, is_simulated)
                    VALUES ($1, $1, 0, 0, $2, $3, now(), FALSE)
                    ON CONFLICT (id) DO UPDATE SET
                        last_seen_at = now(),
                        state = EXCLUDED.state,
                        state_since = CASE
                            WHEN hydrants.state IS DISTINCT FROM EXCLUDED.state THEN now()
                            ELSE hydrants.state_since
                        END
                    """,
                    report.hydrant_id,
                    f"qr-{report.hydrant_id}",
                    state,
                )
                await conn.execute(
                    """
                    INSERT INTO sensor_readings (
                        time, hydrant_id, seq, distance_cm,
                        device_id, side_distance_cm, snow_distance_cm, source
                    )
                    VALUES (now(), $1, $2, $3, $4, $5, $6, 'device')
                    """,
                    report.hydrant_id,
                    report.sequence,
                    report.side_distance_cm,
                    report.device_id,
                    report.side_distance_cm,
                    report.snow_distance_cm,
                )
                if previous_state != state:
                    await conn.execute(
                        """
                        INSERT INTO hydrant_state_changes (time, hydrant_id, from_state, to_state, reason)
                        VALUES (now(), $1, $2, $3, $4)
                        """,
                        report.hydrant_id,
                        previous_state or "OFFLINE",
                        state,
                        f"side {report.side_distance_cm:.1f} cm, snow {report.snow_distance_cm:.1f} cm",
                    )
    except Exception:
        logger.exception("failed to store report for %s", report.hydrant_id)
        return None
    return state
