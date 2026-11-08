import { AnimatePresence } from "framer-motion";
import { RefreshCw, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { HydrantMap } from "@/components/map/HydrantMap";
import { MapControls, MapLegend } from "@/components/map/MapControls";
import { MapSidePanel } from "@/components/map/MapSidePanel";
import { HydrantPanel } from "@/components/hydrants/HydrantPanel";
import { useApp, useSelected } from "@/stores/appStore";
import { Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

function LoadBanner() {
  const loadState = useApp((s) => s.loadState);
  const warning = useApp((s) => s.loadWarning);
  const init = useApp((s) => s.init);
  const [dismissed, setDismissed] = useState(false);

  if (loadState === "loading")
    return (
      <div className="float flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-2" role="status">
        <RefreshCw className="size-4 animate-spin" strokeWidth={1.5} />
        Loading fire hydrants from OpenStreetMap…
      </div>
    );
  if (loadState === "error")
    return (
      <div className="float flex items-center gap-3 rounded-lg px-3 py-2 text-sm" role="alert">
        Couldn't load hydrants: {warning}
        <Button size="sm" onClick={() => void init(true)}>
          Retry
        </Button>
      </div>
    );
  if (warning && !dismissed)
    return (
      <div className="float flex max-w-xl items-start gap-3 rounded-lg px-3 py-2 text-sm" role="status">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" strokeWidth={1.5} />
        <span className="text-text-2">{warning}</span>
        <Button size="sm" variant="ghost" onClick={() => void init(true)}>
          Retry
        </Button>
        <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="text-text-3 hover:text-text-1">
          <X className="size-4" strokeWidth={1.5} />
        </button>
      </div>
    );
  return null;
}

export default function MapPage() {
  const selected = useSelected();
  return (
    <div className="absolute inset-0">
      <HydrantMap />

      <div className="pointer-events-none absolute bottom-[140px] left-3 top-[68px] flex flex-col items-start">
        <div className="pointer-events-auto flex max-h-full min-h-0 flex-col">
          <MapSidePanel />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-[68px] flex justify-center px-48">
        <div className="pointer-events-auto">
          <LoadBanner />
        </div>
      </div>

      <div className={cn("pointer-events-none absolute right-3 top-[68px] transition-[right] duration-200 ease-std", selected && "md:right-[476px]")}>
        <div className="pointer-events-auto">
          <MapControls />
        </div>
      </div>

      <div className="pointer-events-auto absolute bottom-3 left-3 hidden lg:block">
        <MapLegend />
      </div>

      <AnimatePresence>{selected && <HydrantPanel key="panel" hydrant={selected} />}</AnimatePresence>
    </div>
  );
}
