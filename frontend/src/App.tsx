import { Suspense, lazy } from "react";
import { Navigate, createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { TooltipProvider } from "@/components/ui/primitives";
import MapPage from "@/pages/MapPage";

const LandingPage = lazy(() => import("@/pages/LandingPage"));
const IncidentsPage = lazy(() => import("@/pages/IncidentsPage"));
const AnalyticsPage = lazy(() => import("@/pages/AnalyticsPage"));
const MaintenancePage = lazy(() => import("@/pages/MaintenancePage"));
const NotificationsPage = lazy(() => import("@/pages/NotificationsPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const DevicePage = lazy(() => import("@/pages/DevicePage"));

const page = (el: React.ReactNode) => <Suspense fallback={<div className="p-6 text-sm text-text-3">Loading…</div>}>{el}</Suspense>;

function RouteError() {
  return (
    <div className="grid h-full place-items-center bg-bg p-6">
      <div className="max-w-sm rounded-lg border border-line bg-surface-1 p-4 text-sm shadow-float">
        <p className="font-medium text-text-1">Something went wrong on this screen.</p>
        <p className="mt-1 text-text-2">Your subscriptions are saved. Reload to restore the live view.</p>
        <button className="mt-3 text-accent hover:underline" onClick={() => window.location.reload()}>
          Reload Fire Fighters
        </button>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-6 text-sm text-text-2">
      This page doesn't exist.{" "}
      <a className="text-accent hover:underline" href="/map">
        Open the live map
      </a>
      .
    </div>
  );
}

const router = createBrowserRouter([
  { path: "/", element: page(<LandingPage />), errorElement: <RouteError /> },
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { path: "/map", element: <MapPage /> },
      { path: "/overview", element: <Navigate to="/analytics" replace /> },
      { path: "/incidents", element: page(<IncidentsPage />) },
      { path: "/analytics", element: page(<AnalyticsPage />) },
      { path: "/maintenance", element: page(<MaintenancePage />) },
      { path: "/notifications", element: page(<NotificationsPage />) },
      { path: "/settings", element: page(<SettingsPage />) },
      { path: "/device", element: page(<DevicePage />) },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

export default function App() {
  return (
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>
  );
}
