import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Cable, MessageSquare, Radio, SlidersHorizontal, Unplug, Volume2 } from "lucide-react";
import { useApp, useHydrantList } from "@/stores/appStore";
import type { Hydrant, ObstructionType } from "@/types";
import { sendSms, smsStatus, type SmsStatus } from "@/services/smsService";
import { Button, Input, Label, PageHeader, Select, Switch } from "@/components/ui/primitives";
import { StatusChip, StatusIcon } from "@/components/hydrants/status";
import { KIND_STATUS } from "@/components/notifications/NotificationList";
import { TwinFallback } from "@/components/three/TwinFallback";
import { OBSTRUCTION_LABELS } from "@/services/analyticsService";
import { BLOCK_THRESHOLD_CM, CLEAR_THRESHOLD_CM } from "@/services/telemetryService";
import { DEVICE_TIMING } from "@/services/obstructionDetector";
import { announce, speechSupported, unlockAudio } from "@/services/alertAudio";
import {
  DEFAULT_WS_URL,
  SERIAL_BAUD,
  connectSerial,
  connectWebSocket,
  disconnect,
  getVirtualDistance,
  serialSupported,
  setVirtualDistance,
  startVirtual,
} from "@/services/deviceLink";
import { addressLine } from "@/data/obstructions";
import { useWebGL } from "@/hooks";
import { ago } from "@/utils/format";
import { cn } from "@/lib/utils";

const HydrantTwin = lazy(() => import("@/components/three/HydrantTwin"));

const GAUGE_MAX_CM = 200;

function Card({ title, icon: Icon, children }: { title: string; icon: typeof Cable; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface-1 p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Icon className="size-4 text-text-2" strokeWidth={1.75} /> {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm">{children}</div>
    </section>
  );
}

/** 1 s clock for the "last packet" label; the global ticker is 5 s. */
function useSecondClock() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

function ClearanceGauge({ distance }: { distance: number | null }) {
  const pct = (cm: number) => `${(Math.min(cm, GAUGE_MAX_CM) / GAUGE_MAX_CM) * 100}%`;
  const zone = distance === null ? null : distance < BLOCK_THRESHOLD_CM ? "crit" : distance <= CLEAR_THRESHOLD_CM ? "warn" : "ok";
  return (
    <div aria-hidden>
      <div className="relative h-3 overflow-hidden rounded-full bg-surface-3">
        <div className="absolute inset-y-0 left-0 bg-crit/25" style={{ width: pct(BLOCK_THRESHOLD_CM) }} />
        <div className="absolute inset-y-0 bg-warn/25" style={{ left: pct(BLOCK_THRESHOLD_CM), width: `calc(${pct(CLEAR_THRESHOLD_CM)} - ${pct(BLOCK_THRESHOLD_CM)})` }} />
        {distance !== null && (
          <div
            className={cn("absolute inset-y-0 w-1 -translate-x-1/2 rounded-full transition-[left] duration-200", zone === "crit" ? "bg-crit" : zone === "warn" ? "bg-warn" : "bg-ok")}
            style={{ left: pct(distance) }}
          />
        )}
      </div>
      <div className="num relative mt-1 h-4 text-2xs text-text-3">
        <span className="absolute left-0">0</span>
        <span className="absolute -translate-x-1/2" style={{ left: pct(BLOCK_THRESHOLD_CM) }}>
          {BLOCK_THRESHOLD_CM}
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: pct(CLEAR_THRESHOLD_CM) }}>
          {CLEAR_THRESHOLD_CM}
        </span>
        <span className="absolute right-0">{GAUGE_MAX_CM}+ cm</span>
      </div>
    </div>
  );
}

