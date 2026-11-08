"""Hydrant status values.

The ESP32 decides the status and sends it on telemetry. The backend stores
that value. It does not derive CLEAR / BLOCKED from distance.
"""

from enum import Enum


class HydrantState(str, Enum):
    CLEAR = "CLEAR"
    POSSIBLY_BLOCKED = "POSSIBLY_BLOCKED"
    BLOCKED = "BLOCKED"
    OFFLINE = "OFFLINE"
