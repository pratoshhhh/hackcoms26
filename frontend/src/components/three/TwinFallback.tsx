import type { HydrantStatus, ObstructionType } from "@/types";
import { STATUS_META } from "@/components/hydrants/status";

/** Static illustration for devices without WebGL. */
export function TwinFallback({ status, obstruction }: { status: HydrantStatus; obstruction: ObstructionType | null }) {
  const blocked = status === "blocked" || status === "warning";
  return (
    <div className="grid h-56 place-items-center rounded border border-line bg-surface-1">
      <svg viewBox="0 0 200 140" className="h-40" role="img" aria-label={`Hydrant illustration: ${STATUS_META[status].label}`}>
        <ellipse cx="100" cy="122" rx="60" ry="8" fill="rgb(var(--twin-ground))" />
        <ellipse cx="100" cy="122" rx="34" ry="5" fill="none" stroke={`rgb(var(--${status === "clear" ? "ok" : status === "warning" ? "warn" : status === "blocked" ? "crit" : "muted"}))`} strokeWidth="1.5" />
        <rect x="88" y="52" width="24" height="68" rx="4" fill="rgb(var(--twin-body))" />
        <rect x="80" y="74" width="40" height="10" rx="3" fill="rgb(var(--twin-body))" />
        <ellipse cx="100" cy="50" rx="14" ry="7" fill="rgb(var(--twin-cap))" />
        {blocked && (obstruction === "snow" || obstruction === "ice") && <ellipse cx="100" cy="116" rx="52" ry="20" fill="rgb(var(--twin-snow))" />}
        {blocked && obstruction === "vehicle" && <rect x="120" y="92" width="70" height="26" rx="5" fill="rgb(var(--twin-vehicle))" />}
        {blocked && (obstruction === "debris" || obstruction === "vegetation") && <rect x="104" y="100" width="30" height="20" fill="rgb(var(--twin-debris))" />}
      </svg>
      <span className="text-xs text-text-3">3D view unavailable on this device. Showing a static illustration.</span>
    </div>
  );
}
