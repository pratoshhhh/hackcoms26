import { forwardRef } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import { Bell, ChartColumn, FlaskConical, Info, Map, Settings, Siren, Sparkles, UserRound, Wrench } from "lucide-react";
import { useActiveIncidents, useApp, useHydrantList, useSelected, useUnread } from "@/stores/appStore";
import { Button, Tip } from "@/components/ui/primitives";
import { SearchBox } from "./SearchBox";
import { NotificationList } from "@/components/notifications/NotificationList";
import { clearHydrantCache } from "@/services/hydrantService";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6", className)} aria-hidden>
      <circle cx="12" cy="12" r="10.25" fill="none" stroke="rgb(var(--text-1))" strokeWidth="1.5" />
      <rect x="9.75" y="6.5" width="4.5" height="11" rx="1" fill="rgb(var(--crit))" />
      <rect x="7.5" y="10" width="9" height="2.5" rx="0.75" fill="rgb(var(--crit))" />
    </svg>
  );
}

/** Top-left: brand + search. One floating card. */
export const TopLeft = forwardRef<HTMLInputElement>(function TopLeft(_, ref) {
  return (
    <div className="float pointer-events-auto flex h-11 w-full max-w-[440px] items-center gap-2 rounded-lg pl-2 pr-1">
      <Link to="/" className="flex shrink-0 items-center gap-2 rounded px-1 py-1 hover:bg-surface-2" aria-label="Hydrant Halo home">
        <Logo className="size-5" />
        <span className="hidden text-sm font-semibold tracking-tight sm:inline">Hydrant Halo</span>
      </Link>
      <span className="h-5 w-px bg-line" aria-hidden />
      <SearchBox ref={ref} className="min-w-0 flex-1" />
    </div>
  );
});

function StatusPill() {
  const blocked = useActiveIncidents().filter((i) => i.kind === "obstruction" && i.severity === "critical").length;
  const hydrants = useHydrantList();
  const monitored = hydrants.filter((h) => h.monitored).length;
  const offline = hydrants.filter((h) => h.monitored && h.status === "offline").length;
  const online = useApp((s) => s.online);
  return (
    <Tip content={online ? `${blocked} confirmed blockages · ${monitored - offline} of ${monitored} sensors reporting` : "Browser offline. Showing last known state."}>
      <Link to="/incidents" className="flex h-8 items-center gap-2 rounded px-2 text-xs hover:bg-surface-2">
        <span className={cn("size-2 rounded-full", blocked ? "bg-crit" : "bg-ok")} aria-hidden />
        <span className="num font-medium">{blocked}</span>
        <span className="text-text-2">blocked</span>
        <span className="hidden text-text-3 lg:inline">·</span>
        <span className="num hidden text-text-3 lg:inline">
          {monitored - offline}/{monitored} online
        </span>
      </Link>
    </Tip>
  );
}

