"""Pure hydrant state machine (no I/O). See docs/ARCHITECTURE.md §1.

States: CLEAR, POSSIBLY_BLOCKED, BLOCKED, OFFLINE.
Uses block/clear thresholds (hysteresis), consecutive-reading counters,
and a confirmation window before BLOCKED. Implementation: TODO.
"""
from enum import Enum


class HydrantState(str, Enum):
    CLEAR = "CLEAR"
    POSSIBLY_BLOCKED = "POSSIBLY_BLOCKED"
    BLOCKED = "BLOCKED"
    OFFLINE = "OFFLINE"
