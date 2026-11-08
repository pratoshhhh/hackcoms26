import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CarFront, CloudSnow, Plug, ShieldCheck, WifiOff, X } from "lucide-react";
import { useApp, useHydrantList, useSelected } from "@/stores/appStore";
import { Button, Select } from "@/components/ui/primitives";
import { StatusChip } from "@/components/hydrants/status";
import { useReducedMotion } from "@/hooks";

/**
 * Developer / judge panel. Every button goes through the store actions, which are the
 * same code path a real sensor event will use once the WebSocket is connected.
 */
export function DemoControlPanel() {
  const open = useApp((s) => s.demoPanelOpen);
  const toggle = useApp((s) => s.toggle);
  const reduced = useReducedMotion();
  const selected = useSelected();
  const hydrants = useHydrantList();
  const [pickedId, setPickedId] = useState<string>("");

  const candidates = useMemo(() => hydrants.filter((h) => h.monitored).slice(0, 400), [hydrants]);
  const target = selected ?? hydrants.find((h) => h.id === pickedId) ?? candidates.find((h) => h.status === "clear") ?? null;
  const s = useApp.getState();

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          role="dialog"
          aria-label="Demo controls"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
          transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
          className={`float fixed inset-x-0 bottom-[76px] z-40 mx-auto w-[min(560px,calc(100vw-32px))] rounded-lg border border-line shadow-float ${selected ? "md:right-[452px]" : ""}`}
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-2">
            <div>
              <h2 className="text-base font-semibold">Demo controls</h2>
              <p className="text-xs text-text-3">Simulated sensor events. They update the map, incidents, alerts and charts together.</p>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => toggle("demoPanelOpen")} aria-label="Close demo controls">
              <X />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="text-xs text-text-2">Target</span>
            {selected ? (
              <span className="num text-sm">{selected.id}</span>
            ) : (
              <Select className="h-7 w-44 text-xs" value={target?.id ?? ""} onChange={(e) => setPickedId(e.target.value)} aria-label="Target hydrant">
                {candidates.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.id} · {h.status}
                  </option>
                ))}
              </Select>
            )}
            {target && <StatusChip hydrant={target} />}
            {target && !selected && (
              <Button variant="ghost" size="sm" onClick={() => s.select(target.id)}>
                Open on map
              </Button>
            )}
          </div>
          {target && !target.monitored ? (
            <p className="px-4 pb-4 text-sm text-text-2">
              {target.id} has no sensor installed, so there is nothing to simulate. Close the hydrant panel and pick a monitored hydrant.
            </p>
          ) : target ? (
            <div className="grid grid-cols-1 gap-2 px-4 pb-4 sm:grid-cols-2 [&_button]:h-auto [&_button]:min-h-8 [&_button]:justify-start [&_button]:whitespace-normal [&_button]:py-1.5 [&_button]:text-left">
              <Button variant="danger" onClick={() => s.simulateObstruction(target.id, "snow")}>
                <CloudSnow /> Simulate snow obstruction
              </Button>
              <Button variant="danger" onClick={() => s.simulateObstruction(target.id, "vehicle")}>
                <CarFront /> Simulate vehicle obstruction
              </Button>
              <Button onClick={() => s.clearObstruction(target.id, "Cleared (demo control)")} disabled={target.status !== "blocked" && target.status !== "warning"}>
                <ShieldCheck /> Clear obstruction
              </Button>
              <Button onClick={() => s.setOffline(target.id)} disabled={target.status === "offline" || !target.monitored}>
                <WifiOff /> Simulate device offline
              </Button>
              <Button onClick={() => s.restoreDevice(target.id)} disabled={target.status !== "offline"}>
                <Plug /> Restore connectivity
              </Button>
              <Button variant="ghost" onClick={() => s.simulateObstruction(target.id, "debris", "warning")}>
                Simulate possible obstruction
              </Button>
            </div>
          ) : (
            <p className="px-4 pb-4 text-sm text-text-2">Hydrants are still loading.</p>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
