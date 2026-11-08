import { useNavigate } from "react-router-dom";
import { useApp } from "@/stores/appStore";
import type { AlertKind, HydrantStatus } from "@/types";
import { StatusIcon } from "@/components/hydrants/status";
import { ago } from "@/utils/format";
import { cn } from "@/lib/utils";

export const KIND_STATUS: Record<AlertKind, HydrantStatus> = {
  blocked: "blocked",
  warning: "warning",
  report: "warning",
  cleared: "clear",
  restored: "clear",
  offline: "offline",
};

export function NotificationList({ limit, compact }: { limit?: number; compact?: boolean }) {
  const alerts = useApp((s) => s.alerts);
  const now = useApp((s) => s.now);
  const select = useApp((s) => s.select);
  const navigate = useNavigate();
  const list = limit ? alerts.slice(0, limit) : alerts;

  if (!list.length)
    return <p className="px-4 py-6 text-sm text-text-2">No notifications yet. Open Demo controls and simulate an obstruction.</p>;

  return (
    <ul className={cn("divide-y divide-line", compact && "max-h-96 overflow-y-auto")}>
      {list.map((a) => (
        <li key={a.id}>
          <button
            onClick={() => {
              select(a.hydrantId);
              navigate("/map");
            }}
            className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2"
          >
            <StatusIcon status={KIND_STATUS[a.kind]} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className={cn("truncate text-sm", a.read ? "text-text-2" : "font-medium text-text-1")}>{a.title}</span>
                <span className="num shrink-0 text-2xs text-text-3">{ago(a.createdAt, now)}</span>
              </div>
              <p className="mt-0.5 text-xs text-text-2">{a.body}</p>
            </div>
            {!a.read && <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
          </button>
        </li>
      ))}
    </ul>
  );
}
