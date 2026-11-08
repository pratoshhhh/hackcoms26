import { useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { ChevronLeft, SlidersHorizontal } from "lucide-react";
import { DEFAULT_FILTERS, useApp, useHydrantList } from "@/stores/appStore";
import { useFilteredHydrants } from "@/hooks";
import { Button, Checkbox, Select, Switch, Tip } from "@/components/ui/primitives";
import { RiskBadge, STATUS_META, StatusIcon, statusLabel } from "@/components/hydrants/status";
import type { HydrantStatus, ObstructionType, RiskLevel } from "@/types";
import { OBSTRUCTION_LABELS } from "@/services/analyticsService";
import { duration } from "@/utils/format";
import { cn } from "@/lib/utils";

const STATUSES: HydrantStatus[] = ["clear", "warning", "blocked", "offline"];
const TYPES = Object.keys(OBSTRUCTION_LABELS) as ObstructionType[];
const RISKS: RiskLevel[] = ["low", "moderate", "high", "critical"];

function toggleIn<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function Filters() {
  const filters = useApp((s) => s.filters);
  const setFilters = useApp((s) => s.setFilters);
  const resetFilters = useApp((s) => s.resetFilters);
  const heatmap = useApp((s) => s.heatmap);
  const toggle = useApp((s) => s.toggle);
  const all = useHydrantList();
  const counts = useMemo(() => {
    const c: Record<HydrantStatus, number> = { clear: 0, warning: 0, blocked: 0, offline: 0 };
    all.forEach((h) => c[h.status]++);
    return c;
  }, [all]);

  const group = "border-b border-line px-3 py-3";
  const legend = "mb-2 text-xs font-medium text-text-2";

  return (
    <div>
      <fieldset className={group}>
        <legend className={legend}>Status</legend>
        {STATUSES.map((s) => (
          <label key={s} className="flex h-8 cursor-pointer items-center gap-2 rounded px-1 hover:bg-surface-2">
            <Checkbox checked={filters.statuses.includes(s)} onCheckedChange={() => setFilters({ statuses: toggleIn(filters.statuses, s) })} />
            <StatusIcon status={s} />
            <span className="flex-1 text-sm">{STATUS_META[s].label}</span>
            <span className="num text-xs text-text-3">{counts[s]}</span>
          </label>
        ))}
        <label className="mt-1 flex h-8 cursor-pointer items-center justify-between gap-2 px-1 text-sm text-text-2">
          Include unmonitored hydrants
          <Switch checked={filters.includeUnmonitored} onCheckedChange={(v) => setFilters({ includeUnmonitored: v })} />
        </label>
      </fieldset>
      <fieldset className={group}>
        <legend className={legend}>Obstruction type</legend>
        <div className="flex flex-wrap gap-1">
          {TYPES.map((t) => {
            const on = filters.obstructionTypes.includes(t);
            return (
              <button
                key={t}
                aria-pressed={on}
                onClick={() => setFilters({ obstructionTypes: toggleIn(filters.obstructionTypes, t) })}
                className={cn("h-7 rounded border px-2 text-xs", on ? "border-accent bg-accent/10 text-text-1" : "border-line text-text-2 hover:bg-surface-2")}
              >
                {OBSTRUCTION_LABELS[t]}
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset className={group}>
        <legend className={legend}>Risk level</legend>
        <div className="grid grid-cols-2 gap-1">
          {RISKS.map((r) => (
            <label key={r} className="flex h-8 cursor-pointer items-center gap-2 rounded px-1 hover:bg-surface-2">
              <Checkbox checked={filters.riskLevels.includes(r)} onCheckedChange={() => setFilters({ riskLevels: toggleIn(filters.riskLevels, r) })} />
              <RiskBadge level={r} />
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className={group}>
        <legend className={legend}>Last updated</legend>
        <Select
          value={filters.updatedWithinMin ?? ""}
          onChange={(e) => setFilters({ updatedWithinMin: e.target.value === "" ? null : Number(e.target.value) })}
          aria-label="Last updated within"
        >
          <option value="">Any time</option>
          <option value="1">Within 1 minute</option>
          <option value="15">Within 15 minutes</option>
          <option value="60">Within 1 hour</option>
          <option value="1440">Within 24 hours</option>
        </Select>
      </fieldset>
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-text-2">
          <Switch checked={heatmap} onCheckedChange={() => toggle("heatmap")} />
          Risk heatmap
        </label>
        <Button variant="ghost" size="sm" onClick={resetFilters} disabled={JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS)}>
          Reset filters
        </Button>
      </div>
    </div>
  );
}

const RANK: Record<HydrantStatus, number> = { blocked: 0, warning: 1, offline: 2, clear: 3 };

function InView() {
  const list = useFilteredHydrants();
  const selectedId = useApp((s) => s.selectedId);
  const select = useApp((s) => s.select);
  const now = useApp((s) => s.now);
  const sorted = useMemo(() => [...list].sort((a, b) => RANK[a.status] - RANK[b.status] || b.riskScore - a.riskScore), [list]);
  if (!sorted.length) return <p className="px-3 py-6 text-sm text-text-2">No hydrants match these filters. Reset filters to see all hydrants.</p>;
  return (
    <ul className="divide-y divide-line" aria-label="Hydrants matching filters">
      {sorted.slice(0, 150).map((h) => (
        <li key={h.id}>
          <button
            onClick={() => select(h.id)}
            className={cn("flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2", selectedId === h.id && "bg-surface-3")}
            aria-current={selectedId === h.id}
          >
            <StatusIcon status={h.status} className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="num block text-sm text-text-1">{h.id}</span>
              <span className="block truncate text-xs text-text-3">{h.street} · {h.neighborhood}</span>
            </span>
            <span className="text-right text-2xs text-text-3">
              <span className="block">{statusLabel(h)}</span>
              {h.status !== "clear" && h.monitored && <span className="num block">{duration(now - h.statusSince)}</span>}
            </span>
          </button>
        </li>
      ))}
      {sorted.length > 150 && <li className="px-3 py-2 text-xs text-text-3">Showing 150 of {sorted.length}. Narrow with filters or search.</li>}
    </ul>
  );
}

export function MapSidePanel() {
  const [open, setOpen] = useState(false);
  const filtered = useFilteredHydrants().length;
  const total = useApp((s) => s.hydrantIds.length);
  const filters = useApp((s) => s.filters);
  const active = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  if (!open)
    return (
      <Tip content="Show filters and hydrant list" side="right">
        <Button variant="secondary" className="float h-9" onClick={() => setOpen(true)}>
          <SlidersHorizontal />
          Filters
          {active && <span className="size-1.5 rounded-full bg-accent" aria-label="Filters active" />}
        </Button>
      </Tip>
    );

  return (
    <div className="float flex max-h-full w-72 flex-col overflow-hidden rounded-lg">
      <Tabs.Root defaultValue="filters" className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-1 border-b border-line px-2 py-1">
          <Tabs.List className="flex flex-1 gap-1" aria-label="Map panel">
            {[
              ["filters", "Filters"],
              ["list", "Hydrants"],
            ].map(([v, l]) => (
              <Tabs.Trigger key={v} value={v} className="h-7 rounded px-2 text-sm text-text-2 hover:text-text-1 data-[state=active]:bg-surface-3 data-[state=active]:text-text-1">
                {l}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <span className="num text-xs text-text-3" aria-live="polite">
            {filtered}/{total}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Hide panel">
            <ChevronLeft />
          </Button>
        </div>
        <Tabs.Content value="filters" className="min-h-0 flex-1 overflow-y-auto">
          <Filters />
        </Tabs.Content>
        <Tabs.Content value="list" className="min-h-0 flex-1 overflow-y-auto">
          <InView />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
