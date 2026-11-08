import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useApp, useHydrantList } from "@/stores/appStore";
import { Input, PageHeader, Select, Button } from "@/components/ui/primitives";
import { KpiStrip } from "@/components/ui/KpiStrip";
import { byType, neighborhoodGrid, OBSTRUCTION_LABELS, summary, topRisk, weeklyTrend } from "@/services/analyticsService";
import { RiskBadge, StatusChip, StatusIcon } from "@/components/hydrants/status";
import { useChartColors } from "@/components/charts/TelemetryChart";
import { duration, fmtDateTime } from "@/utils/format";
import type { ObstructionType } from "@/types";
import { cn } from "@/lib/utils";

function Panel({ title, sub, children, className }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border border-line bg-surface-1", className)}>
      <header className="border-b border-line px-4 py-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {sub && <p className="text-xs text-text-3">{sub}</p>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function ChartTooltip({ active, payload, label, unit }: { active?: boolean; payload?: { name: string; value: number }[]; label?: string; unit?: Record<string, string> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-line bg-surface-1 px-2 py-1 text-xs shadow-float">
      <div className="text-text-3">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="num text-text-1">
          {p.name}: {p.value}
          {unit?.[p.name] ?? ""}
        </div>
      ))}
    </div>
  );
}

type SortKey = "startedAt" | "duration" | "hydrantId";

