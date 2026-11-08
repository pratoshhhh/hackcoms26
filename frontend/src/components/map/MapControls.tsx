import * as Popover from "@radix-ui/react-popover";
import { Compass, Layers, Locate, Minus, Plus } from "lucide-react";
import { useApp } from "@/stores/appStore";
import { Switch, Tip } from "@/components/ui/primitives";
import { ROCHESTER_CENTER, ROCHESTER_ZOOM } from "@/data/rochester";
import { getMap } from "./HydrantMap";

const btn = "grid size-8 place-items-center text-text-2 hover:bg-surface-2 hover:text-text-1 [&_svg]:size-4 [&_svg]:stroke-[1.5]";

export function MapControls() {
  const heatmap = useApp((s) => s.heatmap);
  const satellite = useApp((s) => s.satellite);
  const buildings3d = useApp((s) => s.buildings3d);
  const toggle = useApp((s) => s.toggle);
  const focusOn = useApp((s) => s.focusOn);

  return (
    <div className="flex flex-col gap-2">
      <div className="float flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line">
        <Tip content="Zoom in" side="left">
          <button className={btn} onClick={() => getMap()?.zoomIn()} aria-label="Zoom in">
            <Plus />
          </button>
        </Tip>
        <Tip content="Zoom out" side="left">
          <button className={btn} onClick={() => getMap()?.zoomOut()} aria-label="Zoom out">
            <Minus />
          </button>
        </Tip>
        <Tip content="Reset bearing and pitch" side="left">
          <button className={btn} onClick={() => getMap()?.resetNorthPitch()} aria-label="Reset bearing">
            <Compass />
          </button>
        </Tip>
      </div>
      <div className="float flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line">
        <Tip content="Reset map to Rochester" side="left">
          <button
            className={btn}
            onClick={() => {
              useApp.getState().select(null, { fly: false });
              focusOn(ROCHESTER_CENTER[0], ROCHESTER_CENTER[1], ROCHESTER_ZOOM);
            }}
            aria-label="Reset map to Rochester"
          >
            <Locate />
          </button>
        </Tip>
        <Popover.Root>
          <Tip content="Map layers" side="left">
            <Popover.Trigger asChild>
              <button className={btn} aria-label="Map layers">
                <Layers />
              </button>
            </Popover.Trigger>
          </Tip>
          <Popover.Portal>
            <Popover.Content side="left" align="start" sideOffset={8} className="z-50 w-64 rounded-lg border border-line bg-surface-1 p-1 shadow-float">
              {[
                { key: "heatmap" as const, label: "Risk heatmap", hint: "Weighted by hydrant risk score", on: heatmap },
                { key: "satellite" as const, label: "Satellite imagery", hint: "Esri World Imagery", on: satellite },
                { key: "buildings3d" as const, label: "3D buildings", hint: "Visible from zoom 14 · OpenFreeMap", on: buildings3d },
              ].map((l) => (
                <label key={l.key} className="flex cursor-pointer items-center justify-between gap-3 rounded px-3 py-2 hover:bg-surface-2">
                  <span>
                    <span className="block text-sm text-text-1">{l.label}</span>
                    <span className="block text-2xs text-text-3">{l.hint}</span>
                  </span>
                  <Switch checked={l.on} onCheckedChange={() => toggle(l.key)} aria-label={l.label} />
                </label>
              ))}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </div>
  );
}

/** Legend: shape + color + label for each status. */
export function MapLegend() {
  const items = [
    { label: "Accessible", el: <span className="size-2.5 rounded-full bg-ok ring-1 ring-bg" /> },
    { label: "Possible obstruction", el: <span className="grid size-3.5 place-items-center rounded-full ring-1 ring-warn"><span className="size-2 rounded-full bg-warn" /></span> },
    { label: "Blocked", el: <span className="size-3 rounded-full bg-crit" /> },
    { label: "Offline / unmonitored", el: <span className="size-2.5 rounded-full border-[1.5px] border-muted bg-surface-1" /> },
  ];
  return (
    <div className="float hidden rounded-lg border border-line px-3 py-2 sm:block">
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i.label} className="flex items-center gap-2 text-xs text-text-2">
            <span className="grid w-4 place-items-center">{i.el}</span>
            {i.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
