import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as Tabs from "@radix-ui/react-tabs";
import { motion } from "framer-motion";
import { useApp } from "@/stores/appStore";
import { Button, PageHeader } from "@/components/ui/primitives";
import { StatusIcon } from "@/components/hydrants/status";
import { OBSTRUCTION_LABELS } from "@/services/analyticsService";
import { duration, fmtDateTime } from "@/utils/format";
import type { Incident } from "@/types";
import { cn, token } from "@/lib/utils";
import { addressLine } from "@/data/obstructions";
import { useReducedMotion } from "@/hooks";

const severityStatus = (i: Incident) => (i.kind === "device" ? "offline" : i.severity === "critical" ? "blocked" : "warning");
const severityLabel = (i: Incident) => (i.kind === "device" ? "Device" : i.severity === "critical" ? "Blocked" : "Possible");

export default function IncidentsPage() {
  const incidents = useApp((s) => s.incidents);
  const hydrants = useApp((s) => s.hydrants);
  const now = useApp((s) => s.now);
  const flash = useApp((s) => s.flashIncidentId);
  const select = useApp((s) => s.select);
  const clear = useApp((s) => s.clearObstruction);
  const restore = useApp((s) => s.restoreDevice);
  const createTask = useApp((s) => s.createTask);
  const setStore = useApp((s) => s.set);
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [tab, setTab] = useState("active");

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setStore("flashIncidentId", null), 2000);
    return () => clearTimeout(t);
  }, [flash, setStore]);

  const active = useMemo(
    () => incidents.filter((i) => i.status === "active").sort((a, b) => (a.severity === b.severity ? b.startedAt - a.startedAt : a.severity === "critical" ? -1 : 1)),
    [incidents],
  );
  const resolved = useMemo(() => incidents.filter((i) => i.status === "resolved").sort((a, b) => b.resolvedAt! - a.resolvedAt!).slice(0, 200), [incidents]);
  const list = tab === "active" ? active : resolved;

  const view = (id: string) => {
    select(id);
    navigate("/map");
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Incidents" description="Obstructions and device outages, newest first. Severity follows the sensor state machine." />
      <Tabs.Root value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <Tabs.List className="flex gap-4 border-b border-line px-6" aria-label="Incident status">
          {[
            ["active", `Active`, active.length],
            ["resolved", `Resolved`, resolved.length],
          ].map(([v, l, n]) => (
            <Tabs.Trigger key={v} value={v as string} className="-mb-px flex h-10 items-center gap-2 border-b-2 border-transparent text-sm text-text-2 data-[state=active]:border-accent data-[state=active]:text-text-1">
              {l}
              <span className="num rounded bg-surface-3 px-1 text-2xs">{n}</span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <div className="min-h-0 flex-1 overflow-auto">
          {list.length === 0 ? (
            <p className="px-6 py-8 text-sm text-text-2">{tab === "active" ? "No active incidents. Trigger one from Demo controls." : "No resolved incidents yet."}</p>
          ) : (
            <table className="w-full min-w-[980px] text-xs">
              <thead className="sticky top-0 z-10 bg-bg text-left text-text-3">
                <tr className="border-b border-line">
                  <th className="px-3 py-2 pl-6 font-medium">Severity</th>
                  <th className="px-3 py-2 font-medium">Hydrant</th>
                  <th className="px-3 py-2 font-medium">What&apos;s blocking it</th>
                  <th className="px-3 py-2 font-medium">Address and coordinates</th>
                  <th className="px-3 py-2 font-medium">Started</th>
                  <th className="px-3 py-2 text-right font-medium">{tab === "active" ? "Open for" : "Took"}</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 pr-6 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((i) => {
                  const h = hydrants[i.hydrantId];
                  const isFlash = flash === i.id;
                  return (
                    <motion.tr
                      key={i.id}
                      initial={isFlash && !reduced ? { backgroundColor: token("crit", 0.18) } : false}
                      animate={{ backgroundColor: token("crit", 0) }}
                      transition={{ duration: 1.6, ease: [0.2, 0, 0, 1] }}
                      className="h-8 hover:bg-surface-1"
                    >
                      <td className="px-3 py-2 pl-6">
                        <span className="flex items-center gap-2">
                          <StatusIcon status={severityStatus(i)} className="size-3.5" />
                          {severityLabel(i)}
                        </span>
                      </td>
                      <td className="num px-3 py-2">{i.hydrantId}</td>
                      <td className="max-w-[300px] px-3 py-2">
                        <div className="text-text-1">{i.kind === "device" ? "No sensor readings" : i.obstructionType ? OBSTRUCTION_LABELS[i.obstructionType] : "Unknown"}</div>
                        {i.detail && (
                          <div className="truncate text-text-3" title={i.detail}>
                            {i.detail}
                          </div>
                        )}
                      </td>
                      <td className="max-w-[260px] px-3 py-2 text-text-2">
                        <div className="truncate" title={h ? addressLine(h) : ""}>{h ? addressLine(h) : "—"}</div>
                        {h && <div className="num truncate text-text-3">{h.lat.toFixed(6)}, {h.lng.toFixed(6)}</div>}
                      </td>
                      <td className="num px-3 py-2 text-text-2">{fmtDateTime(i.startedAt)}</td>
                      <td className="num px-3 py-2 text-right">{duration((i.resolvedAt ?? now) - i.startedAt)}</td>
                      <td className="px-3 py-2 text-text-3">{i.origin === "seeded" ? "Seeded" : i.origin === "demo" ? "Demo event" : i.origin === "device" ? "ESP32 sensor" : "Report"}</td>
                      <td className="px-3 py-1 pr-6">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => view(i.hydrantId)}>
                            View on map
                          </Button>
                          {tab === "active" && i.kind === "obstruction" && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  const t = createTask(i.hydrantId);
                                  if (t) navigate(`/maintenance?task=${t.id}`);
                                }}
                              >
                                Open task
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => clear(i.hydrantId, "Cleared from incident list (demo)")}>
                                Mark cleared
                              </Button>
                            </>
                          )}
                          {tab === "active" && i.kind === "device" && (
                            <Button size="sm" variant="ghost" onClick={() => restore(i.hydrantId)}>
                              Restore device
                            </Button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Tabs.Root>
      <p className={cn("border-t border-line px-6 py-2 text-2xs text-text-3")}>Seeded history and demo events. Actions here use the same store as live sensor events.</p>
    </div>
  );
}