function BellMenu() {
  const unread = useUnread();
  const markRead = useApp((s) => s.markAlertsRead);
  return (
    <Popover.Root onOpenChange={(o) => !o && markRead()}>
      <Tip content="Notifications">
        <Popover.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Notifications, ${unread} unread`} className="relative">
            <Bell />
            {unread > 0 && (
              <span key={unread} className="num absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-crit px-1 text-2xs font-medium text-surface-1 animate-in zoom-in-50 duration-200">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Button>
        </Popover.Trigger>
      </Tip>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="z-50 w-[360px] max-w-[calc(100vw-16px)] overflow-hidden rounded-lg border border-line bg-surface-1 shadow-float data-[state=open]:animate-in data-[state=open]:fade-in-0">
          <div className="flex items-center justify-between border-b border-line px-4 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            <Popover.Close asChild>
              <Link to="/notifications" className="text-xs text-accent hover:underline">
                View all
              </Link>
            </Popover.Close>
          </div>
          <NotificationList limit={6} compact />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function AccountMenu() {
  const navigate = useNavigate();
  const init = useApp((s) => s.init);
  const item = "flex h-8 cursor-pointer items-center rounded px-2 text-sm text-text-1 outline-none data-[highlighted]:bg-surface-2";
  return (
    <DropdownMenu.Root>
      <Tip content="Account">
        <DropdownMenu.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label="Account menu">
            <UserRound />
          </Button>
        </DropdownMenu.Trigger>
      </Tip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="z-50 w-60 rounded-lg border border-line bg-surface-1 p-1 shadow-float">
          <div className="px-2 py-2">
            <div className="text-sm text-text-1">Duty officer</div>
            <div className="text-xs text-text-3">Demo account · Rochester, NY</div>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item className={item} onSelect={() => navigate("/settings#subscriptions")}>
            Alert subscriptions
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={() => navigate("/notifications")}>
            Delivery log
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item className={item} onSelect={() => void init()}>
            Reset demo state
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={item}
            onSelect={() => {
              clearHydrantCache();
              void init(true);
            }}
          >
            Reload hydrants from OpenStreetMap
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item className={item} onSelect={() => navigate("/")}>
            About Hydrant Halo
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Top-right: status, demo, copilot, notifications, account. */
export function TopRight() {
  const toggle = useApp((s) => s.toggle);
  const demoOpen = useApp((s) => s.demoPanelOpen);
  return (
    <div className="float pointer-events-auto flex h-11 items-center gap-1 rounded-lg px-1">
      <StatusPill />
      <span className="h-5 w-px bg-line" aria-hidden />
      <Tip content="Trigger simulated sensor events">
        <Button variant="ghost" size="sm" className={cn("h-8", demoOpen && "bg-surface-3 text-text-1")} onClick={() => toggle("demoPanelOpen")} aria-pressed={demoOpen}>
          <FlaskConical />
          <span className="hidden md:inline">Demo</span>
        </Button>
      </Tip>
      <Tip content="Incident copilot (simulated)">
        <Button variant="ghost" size="icon" onClick={() => toggle("copilotOpen")} aria-label="Open incident copilot">
          <Sparkles />
        </Button>
      </Tip>
      <BellMenu />
      <AccountMenu />
    </div>
  );
}

const DOCK = [
  { to: "/map", label: "Map", icon: Map },
  { to: "/incidents", label: "Incidents", icon: Siren, badge: true },
  { to: "/analytics", label: "Analytics", icon: ChartColumn },
  { to: "/maintenance", label: "Tasks", icon: Wrench },
  { to: "/settings", label: "Settings", icon: Settings },
];

/** Bottom navigation dock — five destinations, floats so the map keeps the full viewport. */
export function BottomDock() {
  const active = useActiveIncidents().filter((i) => i.kind === "obstruction").length;
  const panelOpen = useSelected() !== null;
  return (
    <nav
      aria-label="Primary"
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-3 z-30 flex justify-center px-3 transition-[padding] duration-200 ease-std",
        panelOpen && "md:pr-[452px]",
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="float pointer-events-auto flex items-center gap-1 rounded-xl p-1">
        <ul className="flex items-center gap-1">
          {DOCK.map((d) => (
            <li key={d.to}>
              <NavLink
                to={d.to}
                className={({ isActive }) =>
                  cn(
                    "relative flex h-11 min-w-14 flex-col items-center justify-center gap-0.5 rounded-lg px-3 text-2xs transition-colors duration-150",
                    isActive ? "bg-surface-3 text-text-1" : "text-text-2 hover:bg-surface-2 hover:text-text-1",
                  )
                }
              >
                <d.icon className="size-4" strokeWidth={1.5} />
                {d.label}
                {d.badge && active > 0 && (
                  <span className="num absolute -right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-crit px-1 text-2xs font-medium text-surface-1">{active}</span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden />
        <Tip content="Statuses, telemetry and incidents are simulated. Hydrant locations come from OpenStreetMap." side="top">
          <span tabIndex={0} className="hidden h-11 items-center gap-1 rounded-lg px-2 text-2xs text-text-3 sm:flex">
            <Info className="size-3.5" strokeWidth={1.5} />
            Simulated data
          </span>
        </Tip>
      </div>
    </nav>
  );
}
