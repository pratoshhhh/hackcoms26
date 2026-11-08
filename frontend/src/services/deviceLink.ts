/**
 * deviceLink — gets live distance readings from the ESP32 into the store.
 *
 *   serial    → ESP32 plugged into this laptop over USB (Web Serial, Chrome/Edge, 115200 baud).
 *               Works today, no backend needed.
 *   websocket → backend /ws `telemetry` events, once MQTT ingest is live (docs/ARCHITECTURE.md §6).
 *   virtual   → on-screen slider standing in for the sensor, for rehearsing without the board.
 *
 * Every source ends in useApp.ingestReading(), so alerts, map, charts and sound behave the same.
 */
import { useApp } from "@/stores/appStore";
import type { DeviceLinkKind, DeviceReading } from "@/types";
import { DEVICE_TIMING, MAX_RANGE_CM } from "./obstructionDetector";

export const SERIAL_BAUD = 115200;
export const DEFAULT_WS_URL = "ws://localhost:8000/ws";

export const serialSupported = () => typeof navigator !== "undefined" && "serial" in navigator && window.isSecureContext;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * Accepts the MQTT telemetry JSON (one object per line), `distance_cm=32.4 temp_c=5.1`
 * style key/values, or a bare number. Anything else (boot logs, Wi-Fi chatter) is ignored.
 */
export function parseDeviceLine(line: string, t = Date.now()): DeviceReading | null {
  const raw = line.trim();
  if (!raw) return null;
  let distance: number | null = null;
  let temp: number | null = null;
  let deviceId: string | undefined;
  if (raw.startsWith("{")) {
    try {
      const o = JSON.parse(raw) as Record<string, unknown>;
      distance = num(o.distance_cm ?? o.distanceCm ?? o.distance);
      temp = num(o.temp_c ?? o.temperatureC ?? o.temp);
      deviceId = typeof o.hydrant_id === "string" ? o.hydrant_id : undefined;
    } catch {
      return null;
    }
  } else if (/^-?\d+(\.\d+)?$/.test(raw)) {
    distance = Number(raw);
  } else {
    distance = num(/dist(?:ance)?(?:_cm)?\s*[:=]\s*(-?\d+(?:\.\d+)?)/i.exec(raw)?.[1]);
    temp = num(/temp(?:_c)?\s*[:=]\s*(-?\d+(?:\.\d+)?)/i.exec(raw)?.[1]);
  }
  if (distance === null) return null;
  // HC-SR04 reports 0 when no echo returns, i.e. nothing in range.
  const distanceCm = distance <= 0 ? MAX_RANGE_CM : Math.min(distance, MAX_RANGE_CM);
  return { t, distanceCm, temperatureC: temp, deviceId, raw };
}

// ---- connection lifecycle ----

let stopCurrent: (() => Promise<void>) | null = null;
let watchdog: number | undefined;
let lastPacketAt = 0;

function begin(kind: DeviceLinkKind) {
  useApp.getState().setDeviceLink({ kind, status: "connecting", packets: 0, last: null });
  lastPacketAt = Date.now();
  window.clearInterval(watchdog);
  watchdog = window.setInterval(() => {
    const s = useApp.getState();
    if (s.deviceLink?.status === "connected" && s.deviceHydrantId && Date.now() - lastPacketAt > DEVICE_TIMING.offlineAfterMs) {
      s.setOffline(s.deviceHydrantId);
    }
  }, 1000);
}

function receive(r: DeviceReading) {
  lastPacketAt = r.t;
  useApp.getState().ingestReading(r);
}

/** The link dropped without the user asking (cable pulled, server gone). */
function fail(message: string) {
  window.clearInterval(watchdog);
  stopCurrent = null;
  const s = useApp.getState();
  s.setDeviceLink(s.deviceLink ? { ...s.deviceLink, status: "error", error: message } : null);
  if (s.deviceHydrantId && s.deviceLink?.packets) s.setOffline(s.deviceHydrantId);
}

export async function disconnect(): Promise<void> {
  window.clearInterval(watchdog);
  const stop = stopCurrent;
  stopCurrent = null;
  useApp.getState().setDeviceLink(null);
  await stop?.().catch(() => undefined);
}

export async function connectSerial(): Promise<void> {
  if (!navigator.serial) throw new Error("Web Serial needs Chrome or Edge on localhost or HTTPS.");
  // Must be called from a click: the browser shows its own port picker.
  const port = await navigator.serial.requestPort();
  await disconnect();
  begin("serial");
  try {
    await port.open({ baudRate: SERIAL_BAUD });
  } catch (e) {
    fail(`Couldn't open the port: ${(e as Error).message}. Close the Arduino Serial Monitor and try again.`);
    return;
  }
  if (!port.readable) return fail("Port has no readable stream.");
  const decoder = new TextDecoderStream();
  const piped = port.readable.pipeTo(decoder.writable as WritableStream<Uint8Array>).catch(() => undefined);
  const reader = decoder.readable.getReader();
  let stopping = false;
  stopCurrent = async () => {
    stopping = true;
    await reader.cancel().catch(() => undefined);
    await piped;
    await port.close().catch(() => undefined);
  };

  void (async () => {
    let buf = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let i: number;
        while ((i = buf.indexOf("\n")) >= 0) {
          const r = parseDeviceLine(buf.slice(0, i));
          buf = buf.slice(i + 1);
          if (r) receive(r);
        }
        if (buf.length > 4096) buf = "";
      }
    } catch (e) {
      if (!stopping) fail(`USB connection lost: ${(e as Error).message}`);
      return;
    }
    if (!stopping) fail("USB connection closed.");
  })();
}

export async function connectWebSocket(url = DEFAULT_WS_URL): Promise<void> {
  await disconnect();
  begin("websocket");
  const ws = new WebSocket(url);
  let stopping = false;
  stopCurrent = async () => {
    stopping = true;
    ws.close();
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(String(ev.data)) as { type?: string; data?: Record<string, unknown> };
      if (msg.type !== "telemetry" || !msg.data || msg.data.source === "simulated") return;
      const r = parseDeviceLine(JSON.stringify(msg.data));
      if (r) receive(r);
    } catch {
      /* not JSON */
    }
  };
  ws.onclose = () => {
    if (!stopping) fail(`Backend WebSocket closed (${url}).`);
  };
}

/** On-screen stand-in for the sensor: emits the slider value 4× per second. */
let virtualDistance = 150;
export const setVirtualDistance = (cm: number) => (virtualDistance = cm);
export const getVirtualDistance = () => virtualDistance;

export async function startVirtual(): Promise<void> {
  await disconnect();
  begin("virtual");
  const timer = window.setInterval(() => {
    const jitter = (Math.random() - 0.5) * 1.5;
    receive({ t: Date.now(), distanceCm: Math.max(2, virtualDistance + jitter), temperatureC: 4.5, deviceId: "VIRTUAL" });
  }, 250);
  stopCurrent = async () => window.clearInterval(timer);
}
