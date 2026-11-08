/**
 * obstructionDetector — browser-side hysteresis for a live ESP32 distance stream.
 *
 * Mirrors the backend state machine in docs/ARCHITECTURE.md (block threshold, clear
 * threshold, confirm delay), with demo-friendly timings so a box placed in front of the
 * sensor turns the hydrant red within a few seconds.
 */
import type { HydrantStatus } from "@/types";
import { BLOCK_THRESHOLD_CM, CLEAR_THRESHOLD_CM } from "./telemetryService";

export const DEVICE_TIMING = {
  /** Below the block threshold this long → "possible obstruction". */
  warnAfterMs: 1000,
  /** Below the block threshold this long → confirmed block. */
  confirmAfterMs: 4000,
  /** Above the clear threshold this long → clear. */
  clearAfterMs: 2000,
  /** No packets this long → sensor offline. */
  offlineAfterMs: 10000,
};

/** HC-SR04 range. A reading of 0 (no echo) means nothing is in front of the sensor. */
export const MAX_RANGE_CM = 400;

export interface DetectorState {
  belowSince: number | null;
  aboveSince: number | null;
}

export const freshDetector = (): DetectorState => ({ belowSince: null, aboveSince: null });

export type Transition = "warning" | "blocked" | "clear" | null;

export function detect(d: DetectorState, status: HydrantStatus, distanceCm: number, t: number): { state: DetectorState; transition: Transition } {
  const below = distanceCm < BLOCK_THRESHOLD_CM;
  const above = distanceCm > CLEAR_THRESHOLD_CM;
  const state: DetectorState = {
    belowSince: below ? (d.belowSince ?? t) : null,
    aboveSince: above ? (d.aboveSince ?? t) : null,
  };
  let transition: Transition = null;
  if (state.belowSince !== null) {
    const held = t - state.belowSince;
    if (held >= DEVICE_TIMING.confirmAfterMs && status !== "blocked") transition = "blocked";
    else if (held >= DEVICE_TIMING.warnAfterMs && status === "clear") transition = "warning";
  } else if (state.aboveSince !== null && (status === "blocked" || status === "warning")) {
    if (t - state.aboveSince >= DEVICE_TIMING.clearAfterMs) transition = "clear";
  }
  return { state, transition };
}
