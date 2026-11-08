import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { useApp } from "@/stores/appStore";
import { Button, PageHeader } from "@/components/ui/primitives";
import { ALERT_KIND_LABELS, maskContact } from "@/services/notificationService";
import { clearHydrantCache } from "@/services/hydrantService";
import { fmtDateTime } from "@/utils/format";
import { useReducedMotion } from "@/hooks";

function Block({ id, title, description, children }: { id?: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="grid gap-4 border-b border-line px-6 py-6 lg:grid-cols-[260px_1fr]">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-1 text-xs text-text-3">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

const INTEGRATIONS: [string, string, boolean][] = [
  ["Hydrant Halo API (Vultr)", "REST + WebSocket for live telemetry", false],
  ["Tiger Data", "Time-series readings, incidents, analytics", false],
  ["Gemini", "Photo verification and Hydrant Intelligence", false],
  ["Twilio", "SMS alerts", true],
  ["Resend", "Email delivery", false],
];

export default function SettingsPage() {
  const subs = useApp((s) => s.subscriptions);
  const remove = useApp((s) => s.removeSubscription);
  const set = useApp((s) => s.set);
  const hydrants = useApp((s) => s.hydrants);
  const source = useApp((s) => s.locationSource);
  const fetchedAt = useApp((s) => s.fetchedAt);
  const count = useApp((s) => s.hydrantIds.length);
  const init = useApp((s) => s.init);
  const reduced = useReducedMotion();
  const location = useLocation();

  useEffect(() => {
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
  }, [location.hash]);

  const sourceLabel =
    source === "osm-live" ? "OpenStreetMap, live Overpass query" : source === "osm-cache" ? "OpenStreetMap, cached in this browser" : source === "osm-snapshot" ? "OpenStreetMap, bundled snapshot" : source === "seeded" ? "Seeded demo locations" : "Loading…";

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader title="Settings" />
      <Block id="subscriptions" title="Alert subscriptions" description="Stored in this browser (localStorage). Delivery is simulated until the backend is connected.">
        {subs.length === 0 ? (
          <p className="text-sm text-text-2">No subscriptions. Add one for a neighborhood here, or open any hydrant and choose Subscribe to alerts.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface-1">
            {subs.map((s) => (
              <li key={s.id} className="flex items-start gap-4 px-4 py-3">
                <div className="min-w-0 flex-1 text-sm">
                  <div className="text-text-1">
                    {s.scope.type === "hydrant" ? (
                      <>
                        Hydrant <span className="num">{s.scope.hydrantId}</span>
                        <span className="text-text-3"> · {hydrants[s.scope.hydrantId]?.street}</span>
                      </>
                    ) : (
                      <>{s.scope.neighborhood} (all hydrants)</>
                    )}
                  </div>
                  <div className="num mt-1 text-xs text-text-2">
                    {[s.email && `Email ${maskContact(s.email)}`, s.phone && `SMS ${maskContact(s.phone)}`].filter(Boolean).join(" · ")}
                  </div>
                  <div className="mt-1 text-xs text-text-3">{s.events.map((e) => ALERT_KIND_LABELS[e]).join(", ")}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => remove(s.id)} aria-label="Delete subscription">
                  <Trash2 /> Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button className="mt-3" variant="primary" onClick={() => set("subscribeFor", "area")}>
          Add neighborhood subscription
        </Button>
      </Block>

      <Block title="Hydrant data" description="Locations come from OpenStreetMap (emergency=fire_hydrant). Status and telemetry are simulated.">
        <dl className="max-w-lg space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-text-2">Source</dt>
            <dd>{sourceLabel}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-2">Hydrants</dt>
            <dd className="num">{count}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-2">Retrieved</dt>
            <dd className="num">{fetchedAt ? fmtDateTime(fetchedAt) : "—"}</dd>
          </div>
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            onClick={() => {
              clearHydrantCache();
              void init(true);
            }}
          >
            Reload from OpenStreetMap
          </Button>
          <Button variant="ghost" onClick={() => void init()}>
            Reset demo state
          </Button>
        </div>
        <p className="mt-3 text-2xs text-text-3">
          Map data © OpenStreetMap contributors (ODbL). Basemap © CARTO. Imagery © Esri. 3D buildings © OpenFreeMap.
        </p>
      </Block>

      <Block title="Display">
        <div className="flex max-w-lg items-center justify-between gap-4 py-1 text-sm">
          <span>
            Reduced motion
            <span className="block text-xs text-text-3">Follows your operating system setting</span>
          </span>
          <span className="text-text-2">{reduced ? "On" : "Off"}</span>
        </div>
      </Block>

      <Block title="Integrations" description="Each one is behind a service interface in src/services and can be swapped without touching components.">
        <ul className="max-w-2xl divide-y divide-line rounded-lg border border-line bg-surface-1">
          {INTEGRATIONS.map(([name, role, live]) => (
            <li key={name} className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
              <span>
                {name}
                <span className="block text-xs text-text-3">{role}</span>
              </span>
              <span className="inline-flex items-center gap-2 text-xs text-text-2">
                <span className={live ? "size-2 rounded-full bg-ok" : "size-2 rounded-full border border-muted"} aria-hidden />
                {live ? "Connected" : "Not connected · mock"}
              </span>
            </li>
          ))}
        </ul>
      </Block>
    </div>
  );
}
