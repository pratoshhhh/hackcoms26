import { Suspense, lazy, useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Toaster } from "sonner";
import { CloudOff } from "lucide-react";
import { BottomDock, TopLeft, TopRight } from "./ConsoleChrome";
import { DemoControlPanel } from "./DemoControlPanel";
import { SubscribeDialog } from "@/components/notifications/SubscribeDialog";
import { useAlertToasts, useGlobalShortcuts, useOnlineStatus, useTicker } from "@/hooks";
import { useApp } from "@/stores/appStore";
import { cn } from "@/lib/utils";

const HydrantIntelligence = lazy(() => import("@/components/ai/HydrantIntelligence"));

/** Kicks off data loading; shared by the landing page and the console. */
export function useBootstrap() {
  const init = useApp((s) => s.init);
  const loadState = useApp((s) => s.loadState);
  useEffect(() => {
    if (loadState === "idle") void init();
  }, [loadState, init]);
}

export function AppShell() {
  const searchRef = useRef<HTMLInputElement>(null);
  const online = useApp((s) => s.online);
  const copilotOpen = useApp((s) => s.copilotOpen);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isMap = pathname === "/map";

  useBootstrap();
  useTicker();
  useOnlineStatus();
  useGlobalShortcuts(searchRef);
  useAlertToasts();

  useEffect(() => {
    const go = (e: Event) => navigate((e as CustomEvent<string>).detail);
    window.addEventListener("hh:navigate", go);
    return () => window.removeEventListener("hh:navigate", go);
  }, [navigate]);

  return (
    <div className="relative h-full overflow-hidden bg-bg">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface-1 focus:px-3 focus:py-2">
        Skip to content
      </a>

      <main id="main" className={cn("absolute inset-0", !isMap && "overflow-y-auto pb-24 pt-16")}>
        <Outlet />
      </main>

      {/* Floating chrome. Pointer events pass through to the map except on the cards themselves. */}
      <header className={cn("pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-3", !isMap && "bg-bg/80 backdrop-blur-sm")}>
        <TopLeft ref={searchRef} />
        <TopRight />
      </header>

      {!online && (
        <div role="status" className="float absolute left-1/2 top-16 z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg px-3 py-2 text-xs text-warn">
          <CloudOff className="size-3.5" strokeWidth={1.75} />
          You're offline. Map tiles may not load; simulated data keeps working.
        </div>
      )}

      <BottomDock />
      <DemoControlPanel />
      <SubscribeDialog />
      {copilotOpen && (
        <Suspense fallback={null}>
          <HydrantIntelligence />
        </Suspense>
      )}
      <Toaster
        theme="light"
        position="top-center"
        offset={68}
        toastOptions={{
          classNames: {
            toast: "!bg-surface-1 !border !border-line !text-text-1 !rounded-lg !font-sans !shadow-float",
            description: "!text-text-2",
            error: "!border-l-2 !border-l-crit",
            warning: "!border-l-2 !border-l-warn",
            success: "!border-l-2 !border-l-ok",
            actionButton: "!bg-text-1 !text-surface-1",
          },
        }}
      />
    </div>
  );
}
