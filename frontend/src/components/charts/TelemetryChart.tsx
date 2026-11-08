import { useEffect, useMemo, useState } from "react";
import { Area, ComposedChart, CartesianGrid, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import type { Hydrant, Incident, TimeRange } from "@/types";
import { BLOCK_THRESHOLD_CM, CLEAR_THRESHOLD_CM, RANGES, series } from "@/services/telemetryService";
import { useApp } from "@/stores/appStore";
import { token, cn } from "@/lib/utils";
import { OBSTRUCTION_LABELS } from "@/services/analyticsService";

type Metric = "distance" | "temperature";

export function useChartColors() {
  return useMemo(
    () => ({
      accent: token("accent"),
      crit: token("crit"),
      warn: token("warn"),
      ok: token("ok"),
      line: token("line"),
      text3: token("text-3"),
      text2: token("text-2"),
      s3: token("surface-3"),
    }),
    [],
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded border border-line p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("h-6 rounded-[4px] px-2 text-xs transition-colors duration-150", value === o.value ? "bg-surface-3 text-text-1" : "text-text-3 hover:text-text-1")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TelemetryChart({ hydrant }: { hydrant: Hydrant }) {
  const [range, setRange] = useState<TimeRange>(() => (Date.now() - hydrant.statusSince < 3600e3 ? "1H" : "24H"));
  // A fresh state change is invisible at 24H scale; jump to 1H so it reads at a glance.
  useEffect(() => {
    if (Date.now() - hydrant.statusSince < 3600e3) setRange("1H");
  }, [hydrant.statusSince, hydrant.id]);
  const [metric, setMetric] = useState<Metric>("distance");
  const incidents = useApp((s) => s.incidents);
  const now = useApp((s) => s.now);
  const c = useChartColors();

  const data = useMemo(() => series(hydrant, incidents, range, now), [hydrant, incidents, range, now]);
  const start = data[0]?.t ?? now - RANGES[range].spanMs;
  const bands = useMemo(
    () =>
      incidents
        .filter((i: Incident) => i.hydrantId === hydrant.id && i.kind === "obstruction" && (i.resolvedAt ?? now) > start)
        .map((i) => ({ x1: Math.max(i.startedAt, start), x2: Math.min(i.resolvedAt ?? now, now), i })),
    [incidents, hydrant.id, start, now],
  );
  const hasData = data.some((d) => d.distanceCm !== null);
  const tickFmt = (t: number) => format(t, range === "7D" || range === "30D" ? "MMM d" : "HH:mm");

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label="Metric"
          value={metric}
          onChange={setMetric}
          options={[
            { value: "distance", label: "Distance" },
            { value: "temperature", label: "Temperature" },
          ]}
        />
        <Segmented label="Time range" value={range} onChange={setRange} options={(Object.keys(RANGES) as TimeRange[]).map((r) => ({ value: r, label: r }))} />
      </div>
      <div className="h-48" aria-label={`${metric === "distance" ? "Ultrasonic distance" : "Temperature"} over ${RANGES[range].label.toLowerCase()}`} role="img">
        {!hasData ? (
          <div className="grid h-full place-items-center rounded border border-dashed border-line text-xs text-text-3">
            {hydrant.monitored ? "No telemetry in this range. The device was offline." : "No sensor installed on this hydrant."}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} stroke={c.line} strokeOpacity={0.5} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={tickFmt}
                tick={{ fill: c.text3, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                tick={{ fill: c.text3, fontSize: 11, fontFamily: "Geist Mono" }}
                axisLine={false}
                tickLine={false}
                width={44}
                domain={metric === "distance" ? [0, 180] : ["dataMin - 2", "dataMax + 2"]}
                tickFormatter={(v: number) => `${Math.round(v)}`}
              />
              {bands.map((b) => (
                <ReferenceArea key={b.i.id} x1={b.x1} x2={b.x2} fill={c.crit} fillOpacity={0.08} stroke="none" ifOverflow="hidden" />
              ))}
              {metric === "distance" && (
                <>
                  <ReferenceLine y={BLOCK_THRESHOLD_CM} stroke={c.crit} strokeDasharray="4 4" strokeOpacity={0.7} label={{ value: `Block ${BLOCK_THRESHOLD_CM} cm`, position: "insideBottomLeft", fill: c.text3, fontSize: 11 }} />
                  <ReferenceLine y={CLEAR_THRESHOLD_CM} stroke={c.ok} strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: `Clear ${CLEAR_THRESHOLD_CM} cm`, position: "insideTopRight", fill: c.text3, fontSize: 11 }} />
                </>
              )}
              <Tooltip
                cursor={{ stroke: c.text3, strokeDasharray: "2 2" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as (typeof data)[number];
                  const band = bands.find((b) => p.t >= b.x1 && p.t <= b.x2);
                  return (
                    <div className="rounded border border-line bg-surface-1 px-2 py-1 text-xs shadow-float">
                      <div className="num text-text-3">{format(p.t, "MMM d, HH:mm")}</div>
                      <div className="num text-text-1">
                        {metric === "distance" ? (p.distanceCm === null ? "No data" : `${p.distanceCm.toFixed(1)} cm`) : p.temperatureC === null ? "No data" : `${p.temperatureC.toFixed(1)} °C`}
                      </div>
                      {band && <div className="text-crit">{band.i.obstructionType ? OBSTRUCTION_LABELS[band.i.obstructionType] : "Obstruction"}</div>}
                    </div>
                  );
                }}
              />
              {metric === "distance" ? (
                <Area key={`d-${range}-${hydrant.id}`} type="monotone" dataKey="distanceCm" stroke={c.accent} strokeWidth={1.5} fill={c.accent} fillOpacity={0.08} connectNulls={false} isAnimationActive animationDuration={250} dot={false} />
              ) : (
                <Line key={`t-${range}-${hydrant.id}`} type="monotone" dataKey="temperatureC" stroke={c.warn} strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive animationDuration={250} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="mt-2 text-2xs text-text-3">
        {metric === "distance" ? "Ultrasonic distance to the nearest object in front of the hydrant. Red bands mark recorded obstructions." : "Ambient temperature at the sensor."} Simulated telemetry.
      </p>
    </div>
  );
}
