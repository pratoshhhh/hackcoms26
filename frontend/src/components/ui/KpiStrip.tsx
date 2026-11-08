import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Kpi {
  label: string;
  value: ReactNode;
  unit?: string;
  context?: ReactNode;
  tone?: "crit" | "warn" | "ok";
}

/** Single bordered strip divided by vertical rules (DESIGN.md §5), not floating hero cards. */
export function KpiStrip({ items, className }: { items: Kpi[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-surface-1 sm:grid-cols-3 lg:flex lg:divide-x lg:divide-line", className)}>
      {items.map((k) => (
        <div key={k.label} className="min-w-0 flex-1 border-b border-r border-line px-4 py-3 lg:border-0">
          <dt className="truncate text-xs text-text-2">{k.label}</dt>
          <dd className="mt-1">
            <span className={cn("num text-xl", k.tone === "crit" ? "text-crit" : k.tone === "warn" ? "text-warn" : "text-text-1")}>{k.value}</span>
            {k.unit && <span className="num ml-1 text-xs text-text-3">{k.unit}</span>}
          </dd>
          {k.context && <dd className="mt-1 truncate text-xs text-text-3">{k.context}</dd>}
        </div>
      ))}
    </dl>
  );
}
