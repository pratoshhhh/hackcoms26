/**
 * analyticsService — computes dashboard analytics from the seeded dataset.
 *
 * Future Tiger Data integration (see backend/db/init/001_schema.sql):
 *   summary()           → GET /api/v1/analytics/summary
 *   weeklyTrend()       → obstructions_daily continuous aggregate, bucketed by week
 *   topRisk()           → hydrant_risk view
 *   neighborhoodGrid()  → obstructions_daily joined to hydrants.neighborhood
 */
import type { AnalyticsSummary, Hydrant, Incident, ObstructionType } from "@/types";
import { startOfWeek, subWeeks, format } from "date-fns";

const DAY = 86400000;

export function summary(hydrants: Hydrant[], incidents: Incident[], now: number): AnalyticsSummary {
  const monitored = hydrants.filter((h) => h.monitored);
  const obs = incidents.filter((i) => i.kind === "obstruction");
  const resolved = obs.filter((i) => i.resolvedAt && now - i.startedAt < 30 * DAY);
  return {
    totalHydrants: hydrants.length,
    monitored: monitored.length,
    blocked: hydrants.filter((h) => h.status === "blocked").length,
    warning: hydrants.filter((h) => h.status === "warning").length,
    offline: monitored.filter((h) => h.status === "offline").length,
    avgClearMinutes: resolved.length
      ? Math.round(resolved.reduce((s, i) => s + (i.resolvedAt! - i.startedAt), 0) / resolved.length / 60000)
      : 0,
    deviceAvailabilityPct: monitored.length
      ? Math.round((monitored.filter((h) => h.status !== "offline").length / monitored.length) * 1000) / 10
      : 0,
    incidents30d: obs.filter((i) => now - i.startedAt < 30 * DAY).length,
    incidentsPrev30d: obs.filter((i) => now - i.startedAt >= 30 * DAY && now - i.startedAt < 60 * DAY).length,
  };
}

export const OBSTRUCTION_LABELS: Record<ObstructionType, string> = {
  snow: "Snow",
  vehicle: "Parked vehicle",
  debris: "Debris",
  vegetation: "Vegetation",
  ice: "Ice",
};

export function weeklyTrend(incidents: Incident[], now: number, weeks = 8) {
  const start = startOfWeek(subWeeks(now, weeks - 1), { weekStartsOn: 1 }).getTime();
  const rows = Array.from({ length: weeks }, (_, i) => {
    const ws = start + i * 7 * DAY;
    return { week: format(ws, "MMM d"), start: ws, total: 0, avgClearMin: 0, _clear: [] as number[] };
  });
  for (const i of incidents) {
    if (i.kind !== "obstruction" || i.startedAt < start) continue;
    const idx = Math.floor((i.startedAt - start) / (7 * DAY));
    if (!rows[idx]) continue;
    rows[idx].total++;
    if (i.resolvedAt) rows[idx]._clear.push((i.resolvedAt - i.startedAt) / 60000);
  }
  return rows.map(({ _clear, ...r }) => ({
    ...r,
    avgClearMin: _clear.length ? Math.round(_clear.reduce((a, b) => a + b, 0) / _clear.length) : 0,
  }));
}

export function byType(incidents: Incident[], now: number, days = 60) {
  const counts = new Map<ObstructionType, number>();
  for (const i of incidents) {
    if (i.kind !== "obstruction" || !i.obstructionType || now - i.startedAt > days * DAY) continue;
    counts.set(i.obstructionType, (counts.get(i.obstructionType) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, label: OBSTRUCTION_LABELS[type], count }))
    .sort((a, b) => b.count - a.count);
}

export function topRisk(hydrants: Hydrant[], n = 10) {
  return [...hydrants].sort((a, b) => b.riskScore - a.riskScore).slice(0, n);
}

export function neighborhoodGrid(hydrants: Hydrant[], incidents: Incident[], now: number, weeks = 8) {
  const byId = new Map(hydrants.map((h) => [h.id, h]));
  const start = startOfWeek(subWeeks(now, weeks - 1), { weekStartsOn: 1 }).getTime();
  const weekLabels = Array.from({ length: weeks }, (_, i) => format(start + i * 7 * DAY, "MMM d"));
  const grid = new Map<string, number[]>();
  const hydrantCount = new Map<string, number>();
  for (const h of hydrants) hydrantCount.set(h.neighborhood, (hydrantCount.get(h.neighborhood) ?? 0) + 1);
  for (const i of incidents) {
    if (i.kind !== "obstruction" || i.startedAt < start) continue;
    const h = byId.get(i.hydrantId);
    if (!h) continue;
    const row = grid.get(h.neighborhood) ?? Array(weeks).fill(0);
    const idx = Math.floor((i.startedAt - start) / (7 * DAY));
    if (idx >= 0 && idx < weeks) row[idx]++;
    grid.set(h.neighborhood, row);
  }
  const rows = [...grid.entries()]
    .map(([name, cells]) => ({ name, cells, total: cells.reduce((a, b) => a + b, 0), hydrants: hydrantCount.get(name) ?? 0 }))
    .sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...rows.flatMap((r) => r.cells));
  return { weekLabels, rows, max };
}

export function neighborhoodStats(hydrants: Hydrant[], incidents: Incident[], neighborhood: string, now: number) {
  const hs = hydrants.filter((h) => h.neighborhood === neighborhood);
  const ids = new Set(hs.map((h) => h.id));
  const inc = incidents.filter((i) => ids.has(i.hydrantId) && i.kind === "obstruction");
  const recent = inc.filter((i) => now - i.startedAt < 30 * DAY);
  return { hydrants: hs, incidents: inc, recent, types: byType(inc, now, 60) };
}
