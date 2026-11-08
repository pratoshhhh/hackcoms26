import { forwardRef, useId, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Crosshair, MapPin, Route, Search, Tag } from "lucide-react";
import { useApp, useHydrantList } from "@/stores/appStore";
import { STREETS } from "@/data/rochester";
import { distanceM, parseCoordinates } from "@/utils/geo";
import { STATUS_META, StatusIcon, statusLabel } from "@/components/hydrants/status";
import type { HydrantStatus } from "@/types";
import { Kbd } from "@/components/ui/primitives";
import { addressLine } from "@/data/obstructions";
import { cn } from "@/lib/utils";

type Result =
  | { kind: "hydrant"; id: string; label: string; sub: string; status: HydrantStatus }
  | { kind: "neighborhood"; label: string; sub: string; lng: number; lat: number }
  | { kind: "street"; label: string; sub: string; lng: number; lat: number }
  | { kind: "status"; label: string; sub: string; status: HydrantStatus }
  | { kind: "coords"; label: string; sub: string; lng: number; lat: number; nearestId?: string };

export const SearchBox = forwardRef<HTMLInputElement, { className?: string }>(function SearchBox({ className }, ref) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const hydrants = useHydrantList();
  const navigate = useNavigate();
  const location = useLocation();

  const results = useMemo<Result[]>(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const out: Result[] = [];
    const coords = parseCoordinates(q);
    if (coords) {
      let nearest: (typeof hydrants)[number] | undefined;
      let best = Infinity;
      for (const h of hydrants) {
        const d = distanceM(coords.lat, coords.lng, h.lat, h.lng);
        if (d < best) {
          best = d;
          nearest = h;
        }
      }
      out.push({
        kind: "coords",
        label: `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
        sub: nearest ? `Nearest hydrant ${nearest.id}, ${Math.round(best)} m away` : "Go to coordinates",
        ...coords,
        nearestId: nearest?.id,
      });
    }
    (Object.keys(STATUS_META) as HydrantStatus[]).forEach((st) => {
      const label = STATUS_META[st].label;
      if (label.toLowerCase().includes(s) || st.includes(s)) {
        const n = hydrants.filter((h) => h.status === st).length;
        out.push({ kind: "status", label: `Show only: ${label}`, sub: `${n} hydrants`, status: st });
      }
    });
    hydrants
      .filter(
        (h) =>
          h.id.toLowerCase().includes(s) ||
          (h.address ?? "").toLowerCase().includes(s) ||
          h.street.toLowerCase().includes(s) ||
          h.neighborhood.toLowerCase().includes(s) ||
          h.city.toLowerCase().includes(s),
      )
      .sort((a, b) => Number(!a.id.toLowerCase().startsWith(s)) - Number(!b.id.toLowerCase().startsWith(s)))
      .slice(0, 6)
      .forEach((h) => out.push({ kind: "hydrant", id: h.id, label: h.id, sub: `${addressLine(h)} · ${statusLabel(h)}`, status: h.status }));
    const groups = new Map<string, typeof hydrants>();
    hydrants.forEach((h) => groups.set(h.neighborhood, [...(groups.get(h.neighborhood) ?? []), h]));
    [...groups.entries()]
      .filter(([name, hs]) => name.toLowerCase().includes(s) || hs[0].city.toLowerCase().includes(s))
      .slice(0, 4)
      .forEach(([name, hs]) => {
        const lng = hs.reduce((a, h) => a + h.lng, 0) / hs.length;
        const lat = hs.reduce((a, h) => a + h.lat, 0) / hs.length;
        out.push({ kind: "neighborhood", label: name, sub: `${hs[0].city} · ${hs.length} hydrants`, lng, lat });
      });
    STREETS.filter((st) => st.name.toLowerCase().includes(s))
      .slice(0, 3)
      .forEach((st) => {
        const [a, b] = st.path;
        const count = hydrants.filter((h) => h.street === st.name || h.street === `Near ${st.name}`).length;
        out.push({ kind: "street", label: st.name, sub: `Street · ${count} hydrants nearby`, lng: (a[0] + b[0]) / 2, lat: (a[1] + b[1]) / 2 });
      });
    return out.slice(0, 12);
  }, [q, hydrants]);

  const choose = (r: Result) => {
    const st = useApp.getState();
    if (location.pathname !== "/map") navigate("/map");
    if (r.kind === "hydrant") st.select(r.id);
    else if (r.kind === "status") {
      st.setFilters({ statuses: [r.status] });
    } else if (r.kind === "coords") {
      if (r.nearestId) st.select(r.nearestId, { fly: false });
      st.focusOn(r.lng, r.lat, 17);
    } else st.focusOn(r.lng, r.lat, r.kind === "street" ? 14.5 : 15);
    setQ("");
    setOpen(false);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  const icon = (r: Result) => {
    if (r.kind === "hydrant" || r.kind === "status") return <StatusIcon status={r.status} />;
    if (r.kind === "neighborhood") return <MapPin className="size-4 text-text-3" strokeWidth={1.5} />;
    if (r.kind === "street") return <Route className="size-4 text-text-3" strokeWidth={1.5} />;
    return <Crosshair className="size-4 text-text-3" strokeWidth={1.5} />;
  };

  const showList = open && q.trim().length > 0;

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-1.5 top-1/2 size-4 -translate-y-1/2 text-text-3" strokeWidth={1.5} />
      <input
        ref={ref}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
        aria-label="Search hydrants, streets, neighborhoods, coordinates or status"
        placeholder="Search hydrants, streets, areas…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" && results[active]) {
            e.preventDefault();
            choose(results[active]);
          } else if (e.key === "Escape") {
            setQ("");
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="h-8 w-full rounded bg-transparent pl-7 pr-8 text-sm text-text-1 placeholder:text-text-3 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
      />
      <Kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 max-sm:hidden">/</Kbd>
      {showList && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-96 overflow-y-auto rounded-lg border border-line bg-surface-1 py-1 shadow-float">
          {results.length === 0 && <li className="px-3 py-2 text-sm text-text-2">No matches. Try a hydrant ID like ROC-0012, a street, or “43.15, -77.60”.</li>}
          {results.map((r, i) => (
            <li
              key={`${r.kind}-${r.label}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(r)}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer items-center gap-3 px-3 py-2", i === active && "bg-surface-2")}
            >
              {icon(r)}
              <div className="min-w-0 flex-1">
                <div className={cn("truncate text-sm text-text-1", (r.kind === "hydrant" || r.kind === "coords") && "num")}>{r.label}</div>
                <div className="truncate text-xs text-text-3">{r.sub}</div>
              </div>
              <span className="flex items-center gap-1 text-2xs text-text-3">
                <Tag className="size-3" strokeWidth={1.5} />
                {r.kind === "coords" ? "coordinates" : r.kind}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
