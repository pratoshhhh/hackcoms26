/**
 * telemetryService — deterministic simulated sensor readings.
 *
 * readingAt(h, t) is a pure function of the hydrant seed, time, and incident intervals,
 * so every range (1H…30D) and every component sees the same numbers, and a demo
 * obstruction immediately shows up in the chart.
 *
 * Swap for: GET /api/v1/hydrants/{id}/readings?from&to&bucket (Tiger Data continuous aggregate).
 */
import type { Hydrant, Incident, SensorReading, TimeRange } from "@/types";
import { noise1d } from "@/utils/random";

export const BLOCK_THRESHOLD_CM = 40;
export const CLEAR_THRESHOLD_CM = 60;

export const RANGES: Record<TimeRange, { spanMs: number; stepMs: number; label: string }> = {
  "1H": { spanMs: 3600e3, stepMs: 60e3, label: "Last hour" },
  "6H": { spanMs: 6 * 3600e3, stepMs: 5 * 60e3, label: "Last 6 hours" },
  "24H": { spanMs: 24 * 3600e3, stepMs: 15 * 60e3, label: "Last 24 hours" },
  "7D": { spanMs: 7 * 86400e3, stepMs: 2 * 3600e3, label: "Last 7 days" },
  "30D": { spanMs: 30 * 86400e3, stepMs: 6 * 3600e3, label: "Last 30 days" },
};

/** Was the hydrant offline (no packets) at time t? */
function offlineAt(h: Hydrant, incidents: Incident[], t: number): boolean {
  if (!h.monitored) return true;
  return incidents.some(
    (i) => i.hydrantId === h.id && i.kind === "device" && t >= i.startedAt && (i.resolvedAt === undefined || t < i.resolvedAt),
  );
}

function obstructionAt(h: Hydrant, incidents: Incident[], t: number): Incident | undefined {
  return incidents.find(
    (i) => i.hydrantId === h.id && i.kind === "obstruction" && t >= i.startedAt && (i.resolvedAt === undefined || t < i.resolvedAt),
  );
}

export function temperatureAt(seed: number, t: number): number {
  // Rochester, early November: ~5°C mean, diurnal swing peaking mid-afternoon, multi-day weather noise.
  const hour = new Date(t).getHours() + new Date(t).getMinutes() / 60;
  const diurnal = 4 * Math.sin(((hour - 9) / 24) * 2 * Math.PI);
  const weather = 4 * noise1d(7, t / (36 * 3600e3));
  const site = noise1d(seed, t / (2 * 3600e3)) * 0.6;
  return Math.round((4.5 + diurnal + weather + site) * 10) / 10;
}

// ---- Live device readings (ESP32 over USB serial, backend WebSocket, or virtual sensor) ----
const LIVE_KEEP_MS = 2 * 3600e3;
const live = new Map<string, SensorReading[]>();

export function pushLiveReading(id: string, r: SensorReading): void {
  const buf = live.get(id) ?? [];
  buf.push(r);
  if (buf[0].t < r.t - LIVE_KEEP_MS) buf.splice(0, buf.findIndex((x) => x.t >= r.t - LIVE_KEEP_MS));
  live.set(id, buf);
}

export function clearLiveReadings(id?: string): void {
  if (id) live.delete(id);
  else live.clear();
}

/** Latest live reading at or before t, once the device has started streaming. */
function liveAt(id: string, t: number): SensorReading | undefined {
  const buf = live.get(id);
  if (!buf?.length || t < buf[0].t) return undefined;
  let lo = 0;
  let hi = buf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (buf[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return { ...buf[lo], t };
}

export function readingAt(h: Hydrant, incidents: Incident[], t: number): SensorReading {
  if (offlineAt(h, incidents, t)) return { t, distanceCm: null, temperatureC: null };
  const fromDevice = liveAt(h.id, t);
  if (fromDevice) return fromDevice;
  const inc = obstructionAt(h, incidents, t);
  const jitter = noise1d(h.seed, t / 90e3) * 2.5 + noise1d(h.seed + 1, t / 600e3) * 3;
  let distance: number;
  if (!inc) distance = 148 + jitter * 2;
  else if (inc.severity === "warning") distance = 50 + jitter;
  else distance = (inc.obstructionType === "vehicle" ? 34 : 22) + jitter;
  return { t, distanceCm: Math.round(distance * 10) / 10, temperatureC: temperatureAt(h.seed, t) };
}

export function series(h: Hydrant, incidents: Incident[], range: TimeRange, now: number): SensorReading[] {
  const { spanMs, stepMs } = RANGES[range];
  const end = Math.floor(now / stepMs) * stepMs;
  const out: SensorReading[] = [];
  for (let t = end - spanMs; t <= end; t += stepMs) out.push(readingAt(h, incidents, t));
  // Always include the live point so the chart's right edge tracks "now".
  if (end < now) out.push(readingAt(h, incidents, now));
  return out;
}

/** Last packet time — online hydrants report every reportIntervalS with a per-device phase. */
export function lastUpdateAt(h: Hydrant, now: number): number {
  if (h.status === "offline") return h.monitored ? h.statusSince : h.lastInspection;
  const buf = live.get(h.id);
  if (buf?.length) return buf[buf.length - 1].t;
  const period = h.reportIntervalS * 1000;
  const phase = (h.seed % h.reportIntervalS) * 1000;
  return Math.floor((now - phase) / period) * period + phase;
}

/** Connectivity health derived from the simulated RSSI. */
export function connectivity(h: Hydrant, now: number): { rssi: number | null; label: "Strong" | "Fair" | "Weak" | "No signal" } {
  if (h.status === "offline") return { rssi: null, label: "No signal" };
  const rssi = Math.round(-62 + noise1d(h.seed + 3, now / 300e3) * 9 - (h.seed % 12));
  return { rssi, label: rssi > -67 ? "Strong" : rssi > -78 ? "Fair" : "Weak" };
}
