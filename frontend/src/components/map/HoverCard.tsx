import { useApp } from "@/stores/appStore";
import { StatusChip } from "@/components/hydrants/status";
import { connectivity, lastUpdateAt, readingAt } from "@/services/telemetryService";
import { ago } from "@/utils/format";
import { addressLine } from "@/data/obstructions";

/** Four fields only: ID, status, last update, sensor health (DESIGN.md §7). */
export function HoverCard({ id, x, y }: { id: string; x: number; y: number }) {
  const h = useApp((s) => s.hydrants[id]);
  const incidents = useApp((s) => s.incidents);
  const now = useApp((s) => s.now);
  if (!h) return null;
  const last = lastUpdateAt(h, now);
  const r = readingAt(h, incidents, last);
  const conn = connectivity(h, now);
  const sensor = !h.monitored
    ? "No sensor installed"
    : h.status === "offline"
      ? "No signal"
      : h.obstructionDetail && (h.status === "blocked" || h.status === "warning")
        ? `${r.distanceCm?.toFixed(0)} cm · ${h.obstructionDetail}`
        : `${r.distanceCm?.toFixed(0)} cm clear · ${conn.label.toLowerCase()} signal`;
  const left = Math.min(x + 16, window.innerWidth - 300);
  return (
    <div className="float pointer-events-none absolute z-20 w-72 rounded-lg border border-line px-3 py-2 shadow-float" style={{ left, top: y + 16 }}>
      <div className="flex items-center justify-between gap-2">
        <span className="num text-sm font-medium">{h.id}</span>
        <StatusChip hydrant={h} />
      </div>
      <p className="mt-1 truncate text-xs text-text-2">{addressLine(h)}</p>
      <dl className="mt-2 space-y-1 text-xs">
        <div className="flex justify-between">
          <dt className="text-text-3">Last update</dt>
          <dd className="num text-text-2">{h.monitored ? ago(last, now) : "—"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-text-3">Sensor</dt>
          <dd className="line-clamp-2 text-right text-text-2">{sensor}</dd>
        </div>
      </dl>
    </div>
  );
}