function HistoryTable() {
  const incidents = useApp((s) => s.incidents);
  const hydrants = useApp((s) => s.hydrants);
  const now = useApp((s) => s.now);
  const select = useApp((s) => s.select);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [type, setType] = useState<ObstructionType | "">("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "startedAt", dir: -1 });
  const [page, setPage] = useState(0);
  const PAGE = 15;

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return incidents
      .filter((i) => i.kind === "obstruction")
      .filter((i) => !type || i.obstructionType === type)
      .filter((i) => !s || i.hydrantId.toLowerCase().includes(s) || hydrants[i.hydrantId]?.neighborhood.toLowerCase().includes(s) || hydrants[i.hydrantId]?.street.toLowerCase().includes(s))
      .map((i) => ({ ...i, dur: (i.resolvedAt ?? now) - i.startedAt }))
      .sort((a, b) => {
        const v = sort.key === "duration" ? a.dur - b.dur : sort.key === "hydrantId" ? a.hydrantId.localeCompare(b.hydrantId) : a.startedAt - b.startedAt;
        return v * sort.dir;
      });
  }, [incidents, hydrants, q, type, sort, now]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const view = rows.slice(page * PAGE, page * PAGE + PAGE);
  const th = (key: SortKey, label: string, right?: boolean) => (
    <th className={cn("px-3 py-2 font-medium", right && "text-right")} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button className="inline-flex items-center gap-1 hover:text-text-1" onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : -1 }))}>
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  );

  return (
    <section className="rounded-lg border border-line bg-surface-1">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
        <div>
          <h2 className="text-base font-semibold">Incident history</h2>
          <p className="text-xs text-text-3">{rows.length} obstructions · seeded 60-day history plus this session</p>
        </div>
        <div className="flex gap-2">
          <Input value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} placeholder="Filter by hydrant, street, area" className="w-56" aria-label="Filter incidents" />
          <Select value={type} onChange={(e) => (setType(e.target.value as ObstructionType | ""), setPage(0))} className="w-36" aria-label="Obstruction type">
            <option value="">All types</option>
            {(Object.keys(OBSTRUCTION_LABELS) as ObstructionType[]).map((t) => (
              <option key={t} value={t}>
                {OBSTRUCTION_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-xs">
          <thead className="text-left text-text-3">
            <tr className="border-b border-line">
              {th("hydrantId", "Hydrant")}
              <th className="px-3 py-2 font-medium">Cause</th>
              <th className="px-3 py-2 font-medium">Neighborhood</th>
              {th("startedAt", "Started")}
              {th("duration", "Time to clear", true)}
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {view.map((i) => (
              <tr
                key={i.id}
                className="h-8 cursor-pointer hover:bg-surface-2"
                onClick={() => {
                  select(i.hydrantId);
                  navigate("/map");
                }}
              >
                <td className="num px-3 py-2">{i.hydrantId}</td>
                <td className="px-3 py-2">{i.obstructionType ? OBSTRUCTION_LABELS[i.obstructionType] : "—"}</td>
                <td className="px-3 py-2 text-text-2">{hydrants[i.hydrantId]?.neighborhood}</td>
                <td className="num px-3 py-2 text-text-2">{fmtDateTime(i.startedAt)}</td>
                <td className="num px-3 py-2 text-right">{duration(i.dur)}</td>
                <td className="px-3 py-2">
                  {i.status === "active" ? (
                    <span className="inline-flex items-center gap-1 text-crit">
                      <StatusIcon status="blocked" className="size-3.5" /> Active
                    </span>
                  ) : (
                    <span className="text-text-2">Resolved</span>
                  )}
                </td>
              </tr>
            ))}
            {view.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-sm text-text-2">
                  No incidents match. Clear the filter to see all.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <footer className="flex items-center justify-between border-t border-line px-4 py-2 text-xs text-text-3">
        <span className="num">
          Page {page + 1} of {pages}
        </span>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous page
          </Button>
          <Button size="sm" variant="ghost" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
            Next page
          </Button>
        </div>
      </footer>
    </section>
  );
}

export default function AnalyticsPage() {
  const hydrants = useHydrantList();
  const incidents = useApp((s) => s.incidents);
  const now = useApp((s) => s.now);
  const select = useApp((s) => s.select);
  const navigate = useNavigate();
  const c = useChartColors();
  const hourNow = Math.floor(now / 3600000) * 3600000;

  const sum = useMemo(() => summary(hydrants, incidents, now), [hydrants, incidents, now]);
  const trend = useMemo(() => weeklyTrend(incidents, hourNow), [incidents, hourNow]);
  const types = useMemo(() => byType(incidents, hourNow), [incidents, hourNow]);
  const top = useMemo(() => topRisk(hydrants), [hydrants]);
  const grid = useMemo(() => neighborhoodGrid(hydrants, incidents, hourNow), [hydrants, incidents, hourNow]);
  const delta = sum.incidents30d - sum.incidentsPrev30d;

  const go = (id: string) => {
    select(id);
    navigate("/map");
  };

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader title="Risk analytics" description="Seeded historical data, structured like the Tiger Data continuous aggregates it will come from." />
      <div className="space-y-6 px-6 py-6">
        <KpiStrip
          items={[
            { label: "Hydrants monitored", value: sum.monitored, context: `of ${sum.totalHydrants} mapped` },
            { label: "Currently blocked", value: sum.blocked, tone: sum.blocked ? "crit" : undefined, context: `${sum.warning} possible` },
            { label: "Avg clearing time", value: duration(sum.avgClearMinutes * 60000), context: "Last 30 days" },
            { label: "Device availability", value: sum.deviceAvailabilityPct.toFixed(1), unit: "%", context: `${sum.offline} offline` },
            { label: "Obstructions, 30 days", value: sum.incidents30d, context: `${delta >= 0 ? "+" : ""}${delta} vs previous 30 days` },
          ]}
        />

        <div className="grid gap-6 xl:grid-cols-5">
          <Panel title="Weekly obstruction trend" sub="Bars: obstructions per week · Line: average minutes to clear" className="xl:col-span-3">
            <div className="h-64">
              <ResponsiveContainer>
                <ComposedChart data={trend} margin={{ top: 8, right: 0, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={c.line} strokeOpacity={0.5} />
                  <XAxis dataKey="week" tick={{ fill: c.text3, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="l" tick={{ fill: c.text3, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fill: c.text3, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: c.s3, fillOpacity: 0.5 }} content={<ChartTooltip unit={{ "Avg clear": " min" }} />} />
                  <Bar yAxisId="l" dataKey="total" name="Obstructions" fill={c.accent} radius={[2, 2, 0, 0]} maxBarSize={28} animationDuration={250} />
                  <Line yAxisId="r" dataKey="avgClearMin" name="Avg clear" stroke={c.warn} strokeWidth={1.5} dot={false} animationDuration={250} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel title="Incidents by cause" sub="Last 60 days" className="xl:col-span-2">
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={types} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke={c.line} strokeOpacity={0.5} />
                  <XAxis type="number" tick={{ fill: c.text3, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={{ fill: c.text2, fontSize: 12 }} axisLine={false} tickLine={false} width={96} />
                  <Tooltip cursor={{ fill: c.s3, fillOpacity: 0.5 }} content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Incidents" fill={c.accent} radius={[0, 2, 2, 0]} maxBarSize={18} animationDuration={250} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>

        <div className="grid gap-6 2xl:grid-cols-2">
          <section className="overflow-x-auto rounded-lg border border-line bg-surface-1">
            <header className="border-b border-line px-4 py-2">
              <h2 className="text-base font-semibold">Top 10 high-risk hydrants</h2>
              <p className="text-xs text-text-3">Score = recent frequency + clearing time + current state + site baseline</p>
            </header>
            <table className="w-full min-w-[620px] whitespace-nowrap text-xs">
              <thead className="text-left text-text-3">
                <tr className="border-b border-line">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Hydrant</th>
                  <th className="px-3 py-2 font-medium">Neighborhood</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Risk</th>
                  <th className="w-28 px-3 py-2 text-right font-medium">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {top.map((h, i) => (
                  <tr key={h.id} className="h-8 cursor-pointer hover:bg-surface-2" onClick={() => go(h.id)}>
                    <td className="num px-3 py-1 text-text-3">{i + 1}</td>
                    <td className="num px-3 py-1">{h.id}</td>
                    <td className="truncate px-3 py-1 text-text-2">{h.neighborhood}</td>
                    <td className="px-3 py-1">
                      <StatusChip hydrant={h} className="h-5" />
                    </td>
                    <td className="px-3 py-1">
                      <RiskBadge level={h.riskLevel} />
                    </td>
                    <td className="px-3 py-1">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1 w-14 overflow-hidden rounded-full bg-surface-3">
                          <div className="h-full bg-crit" style={{ width: `${h.riskScore}%` }} />
                        </div>
                        <span className="num w-6 text-right">{h.riskScore}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="rounded-lg border border-line bg-surface-1">
            <header className="border-b border-line px-4 py-2">
              <h2 className="text-base font-semibold">Neighborhood heatmap</h2>
              <p className="text-xs text-text-3">Obstructions per week. Darker cells mean more incidents, and every cell shows its count.</p>
            </header>
            <div className="overflow-x-auto p-4">
              <table className="w-full text-2xs">
                <thead>
                  <tr>
                    <th className="sr-only">Neighborhood</th>
                    {grid.weekLabels.map((w) => (
                      <th key={w} className="px-0.5 pb-1 text-center font-normal text-text-3">
                        {w}
                      </th>
                    ))}
                    <th className="pb-1 pl-2 text-right font-normal text-text-3">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {grid.rows.slice(0, 12).map((r) => (
                    <tr key={r.name}>
                      <th className="truncate whitespace-nowrap pr-2 text-left text-xs font-normal text-text-2">{r.name}</th>
                      {r.cells.map((v, i) => (
                        <td key={i} className="p-0.5">
                          <div
                            className={cn("num grid h-6 min-w-8 place-items-center rounded-[3px]", v ? "text-text-1" : "text-text-3")}
                            style={{ backgroundColor: v ? `rgb(var(--crit) / ${0.12 + (v / grid.max) * 0.7})` : "rgb(var(--surface-3))" }}
                            title={`${r.name}, week of ${grid.weekLabels[i]}: ${v} obstructions`}
                          >
                            {v}
                          </div>
                        </td>
                      ))}
                      <td className="num pl-2 text-right text-xs">{r.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <HistoryTable />
      </div>
    </div>
  );
}
