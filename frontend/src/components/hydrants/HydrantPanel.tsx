import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { useNavigate } from "react-router-dom";
import * as Tabs from "@radix-ui/react-tabs";
import { toast } from "sonner";
import { BellPlus, Check, Copy, Flag, Share2, Sparkles, Wrench, X } from "lucide-react";
import { addressLine } from "@/data/obstructions";
import type { Hydrant } from "@/types";
import { useApp } from "@/stores/appStore";
import { useMediaQuery, useReducedMotion, useWebGL } from "@/hooks";
import { Button, Stat, Tip } from "@/components/ui/primitives";
import { LocationSourceNote, RiskBadge, StatusChip, StatusIcon } from "./status";
import { TelemetryChart } from "@/components/charts/TelemetryChart";
import { connectivity, lastUpdateAt, readingAt } from "@/services/telemetryService";
import { OBSTRUCTION_LABELS } from "@/services/analyticsService";
import { ago, duration, fmtDate, fmtDateTime } from "@/utils/format";
import { formatCoord } from "@/utils/geo";
import { ReportDialog } from "./ReportDialog";
import { TwinFallback } from "@/components/three/TwinFallback";
import { PANEL_WIDTH } from "@/components/map/HydrantMap";
import { cn } from "@/lib/utils";

const HydrantTwin = lazy(() => import("@/components/three/HydrantTwin"));

/** Exact coordinates with one-click copy. */
function CoordCopy({ lat, lng }: { lat: number; lng: number }) {
  const [copied, setCopied] = useState(false);
  const text = formatCoord(lat, lng, 6);
  return (
    <Tip content={copied ? "Copied" : "Copy coordinates"}>
      <button
        className="num inline-flex items-center gap-1 rounded px-1 text-text-2 hover:bg-surface-2 hover:text-text-1"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard blocked */
          }
        }}
        aria-label={`Copy coordinates ${text}`}
      >
        {text}
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      </button>
    </Tip>
  );
}

/** What exactly is in the way, with the sensor evidence beside it. */
function Blockage({ h }: { h: Hydrant }) {
  const incidents = useApp((s) => s.incidents);
  const now = useApp((s) => s.now);
  if (h.status !== "blocked" && h.status !== "warning") return null;
  const open = incidents.find((i) => i.hydrantId === h.id && i.kind === "obstruction" && i.status === "active");
  const r = readingAt(h, incidents, lastUpdateAt(h, now));
  const blocked = h.status === "blocked";
  return (
    <section className={cn("rounded-lg border px-3 py-3", blocked ? "border-crit/25 bg-crit/5" : "border-warn/25 bg-warn/5")} aria-label="What is blocking this hydrant">
      <div className="flex items-center gap-2">
        <StatusIcon status={h.status} />
        <span className="text-sm font-medium text-text-1">
          {blocked ? "Blocked by" : "Possibly blocked by"} {h.obstructionType ? OBSTRUCTION_LABELS[h.obstructionType].toLowerCase() : "an obstruction"}
        </span>
      </div>
      <p className="mt-1 text-sm text-text-1">{h.obstructionDetail ?? "No description yet."}</p>
      <p className="num mt-2 text-2xs text-text-2">
        {r.distanceCm !== null ? `${r.distanceCm.toFixed(0)} cm clearance` : "No reading"} · since {fmtDateTime(h.statusSince)} ({duration(now - h.statusSince)})
        {open ? ` · ${open.origin === "report" ? "community report" : open.origin === "device" ? "live ESP32 sensor" : open.origin === "demo" ? "demo event" : "seeded"}` : ""}
      </p>
    </section>
  );
}

