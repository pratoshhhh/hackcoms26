import { Suspense, lazy, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useApp, useHydrantList } from "@/stores/appStore";
import { useBootstrap } from "@/components/layout/AppShell";
import { Logo } from "@/components/layout/ConsoleChrome";
import { Button } from "@/components/ui/primitives";
import { summary } from "@/services/analyticsService";
import { useWebGL } from "@/hooks";
import { duration } from "@/utils/format";

const LandingScene = lazy(() => import("@/components/three/LandingScene"));

const STEPS = [
  {
    title: "Detect",
    body: "An ESP32 with an ultrasonic sensor measures the space in front of each hydrant every 30 seconds. Repeat readings and a hysteresis gap ignore passing cars.",
  },
  {
    title: "Alert",
    body: "A confirmed block turns the hydrant red on the city map within seconds, opens an incident, and notifies subscribed crews and residents.",
  },
  {
    title: "Clear and verify",
    body: "A nearby volunteer claims the task and uploads before-and-after photos. The sensor has to agree before a reviewer approves the reward.",
  },
];

const STACK: [string, string, "Demo" | "Planned"][] = [
  ["MapLibre + OpenStreetMap", "Live map and real hydrant locations", "Demo"],
  ["React, Three.js, Recharts", "Console, digital twin, telemetry charts", "Demo"],
  ["ESP32 + HC-SR04", "On-hydrant obstruction sensing", "Planned"],
  ["RabbitMQ (MQTT)", "Device messaging", "Planned"],
  ["FastAPI on Vultr", "API and WebSocket events", "Planned"],
  ["TimescaleDB on Tiger Data", "Time-series storage and analytics", "Planned"],
  ["Gemini", "Before-and-after photo verification", "Planned"],
  ["Solana Devnet", "Volunteer bounty payouts", "Planned"],
];

function LiveNumbers() {
  const hydrants = useHydrantList();
  const incidents = useApp((s) => s.incidents);
  const now = useApp((s) => s.now);
  const ready = useApp((s) => s.loadState) === "ready";
  const s = useMemo(() => summary(hydrants, incidents, now), [hydrants, incidents, now]);
  const items = [
    { label: "Hydrants mapped", value: ready ? s.totalHydrants : "—" },
    { label: "Sensors reporting", value: ready ? s.monitored - s.offline : "—" },
    { label: "Blocked right now", value: ready ? s.blocked : "—" },
    { label: "Average time to clear", value: ready ? duration(s.avgClearMinutes * 60000) : "—" },
  ];
  return (
    <dl className="grid grid-cols-2 border-y border-line md:grid-cols-4">
      {items.map((i, idx) => (
        <div key={i.label} className={`py-6 ${idx % 2 === 1 ? "border-l border-line pl-6" : ""} ${idx === 2 ? "md:border-l md:border-line md:pl-6" : ""} ${idx > 1 ? "border-t border-line md:border-t-0" : ""}`}>
          <dt className="text-xs text-text-3">{i.label}</dt>
          <dd className="num mt-2 text-xl text-text-1">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function LandingPage() {
  useBootstrap();
  const webgl = useWebGL();

  return (
    <div className="h-full overflow-y-auto bg-bg">
      <main>
        {/* Full-bleed hero: the 3D city is the background, text sits on top. */}
        <section className="relative h-[100svh] min-h-[600px] overflow-hidden">
          <div className="absolute inset-0">
            {webgl && (
              <Suspense fallback={null}>
                <LandingScene />
              </Suspense>
            )}
          </div>

          <header className="pointer-events-none relative z-10 mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
            <Link to="/" className="pointer-events-auto flex items-center gap-2" aria-label="Hydrant Halo home">
              <Logo />
              <span className="text-base font-semibold tracking-tight">Hydrant Halo</span>
            </Link>
            <Button variant="primary" asChild className="pointer-events-auto">
              <Link to="/map">Open live map</Link>
            </Button>
          </header>

          {/* pointer-events-none so the scene stays visible; only real controls take clicks. */}
          <div className="pointer-events-none relative z-10 mx-auto flex h-[calc(100%-64px)] max-w-6xl flex-col justify-start px-6 pt-[10vh] lg:justify-center lg:pt-0 lg:pb-16">
            <div className="max-w-xl">
              <h1 className="text-balance text-[40px] font-semibold leading-[1.06] tracking-[-0.025em] text-text-1 sm:text-[56px]">
                See which fire hydrants are blocked right now.
              </h1>
              <p className="mt-5 max-w-md text-pretty text-md text-text-2">
                A small distance sensor sits on each hydrant. If something stays within 40&nbsp;cm of it for a few minutes, say a plow pile or a parked car, the hydrant turns red on the fire department&apos;s map. Someone nearby can take the job, clear it, and send a photo.
              </p>
              <div className="mt-8">
                <Button variant="primary" asChild className="pointer-events-auto h-11 px-5 text-base">
                  <Link to="/map">
                    Open live map <ArrowRight />
                  </Link>
                </Button>
              </div>
              <p className="mt-6 max-w-sm text-xs text-text-3">
                Real hydrant locations in Rochester, NY from OpenStreetMap. Sensor readings and incidents are simulated.
              </p>
            </div>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-8 px-6 py-16">
          <h2 className="text-lg font-semibold tracking-tight">How it works</h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-3 md:gap-0 md:divide-x md:divide-line">
            {STEPS.map((s, i) => (
              <li key={s.title} className="md:px-8 md:first:pl-0 md:last:pr-0">
                <span className="num text-xs text-text-3">0{i + 1}</span>
                <h3 className="mt-2 text-md font-medium">{s.title}</h3>
                <p className="mt-2 text-sm text-text-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-8">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Right now in the demo</h2>
            <Link to="/analytics" className="text-sm text-accent hover:underline">
              See analytics
            </Link>
          </div>
          <div className="mt-6">
            <LiveNumbers />
          </div>
        </section>

        <section id="stack" className="mx-auto grid max-w-6xl scroll-mt-8 gap-10 px-6 py-16 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Built on open components</h2>
            <p className="mt-3 max-w-sm text-sm text-text-2">
              Every service sits behind an interface, so the simulated pieces in this demo can be swapped for the real backend without touching the interface.
            </p>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line border-y border-line">
              {STACK.map(([name, role, state]) => (
                <tr key={name}>
                  <td className="py-3 pr-4 font-medium text-text-1">{name}</td>
                  <td className="py-3 pr-4 text-text-2">{role}</td>
                  <td className="py-3 text-right">
                    <span className={state === "Demo" ? "text-xs text-ok" : "text-xs text-text-3"}>{state === "Demo" ? "In this demo" : "Planned"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-20">
          <div className="flex flex-col items-start justify-between gap-6 rounded-xl border border-line bg-surface-1 p-8 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">See it on the map</h2>
              <p className="mt-1 text-sm text-text-2">Search a hydrant, simulate a snow bank, and watch the alert go out.</p>
            </div>
            <Button variant="primary" asChild className="h-10 px-4 text-base">
              <Link to="/map">
                Open live map <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-xs text-text-3">
          <span>Hydrant Halo · hackathon prototype</span>
          <span>Map data © OpenStreetMap contributors · Basemap © CARTO</span>
        </div>
      </footer>
    </div>
  );
}
