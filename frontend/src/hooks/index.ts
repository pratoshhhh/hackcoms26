import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useApp, useHydrantList } from "@/stores/appStore";
import type { Hydrant } from "@/types";
import { lastUpdateAt } from "@/services/telemetryService";

/** Global 5s clock so "x s ago" labels and live chart edges advance. */
export function useTicker(ms = 5000) {
  const tick = useApp((s) => s.tick);
  useEffect(() => {
    const t = setInterval(tick, ms);
    return () => clearInterval(t);
  }, [tick, ms]);
}

export function useOnlineStatus() {
  const setOnline = useApp((s) => s.setOnline);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [setOnline]);
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fn = () => setReduced(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return reduced;
}

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const fn = () => setM(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [q]);
  return m;
}

/** `/` focuses search, `Esc` closes the hydrant panel (DESIGN.md §6). */
export function useGlobalShortcuts(searchRef: React.RefObject<HTMLInputElement>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape" && !typing && !document.querySelector("[role=dialog][data-state=open]")) {
        useApp.getState().select(null, { fly: false });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchRef]);
}

export function applyFilters(list: Hydrant[], f: ReturnType<typeof useApp.getState>["filters"], now: number): Hydrant[] {
  return list.filter((h) => {
    if (!h.monitored && !f.includeUnmonitored) return false;
    if (!f.statuses.includes(h.status)) return false;
    if (f.obstructionTypes.length && (!h.obstructionType || !f.obstructionTypes.includes(h.obstructionType))) return false;
    if (f.riskLevels.length && !f.riskLevels.includes(h.riskLevel)) return false;
    if (f.updatedWithinMin !== null && now - lastUpdateAt(h, now) > f.updatedWithinMin * 60000) return false;
    return true;
  });
}

export function useFilteredHydrants(): Hydrant[] {
  const list = useHydrantList();
  const filters = useApp((s) => s.filters);
  // Coarse clock (1 min) so the map source isn't rebuilt on every 5 s tick.
  const minute = useApp((s) => Math.floor(s.now / 60000));
  return useMemo(() => applyFilters(list, filters, minute * 60000), [list, filters, minute]);
}

/** Toast each new alert once. CLEAR→BLOCKED gets the loud treatment. */
export function useAlertToasts() {
  const alerts = useApp((s) => s.alerts);
  const seen = useRef<Set<string>>(new Set());
  const primed = useRef(false);
  useEffect(() => {
    if (!primed.current) {
      alerts.forEach((a) => seen.current.add(a.id));
      primed.current = true;
      return;
    }
    for (const a of [...alerts].reverse()) {
      if (seen.current.has(a.id)) continue;
      seen.current.add(a.id);
      const action = {
        label: "View",
        onClick: () => {
          useApp.getState().select(a.hydrantId);
          window.dispatchEvent(new CustomEvent("hh:navigate", { detail: "/map" }));
        },
      };
      if (a.kind === "blocked") toast.error(a.title, { description: a.body, action, duration: 8000 });
      else if (a.kind === "warning" || a.kind === "offline" || a.kind === "report") toast.warning(a.title, { description: a.body, action });
      else toast.success(a.title, { description: a.body, action });
    }
  }, [alerts]);
}

export function useWebGL(): boolean {
  return useMemo(() => {
    try {
      const c = document.createElement("canvas");
      return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      return false;
    }
  }, []);
}
