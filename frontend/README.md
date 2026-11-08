# Hydrant Halo — Frontend

React + TypeScript + Vite console for monitoring fire-hydrant accessibility. It runs fully without a backend: hydrant **locations** are real OpenStreetMap data for Rochester, NY, and **telemetry, incidents, alerts and verification** are simulated and labelled as such.

## Run it

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
```

Requires Node 18+.

## Deploy to Vercel

The frontend is a static Vite build, so no server or environment variables are needed.

1. In Vercel, choose **Add New → Project** and import `pratoshhhh/hackcoms26`.
2. Set **Root Directory** to `frontend`. Everything else comes from `vercel.json` (Vite preset, `npm ci`, `npm run build`, output `dist`).
3. Deploy.

`vercel.json` rewrites every path to `index.html` so deep links such as `/map` or `/incidents` work on reload. Real files (`/assets/*`, `/data/*`, `/favicon.svg`) are served first. Hashed assets are cached for a year.

From the CLI instead: `npm i -g vercel`, then run `vercel` inside `frontend/` (and `vercel --prod` to promote).

## Routes

| Path | Screen |
|---|---|
| `/` | Landing page with a three.js hero |
| `/map` | Live map: search, filters, layers, hydrant panel, demo controls |
| `/incidents` | Active and resolved incidents |
| `/analytics` | KPIs, weekly trend, causes, top-10 risk, neighborhood heatmap, history table |
| `/maintenance` | Volunteer tasks: claim, QR, photos, verification, review, reward |
| `/notifications` | In-app alerts and the simulated email/SMS delivery log |
| `/settings` | Alert subscriptions, data source, integrations |

## 90-second judge path

1. Open `/` and select **Open live map**.
2. Press `/` and type `ROC-0001`, then press Enter. The map flies to the hydrant and the panel opens.
3. Select **Demo** (top right), then **Simulate snow obstruction**. The marker turns red, a toast appears, the badge ticks, the twin grows a snow bank, and the chart jumps to 1H.
4. Select **Subscribe to alerts** and save an email address. Matching events appear in **Notifications › Delivery log** as "Simulated — not sent".
5. Open **Tasks**, choose the new task, and work through it: **Claim task** → **Scan QR code** → **Use sample** ×2 → **Simulate clearing obstruction** → **Submit evidence** → **Approve payout**. The hydrant returns to green and its history updates.

## Architecture

```
src/
  components/  layout · map · hydrants · charts · three · notifications · ai · maintenance · ui
  pages/       one file per route
  services/    hydrantService · telemetryService · notificationService · geminiService · analyticsService · maintenanceService
  stores/      appStore.ts (Zustand). Every component reads the same state; demo events use the same actions a WebSocket would.
  types/       Hydrant, SensorReading, Incident, Alert, NotificationSubscription, MaintenanceTask, VerificationResult, AnalyticsSummary
  data/        Rochester neighborhoods and street centrelines (approximate)
  styles/      tokens.css is the only place color values live
```

Each service is a mock behind an interface. Swap it for the backend client described in `docs/ARCHITECTURE.md` without touching components.

### Hydrant data loading
Stale-while-revalidate: browser cache → bundled OSM snapshot (`public/data/osm-rochester-hydrants.json`, ODbL) render instantly, while a live Overpass query (mirror rotation, timeout, backoff) refreshes the cache in the background. If both cache and snapshot fail, 64 seeded demo hydrants are used and clearly labelled.

## Design
See [`DESIGN.md`](DESIGN.md): light theme, Geist type, bottom dock, status never shown by color alone, one orchestrated motion moment, honest labelling.

## Attribution
Map data © OpenStreetMap contributors (ODbL). Basemap © CARTO. Imagery © Esri. 3D buildings © OpenFreeMap.
