import { CircleCheck, OctagonX, TriangleAlert, WifiOff } from "lucide-react";
import type { Hydrant, HydrantStatus, RiskLevel } from "@/types";
import { cn } from "@/lib/utils";

/** Status is never color-only: color + icon + label (DESIGN.md §3). */
export const STATUS_META: Record<HydrantStatus, { label: string; icon: typeof CircleCheck; text: string; bg: string; border: string }> = {
  clear: { label: "Accessible", icon: CircleCheck, text: "text-ok", bg: "bg-ok/10", border: "border-ok/30" },
  warning: { label: "Possible obstruction", icon: TriangleAlert, text: "text-warn", bg: "bg-warn/10", border: "border-warn/30" },
  blocked: { label: "Blocked", icon: OctagonX, text: "text-crit", bg: "bg-crit/10", border: "border-crit/30" },
  offline: { label: "Offline", icon: WifiOff, text: "text-muted", bg: "bg-muted/10", border: "border-muted/30" },
};

export function statusLabel(h: Pick<Hydrant, "status" | "monitored">): string {
  if (h.status === "offline" && !h.monitored) return "Unmonitored";
  return STATUS_META[h.status].label;
}

export function StatusChip({ hydrant, status, className }: { hydrant?: Pick<Hydrant, "status" | "monitored">; status?: HydrantStatus; className?: string }) {
  const s = hydrant?.status ?? status ?? "offline";
  const m = STATUS_META[s];
  const Icon = m.icon;
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-xs font-medium", m.text, m.bg, m.border, className)}>
      <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
      {hydrant ? statusLabel(hydrant) : m.label}
    </span>
  );
}

export function StatusIcon({ status, className }: { status: HydrantStatus; className?: string }) {
  const m = STATUS_META[status];
  const Icon = m.icon;
  return <Icon className={cn("size-4", m.text, className)} strokeWidth={1.75} aria-label={m.label} />;
}

const RISK_META: Record<RiskLevel, { label: string; cls: string; bars: number }> = {
  low: { label: "Low", cls: "text-text-2", bars: 1 },
  moderate: { label: "Moderate", cls: "text-warn", bars: 2 },
  high: { label: "High", cls: "text-crit", bars: 3 },
  critical: { label: "Critical", cls: "text-crit", bars: 4 },
};

/** Risk indicator: label + 4-step bar glyph (shape), not color alone. */
export function RiskBadge({ level, score }: { level: RiskLevel; score?: number }) {
  const m = RISK_META[level];
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs", m.cls)}>
      <span className="flex items-end gap-0.5" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn("w-1 rounded-[1px]", i < m.bars ? "bg-current" : "bg-line")} style={{ height: 4 + i * 2 }} />
        ))}
      </span>
      {m.label}
      {score !== undefined && <span className="num text-text-3">{score}</span>}
    </span>
  );
}

export function LocationSourceNote({ source }: { source: Hydrant["locationSource"] }) {
  const text =
    source === "seeded"
      ? "Seeded demo location (not a real hydrant)"
      : source === "osm-snapshot"
        ? "OpenStreetMap snapshot (bundled)"
        : source === "osm-cache"
          ? "OpenStreetMap (cached)"
          : "OpenStreetMap (live)";
  return <span className="text-2xs text-text-3">{text}</span>;
}