/** Four headline readings in one divided strip. */
function Readings({ h }: { h: Hydrant }) {
  const incidents = useApp((s) => s.incidents);
  const now = useApp((s) => s.now);
  const last = lastUpdateAt(h, now);
  const r = readingAt(h, incidents, last);
  const conn = connectivity(h, now);
  const cells = [
    { label: "Clearance", value: r.distanceCm?.toFixed(0) ?? "—", unit: r.distanceCm !== null ? "cm" : "" },
    { label: "Temperature", value: r.temperatureC?.toFixed(1) ?? "—", unit: r.temperatureC !== null ? "°C" : "" },
    { label: "Signal", value: conn.label, unit: "" },
    { label: "Last packet", value: h.monitored ? ago(last, now) : "—", unit: "" },
  ];
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-line sm:grid-cols-4">
      {cells.map((c, i) => (
        <div key={c.label} className={cn("px-3 py-2", i % 2 === 1 && "border-l border-line", i === 2 && "sm:border-l sm:border-line", i > 1 && "border-t border-line sm:border-t-0")}>
          <dt className="text-2xs text-text-3">{c.label}</dt>
          <dd className="mt-0.5 truncate">
            <span className="num text-sm text-text-1">{c.value}</span>
            {c.unit && <span className="num ml-0.5 text-2xs text-text-3">{c.unit}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function History({ h }: { h: Hydrant }) {
  const incidents = useApp((s) => s.incidents);
  const now = useApp((s) => s.now);
  const list = useMemo(() => incidents.filter((i) => i.hydrantId === h.id).sort((a, b) => b.startedAt - a.startedAt), [incidents, h.id]);
  if (!list.length) return <p className="py-6 text-sm text-text-2">No incidents recorded for this hydrant in the last 60 days.</p>;
  return (
    <ul className="divide-y divide-line">
      {list.map((i) => (
        <li key={i.id} className="flex items-center gap-3 py-2">
          <StatusIcon status={i.kind === "device" ? "offline" : i.severity === "critical" ? "blocked" : "warning"} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm text-text-1">{i.kind === "device" ? "Sensor offline" : i.obstructionType ? OBSTRUCTION_LABELS[i.obstructionType] : "Obstruction"}</div>
            {i.detail && <div className="text-xs text-text-2">{i.detail}</div>}
            <div className="num text-2xs text-text-3">
              {fmtDateTime(i.startedAt)} · {i.origin === "seeded" ? "seeded history" : i.origin === "demo" ? "demo event" : i.origin === "device" ? "live ESP32 sensor" : "community report"}
            </div>
          </div>
          <div className="text-right">
            <div className={cn("text-xs", i.status === "active" ? "text-crit" : "text-text-2")}>{i.status === "active" ? "Active" : "Resolved"}</div>
            <div className="num text-2xs text-text-3">{duration((i.resolvedAt ?? now) - i.startedAt)}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function HydrantPanel({ hydrant: h }: { hydrant: Hydrant }) {
  const select = useApp((s) => s.select);
  const incidents = useApp((s) => s.incidents);
  const now = useApp((s) => s.now);
  const set = useApp((s) => s.set);
  const createTask = useApp((s) => s.createTask);
  const reduced = useReducedMotion();
  const wide = useMediaQuery("(min-width: 768px)");
  const webgl = useWebGL();
  const navigate = useNavigate();
  const [reportOpen, setReportOpen] = useState(false);
  const [tab, setTab] = useState("overview");
  const flash = useAnimationControls();
  const prevStatus = useRef(h.status);

  // The orchestrated CLEAR→BLOCKED moment: the header flashes once.
  useEffect(() => {
    if (prevStatus.current !== h.status && h.status === "blocked" && !reduced) {
      void flash.start({ opacity: [0, 1, 0], transition: { duration: 1.2, ease: [0.2, 0, 0, 1] } });
    }
    prevStatus.current = h.status;
  }, [h.status, flash, reduced]);

  const stats = useMemo(() => {
    const mine = incidents.filter((i) => i.hydrantId === h.id && i.kind === "obstruction");
    const month = mine.filter((i) => now - i.startedAt < 30 * 86400000).length;
    const resolved = mine.filter((i) => i.resolvedAt);
    const avg = resolved.length ? resolved.reduce((s, i) => s + i.resolvedAt! - i.startedAt, 0) / resolved.length : null;
    return { month, avg, total: incidents.filter((i) => i.hydrantId === h.id).length };
  }, [incidents, h.id, now]);

  const share = async () => {
    const url = `https://www.openstreetmap.org/?mlat=${h.lat.toFixed(6)}&mlon=${h.lng.toFixed(6)}#map=19/${h.lat.toFixed(6)}/${h.lng.toFixed(6)}`;
    const text = `Hydrant ${h.id} · ${addressLine(h)} · ${formatCoord(h.lat, h.lng, 6)}`;
    try {
      if (navigator.share) await navigator.share({ title: `Hydrant ${h.id}`, text, url });
      else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        toast.success("Location copied", { description: "Coordinates and an OpenStreetMap link are on your clipboard." });
      }
    } catch {
      /* share cancelled */
    }
  };

  const requestMaintenance = () => {
    const t = createTask(h.id);
    if (t) {
      toast.success(`Task ${t.id} is open`, { description: "Volunteers can claim it under Tasks." });
      navigate(`/maintenance?task=${t.id}`);
    } else {
      toast.message("No open obstruction here", { description: "Tasks come from active incidents. Report an obstruction first." });
    }
  };

  const motionProps = wide
    ? { initial: reduced ? { opacity: 0 } : { x: 16, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: reduced ? { opacity: 0 } : { x: 16, opacity: 0 } }
    : { initial: reduced ? { opacity: 0 } : { y: 32, opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: reduced ? { opacity: 0 } : { y: 32, opacity: 0 } };

  const tabCls =
    "-mb-px h-9 border-b-2 border-transparent px-1 text-sm text-text-2 transition-colors hover:text-text-1 data-[state=active]:border-text-1 data-[state=active]:text-text-1";

  return (
    <motion.aside
      {...motionProps}
      transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
      aria-label={`Hydrant ${h.id} details`}
      className="absolute inset-x-0 bottom-0 z-40 flex h-[78vh] flex-col overflow-hidden rounded-t-xl border border-line bg-surface-1 shadow-float md:inset-x-auto md:bottom-3 md:right-3 md:top-[64px] md:h-auto md:rounded-lg"
      style={wide ? { width: PANEL_WIDTH } : undefined}
    >
      <div className="relative shrink-0 px-4 pt-4">
        <motion.div animate={flash} initial={{ opacity: 0 }} className="pointer-events-none absolute inset-0 bg-crit/10" aria-hidden />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="num text-lg font-medium tracking-tight">{h.id}</h2>
              <StatusChip hydrant={h} />
            </div>
            <p className="mt-1 text-sm text-text-1">{addressLine(h)}</p>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-text-3">
              <span>{h.neighborhood}</span>
              <span aria-hidden>·</span>
              <CoordCopy lat={h.lat} lng={h.lng} />
            </div>
          </div>
          <Tip content="Close" kbd="Esc">
            <Button variant="ghost" size="icon-sm" onClick={() => select(null, { fly: false })} aria-label="Close hydrant details">
              <X />
            </Button>
          </Tip>
        </div>
        <div className="relative mt-3 flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => set("subscribeFor", h.id)}>
            <BellPlus /> Subscribe to alerts
          </Button>
          <Button size="sm" onClick={() => setReportOpen(true)}>
            <Flag /> Report
          </Button>
          <span className="ml-auto flex gap-0.5">
            {[
              { label: "Create maintenance task", icon: Wrench, onClick: requestMaintenance },
              { label: "Share location", icon: Share2, onClick: share },
              { label: "Ask Hydrant Intelligence about this hydrant", icon: Sparkles, onClick: () => set("copilotOpen", true) },
            ].map((a) => (
              <Tip key={a.label} content={a.label}>
                <Button size="icon-sm" variant="ghost" onClick={a.onClick} aria-label={a.label}>
                  <a.icon />
                </Button>
              </Tip>
            ))}
          </span>
        </div>
      </div>

      <Tabs.Root value={tab} onValueChange={setTab} className="mt-3 flex min-h-0 flex-1 flex-col">
        <Tabs.List className="flex gap-4 border-b border-line px-4" aria-label="Hydrant details">
          <Tabs.Trigger value="overview" className={tabCls}>
            Overview
          </Tabs.Trigger>
          <Tabs.Trigger value="telemetry" className={tabCls}>
            Telemetry
          </Tabs.Trigger>
          <Tabs.Trigger value="history" className={tabCls}>
            History <span className="num ml-1 text-2xs text-text-3">{stats.total}</span>
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="overview" className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
          <Blockage h={h} />
          <Readings h={h} />
          {webgl ? (
            <Suspense fallback={<div className="h-52 rounded-lg bg-surface-2" />}>
              <HydrantTwin status={h.status} obstruction={h.obstructionType} monitored={h.monitored} />
            </Suspense>
          ) : (
            <TwinFallback status={h.status} obstruction={h.obstructionType} />
          )}
          <p className="-mt-2 text-2xs text-text-3">Illustrative model, not a view of field conditions. Drag to rotate.</p>
          <dl className="text-sm">
            {h.obstructionType && <Stat label="Obstruction" value={OBSTRUCTION_LABELS[h.obstructionType]} />}
            <Stat label="Status since" value={fmtDateTime(h.statusSince)} hint={duration(now - h.statusSince)} />
            <Stat label="Incidents, 30 days" value={stats.month} />
            <Stat label="Avg time to clear" value={stats.avg ? duration(stats.avg) : "—"} />
            <Stat label="Risk" value={<RiskBadge level={h.riskLevel} score={h.riskScore} />} />
            <Stat label="Device uptime" value={h.monitored ? h.uptimePct.toFixed(1) : "—"} unit={h.monitored ? "%" : undefined} />
            <Stat label="Last inspection" value={fmtDate(h.lastInspection)} />
            {h.osmId && (
              <Stat
                label="OSM node"
                value={
                  <a className="text-accent hover:underline" href={`https://www.openstreetmap.org/node/${h.osmId}`} target="_blank" rel="noreferrer">
                    {h.osmId}
                  </a>
                }
              />
            )}
          </dl>
          <div className="space-y-1">
            <LocationSourceNote source={h.locationSource} />
            <p className="text-2xs text-text-3">
              {h.address
                ? h.addressPrecision === "front"
                  ? "Address of the building directly in front of the hydrant (OpenStreetMap / Nominatim)."
                  : "Nearest addressed building; the hydrant is not directly in front of it (OpenStreetMap / Nominatim)."
                : "No geocoded address. Location described by the nearest major street."}
            </p>
            <p className="text-2xs text-text-3">A reporting sensor shows the hydrant appears reachable. It does not confirm water pressure or flow.</p>
          </div>
        </Tabs.Content>

        <Tabs.Content value="telemetry" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <TelemetryChart hydrant={h} />
        </Tabs.Content>

        <Tabs.Content value="history" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2">
          <History h={h} />
        </Tabs.Content>
      </Tabs.Root>

      <ReportDialog hydrant={h} open={reportOpen} onOpenChange={setReportOpen} />
    </motion.aside>
  );
}