function TextAlertsCard({ hydrant }: { hydrant: Hydrant | undefined }) {
  const enabled = useApp((s) => s.textDemoPhone);
  const set = useApp((s) => s.set);
  const lastDemo = useApp((s) => s.deliveries.find((d) => d.subscriptionId === "demo"));
  const [status, setStatus] = useState<SmsStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    smsStatus()
      .then(setStatus)
      .catch((e: Error) => setStatusError(e.message));
  }, []);

  const ready = Boolean(status?.configured && status.demoTo);
  const sendTest = async () => {
    if (!hydrant) return;
    setTesting(true);
    try {
      const r = await sendSms(undefined, `Fire Fighters test: alerts for hydrant ${hydrant.id} at ${addressLine(hydrant)} will be texted to this phone.`);
      toast.success("Test text sent", {
        description: r.via === "trial_template" ? `To ${r.to}. Trial account, so Twilio sent its built-in alert text.` : `To ${r.to}`,
      });
    } catch (e) {
      toast.error("Text failed", { description: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card title="Text alerts" icon={MessageSquare}>
      <label className="flex items-center justify-between gap-4">
        <span>
          Text the demo phone
          <span className="block text-xs text-text-3">On a blocked, cleared, or offline alert from the demo controls or the ESP32</span>
        </span>
        <Switch checked={enabled} disabled={!ready} onCheckedChange={(v) => set("textDemoPhone", v)} />
      </label>
      <p className={cn("text-xs", ready ? "text-text-2" : "text-warn")}>
        {statusError
          ? `Can't reach the SMS endpoint: ${statusError}`
          : !status
            ? "Checking Twilio…"
            : !status.configured
              ? "Twilio isn't configured on the server. Set TWILIO_* in .env and restart the API."
              : !status.demoTo
                ? "Set TWILIO_DEMO_TO_NUMBER in .env to choose the demo phone."
                : `Sends to ${status.demoTo} through Twilio.`}
      </p>
      {lastDemo && (
        <p className={cn("text-xs", lastDemo.status === "sent" ? "text-ok" : lastDemo.status === "failed" ? "text-crit" : "text-text-2")}>
          Last text: {lastDemo.subject} · {lastDemo.status === "sending" ? "sending…" : lastDemo.status}
          {lastDemo.error && ` (${lastDemo.error})`}
        </p>
      )}
      <Button disabled={!ready || !hydrant || testing} onClick={() => void sendTest()}>
        <MessageSquare /> {testing ? "Sending…" : "Send a test text"}
      </Button>
    </Card>
  );
}

export default function DevicePage() {
  const navigate = useNavigate();
  const hydrants = useHydrantList();
  const loadState = useApp((s) => s.loadState);
  const id = useApp((s) => s.deviceHydrantId);
  const h = useApp((s) => (s.deviceHydrantId ? s.hydrants[s.deviceHydrantId] : undefined));
  const link = useApp((s) => s.deviceLink);
  const obstruction = useApp((s) => s.deviceObstruction);
  const sound = useApp((s) => s.sound);
  const alerts = useApp((s) => s.alerts);
  const s = useApp.getState();
  const webgl = useWebGL();
  const now = useSecondClock();
  const [wsUrl, setWsUrl] = useState(DEFAULT_WS_URL);
  const [virtual, setVirtual] = useState(getVirtualDistance());

  const candidates = useMemo(() => hydrants.filter((x) => x.monitored).slice(0, 400), [hydrants]);
  const recent = useMemo(() => alerts.filter((a) => a.hydrantId === id).slice(0, 6), [alerts, id]);

  // Stand the ESP32 in for a monitored, currently clear hydrant until someone picks one.
  useEffect(() => {
    if (loadState !== "ready" || (id && useApp.getState().hydrants[id])) return;
    const pick = candidates.find((x) => x.status === "clear") ?? candidates[0];
    if (pick) useApp.getState().bindDevice(pick.id);
  }, [loadState, id, candidates]);

  const distance = link?.last && h?.status !== "offline" ? link.last.distanceCm : null;
  const run = (fn: () => Promise<void>) => {
    unlockAudio();
    fn().catch((e: Error) => {
      if (e.name !== "NotFoundError") toast.error("Couldn't connect", { description: e.message });
    });
  };
  const nudgeVirtual = (cm: number) => {
    setVirtual(cm);
    setVirtualDistance(cm);
  };

  const linkLabel = !link
    ? "Not connected"
    : link.status === "error"
      ? link.error
      : link.status === "connecting"
        ? link.kind === "serial"
          ? "Port open, waiting for the first reading…"
          : "Waiting for the first reading…"
        : `Live · ${link.packets} readings · last ${link.last ? ago(link.last.t, now) : "—"}`;

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title="ESP32 live demo"
        description="The bench sensor stands in for a real hydrant. Whatever it detects shows up on the map, opens incidents, and is announced out loud."
        actions={
          h && (
            <Button
              onClick={() => {
                s.select(h.id);
                navigate("/map");
              }}
            >
              View {h.id} on map
            </Button>
          )
        }
      />

      <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <div className="relative">
            {h && webgl ? (
              <Suspense fallback={<div className="h-[380px] rounded-lg border border-line bg-surface-2" />}>
                <HydrantTwin status={h.status} obstruction={h.obstructionType} monitored className="h-[380px]" />
              </Suspense>
            ) : h ? (
              <TwinFallback status={h.status} obstruction={h.obstructionType} />
            ) : (
              <div className="grid h-[380px] place-items-center rounded-lg border border-line text-sm text-text-2">Loading hydrants…</div>
            )}
            {h && (
              <div className="float absolute left-3 top-3 rounded-lg px-3 py-2">
                <div className="num text-sm font-medium">{h.id}</div>
                <div className="text-xs text-text-2">{addressLine(h)}</div>
                <StatusChip hydrant={h} className="mt-2" />
              </div>
            )}
          </div>

          <section className="rounded-lg border border-line bg-surface-1 p-4" aria-live="polite">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-xs text-text-3">Clearance in front of the hydrant</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="num text-5xl font-medium tabular-nums">{distance !== null ? distance.toFixed(0) : "—"}</span>
                  {distance !== null && <span className="num text-lg text-text-3">cm</span>}
                </div>
              </div>
              <div className="text-right text-xs text-text-2">
                {link?.last?.temperatureC != null && <div className="num">{link.last.temperatureC.toFixed(1)} °C</div>}
                {link?.last?.deviceId && <div className="num text-text-3">Node {link.last.deviceId}</div>}
              </div>
            </div>
            <div className="mt-4">
              <ClearanceGauge distance={distance} />
            </div>
            <p className="mt-3 text-xs text-text-3">
              Blocked when something stays closer than {BLOCK_THRESHOLD_CM} cm for {DEVICE_TIMING.confirmAfterMs / 1000} s. Clear again once it reads over {CLEAR_THRESHOLD_CM} cm for{" "}
              {DEVICE_TIMING.clearAfterMs / 1000} s. Offline after {DEVICE_TIMING.offlineAfterMs / 1000} s without data.
            </p>
          </section>

          <section className="rounded-lg border border-line bg-surface-1">
            <h2 className="border-b border-line px-4 py-3 text-base font-semibold">Alerts from this hydrant</h2>
            {recent.length === 0 ? (
              <p className="px-4 py-4 text-sm text-text-2">Nothing yet. Put an object in front of the sensor.</p>
            ) : (
              <ul className="divide-y divide-line">
                {recent.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                    <StatusIcon status={KIND_STATUS[a.kind]} className="mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm text-text-1">{a.title}</span>
                        <span className="num shrink-0 text-2xs text-text-3">{ago(a.createdAt, now)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-text-2">{a.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <Card title="Sensor connection" icon={Cable}>
            <p className={cn("text-sm", link?.status === "error" ? "text-crit" : link?.status === "connected" ? "text-ok" : "text-text-2")} role="status">
              {link && <span className="mr-1 text-text-3">{link.kind === "serial" ? "USB:" : link.kind === "websocket" ? "Backend:" : "Virtual:"}</span>}
              {linkLabel}
            </p>
            {link?.last?.raw && <pre className="num overflow-x-auto rounded border border-line bg-surface-2 px-2 py-1 text-2xs text-text-2">{link.last.raw}</pre>}

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" disabled={!serialSupported()} onClick={() => run(connectSerial)}>
                <Cable /> Connect ESP32 over USB
              </Button>
              {link && (
                <Button variant="ghost" onClick={() => void disconnect()}>
                  <Unplug /> Disconnect
                </Button>
              )}
            </div>
            <p className="text-xs text-text-3">
              {serialSupported()
                ? `Plug the board in, close the Arduino Serial Monitor, then pick its port. ${SERIAL_BAUD} baud, one reading per line.`
                : "USB needs Chrome or Edge, opened on localhost or HTTPS."}
            </p>

            <div className="space-y-1 border-t border-line pt-3">
              <Label htmlFor="ws-url">Through the backend (MQTT → FastAPI → WebSocket)</Label>
              <div className="flex gap-2">
                <Input id="ws-url" value={wsUrl} onChange={(e) => setWsUrl(e.target.value)} className="num text-xs" />
                <Button onClick={() => run(() => connectWebSocket(wsUrl))}>
                  <Radio /> Connect
                </Button>
              </div>
            </div>

            <div className="space-y-2 border-t border-line pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm">No board? Use a virtual sensor</span>
                {link?.kind !== "virtual" && (
                  <Button size="sm" onClick={() => run(startVirtual)}>
                    <SlidersHorizontal /> Start
                  </Button>
                )}
              </div>
              {link?.kind === "virtual" && (
                <>
                  <input
                    type="range"
                    min={5}
                    max={GAUGE_MAX_CM}
                    value={virtual}
                    onChange={(e) => nudgeVirtual(Number(e.target.value))}
                    className="w-full accent-[rgb(var(--accent))]"
                    aria-label="Virtual sensor distance in centimeters"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="danger" onClick={() => nudgeVirtual(20)}>
                      Place object (20 cm)
                    </Button>
                    <Button size="sm" onClick={() => nudgeVirtual(150)}>
                      Remove object
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Card>

          <Card title="Stand-in hydrant" icon={Radio}>
            <div className="space-y-1">
              <Label htmlFor="bench-hydrant">The ESP32 reports as</Label>
              <Select id="bench-hydrant" className="w-full" value={id ?? ""} onChange={(e) => s.bindDevice(e.target.value)}>
                {candidates.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.id} · {x.street} · {x.status}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="bench-obstruction">Report a confirmed block as</Label>
              <Select id="bench-obstruction" className="w-full" value={obstruction} onChange={(e) => s.set("deviceObstruction", e.target.value as ObstructionType)}>
                {(Object.keys(OBSTRUCTION_LABELS) as ObstructionType[]).map((k) => (
                  <option key={k} value={k}>
                    {OBSTRUCTION_LABELS[k]}
                  </option>
                ))}
              </Select>
            </div>
          </Card>

          <Card title="Sound" icon={Volume2}>
            <label className="flex items-center justify-between gap-4">
              <span>
                Alert tones
                <span className="block text-xs text-text-3">Siren when blocked, chime when clear</span>
              </span>
              <Switch
                checked={sound.enabled}
                onCheckedChange={(v) => {
                  if (v) unlockAudio();
                  s.setSound({ enabled: v });
                }}
              />
            </label>
            <label className="flex items-center justify-between gap-4">
              <span>
                Spoken announcements
                <span className="block text-xs text-text-3">{speechSupported() ? "Reads each alert aloud after the tone" : "Not supported in this browser"}</span>
              </span>
              <Switch checked={sound.voice} disabled={!sound.enabled || !speechSupported()} onCheckedChange={(v) => s.setSound({ voice: v })} />
            </label>
            <Button
              disabled={!h || !sound.enabled}
              onClick={() => {
                unlockAudio();
                if (h) announce({ kind: "blocked" }, { ...h, obstructionType: obstruction }, { voice: sound.voice });
              }}
            >
              <Volume2 /> Test the blocked alert
            </Button>
            <p className="text-xs text-text-3">Browsers stay silent until you click somewhere on the page, so click once before the demo starts.</p>
          </Card>

          <TextAlertsCard hydrant={h} />
        </div>
      </div>
    </div>
  );
}
