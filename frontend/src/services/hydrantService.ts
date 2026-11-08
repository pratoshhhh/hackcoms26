/**
 * hydrantService — loads hydrant *locations* and enriches them with simulated monitoring state.
 *
 * Location fallback chain (each step is labelled in the UI):
 *   1. localStorage cache of a previous Overpass response (7-day TTL)
 *   2. Live Overpass API (rotating mirrors, timeout + backoff)
 *   3. Bundled OSM snapshot at /data/osm-rochester-hydrants.json
 *   4. Seeded demo hydrants (clearly labelled, not real locations)
 *
 * Telemetry/status is ALWAYS simulated in this build. Replace `enrich()` with the
 * backend's GET /api/v1/hydrants when it's live.
 */
import { NEIGHBORHOODS, ROCHESTER_BBOX, STREETS } from "@/data/rochester";
import type { Hydrant, HydrantStatus, Incident, LocationSource, ObstructionType, RiskLevel } from "@/types";
import { distanceM, distanceToSegmentM } from "@/utils/geo";
import { hash, rng, weighted } from "@/utils/random";
import { pickDetail } from "@/data/obstructions";

interface RawAddress {
  houseNumber?: string | null;
  road?: string | null;
  neighbourhood?: string | null;
  city?: string | null;
  postcode?: string | null;
  /** Distance from the hydrant to the geocoded building, metres. */
  matchDistanceM?: number;
}

interface RawHydrant {
  osmId?: number;
  lat: number;
  lng: number;
  tags?: Record<string, string>;
  addr?: RawAddress;
}

export interface HydrantLoadResult {
  hydrants: Hydrant[];
  incidents: Incident[];
  source: LocationSource;
  fetchedAt: number;
  /** Human-readable problem encountered on the way, if any. */
  warning?: string;
}

const CACHE_KEY = "hh:osm-hydrants:v2";
const CACHE_TTL = 7 * 24 * 3600 * 1000;
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

function overpassQuery(): string {
  const [s, w, n, e] = ROCHESTER_BBOX;
  return `[out:json][timeout:25];node["emergency"="fire_hydrant"](${s},${w},${n},${e});out body;`;
}

type OverpassElement = { id: number; lat: number; lon: number; tags?: Record<string, string>; addr?: RawAddress };

function parseOverpass(json: { elements?: OverpassElement[] }): RawHydrant[] {
  return (json.elements ?? [])
    .filter((e) => typeof e.lat === "number" && typeof e.lon === "number")
    .map((e) => {
      const t = e.tags ?? {};
      // Snapshot carries Nominatim results; a few OSM hydrants carry their own addr:* tags.
      const addr: RawAddress | undefined =
        e.addr ?? (t["addr:street"] ? { houseNumber: t["addr:housenumber"], road: t["addr:street"], postcode: t["addr:postcode"], city: t["addr:city"], matchDistanceM: 0 } : undefined);
      return { osmId: e.id, lat: e.lat, lng: e.lon, tags: e.tags, addr };
    });
}

/** Attach geocoded addresses from the bundled snapshot to cached/live Overpass data (matched by OSM id). */
async function attachAddresses(raw: RawHydrant[]): Promise<RawHydrant[]> {
  if (raw.every((r) => r.addr)) return raw;
  try {
    const snap = await loadSnapshot();
    const byId = new Map(snap.filter((s) => s.osmId && s.addr).map((s) => [s.osmId!, s.addr!]));
    return raw.map((r) => (r.addr || !r.osmId ? r : { ...r, addr: byId.get(r.osmId) }));
  } catch {
    return raw;
  }
}

function readCache(): { raw: RawHydrant[]; at: number } | null {
  try {
    const v = localStorage.getItem(CACHE_KEY);
    if (!v) return null;
    const parsed = JSON.parse(v) as { raw: RawHydrant[]; at: number };
    if (Date.now() - parsed.at > CACHE_TTL || !parsed.raw?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(raw: RawHydrant[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ raw, at: Date.now() }));
  } catch {
    /* storage full / blocked — non-fatal */
  }
}

export function clearHydrantCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

async function fetchOverpass(signal?: AbortSignal): Promise<RawHydrant[]> {
  const body = new URLSearchParams({ data: overpassQuery() });
  let lastErr = "unknown error";
  for (let i = 0; i < OVERPASS_ENDPOINTS.length; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    signal?.addEventListener("abort", () => ctrl.abort());
    try {
      const res = await fetch(OVERPASS_ENDPOINTS[i], { method: "POST", body, signal: ctrl.signal });
      if (res.status === 429 || res.status === 504 || res.status === 502) {
        lastErr = res.status === 429 ? "rate-limited" : "server at capacity";
        await new Promise((r) => setTimeout(r, 500 * 2 ** i));
        continue;
      }
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`;
        continue;
      }
      const raw = parseOverpass(await res.json());
      if (raw.length) return raw;
      lastErr = "no hydrants returned";
    } catch (e) {
      lastErr = (e as Error).name === "AbortError" ? "timed out" : "network error";
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(lastErr);
}

async function loadSnapshot(): Promise<RawHydrant[]> {
  const res = await fetch("/data/osm-rochester-hydrants.json");
  if (!res.ok) throw new Error("snapshot missing");
  return parseOverpass(await res.json());
}

/** 64 seeded hydrants scattered along known streets — used only when OSM is unavailable. */
function seededRaw(): RawHydrant[] {
  const r = rng(424242);
  const out: RawHydrant[] = [];
  for (let i = 0; i < 64; i++) {
    const st = STREETS[i % STREETS.length];
    const [a, b] = st.path;
    const t = r();
    out.push({
      lat: a[1] + (b[1] - a[1]) * t + (r() - 0.5) * 0.0012,
      lng: a[0] + (b[0] - a[0]) * t + (r() - 0.5) * 0.0012,
    });
  }
  return out;
}

let revalidating = false;
/** Refresh the cache from Overpass in the background so the *next* load uses live data. */
function revalidateInBackground() {
  if (revalidating) return;
  revalidating = true;
  fetchOverpass()
    .then(writeCache)
    .catch(() => undefined)
    .finally(() => (revalidating = false));
}

/**
 * Stale-while-revalidate: cache or bundled snapshot render instantly (public Overpass
 * can take 20–45 s or refuse when saturated); a live query refreshes the cache behind it.
 * `forceRefresh` waits for a live query.
 */
export async function loadHydrants(opts: { forceRefresh?: boolean; signal?: AbortSignal } = {}): Promise<HydrantLoadResult> {
  const now = Date.now();
  if (!opts.forceRefresh) {
    const cached = readCache();
    if (cached) return { ...enrich(await attachAddresses(cached.raw), "osm-cache", now), fetchedAt: cached.at };
    try {
      const raw = await loadSnapshot();
      revalidateInBackground();
      return { ...enrich(raw, "osm-snapshot", now), fetchedAt: now };
    } catch {
      /* fall through to a live query */
    }
  }
  let warning: string | undefined;
  try {
    const raw = await fetchOverpass(opts.signal);
    writeCache(raw);
    return { ...enrich(await attachAddresses(raw), "osm-live", now), fetchedAt: now };
  } catch (e) {
    warning = `Couldn't reach OpenStreetMap (${(e as Error).message}).`;
  }
  try {
    const raw = await loadSnapshot();
    return { ...enrich(raw, "osm-snapshot", now), fetchedAt: now, warning: `${warning} Using bundled OSM snapshot.` };
  } catch {
    const raw = seededRaw();
    return {
      ...enrich(raw, "seeded", now),
      fetchedAt: now,
      warning: `${warning} Showing ${raw.length} seeded demo hydrants.`,
    };
  }
}

// ---------------------------------------------------------------------------
// Enrichment: deterministic simulated monitoring state + seeded incident history
// ---------------------------------------------------------------------------

const OBSTRUCTIONS: readonly (readonly [ObstructionType, number])[] = [
  ["snow", 5],
  ["vehicle", 4],
  ["debris", 2],
  ["vegetation", 1],
  ["ice", 1],
];

function nearestNeighborhood(lat: number, lng: number) {
  let best = NEIGHBORHOODS[0];
  let bestD = Infinity;
  for (const n of NEIGHBORHOODS) {
    const d = distanceM(lat, lng, n.center[1], n.center[0]);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

function nearestStreet(lat: number, lng: number): string {
  let best = "";
  let bestD = Infinity;
  for (const s of STREETS) {
    for (let i = 0; i < s.path.length - 1; i++) {
      const d = distanceToSegmentM(lat, lng, s.path[i], s.path[i + 1]);
      if (d < bestD) {
        bestD = d;
        best = s.name;
      }
    }
  }
  return bestD < 900 ? `Near ${best}` : "Residential street";
}

const SUFFIX: Record<string, string> = {
  Avenue: "Ave", Street: "St", Road: "Rd", Boulevard: "Blvd", Drive: "Dr", Place: "Pl", Parkway: "Pkwy",
  Terrace: "Ter", Lane: "Ln", Court: "Ct", Circle: "Cir", Highway: "Hwy", Square: "Sq",
};
const abbreviate = (road: string) => road.replace(/(Avenue|Street|Road|Boulevard|Drive|Place|Parkway|Terrace|Lane|Court|Circle|Highway|Square)/g, (m) => SUFFIX[m]).replace(/^North /, "N ").replace(/^South /, "S ").replace(/^East /, "E ").replace(/^West /, "W ");

function formatAddress(a: RawAddress | undefined): { address: string | null; road: string | null; precision: Hydrant["addressPrecision"] } {
  if (!a?.road) return { address: null, road: null, precision: "approximate" };
  const road = abbreviate(a.road);
  const city = (a.city ?? "Rochester").replace(/^(City|Town|Village) of /, "");
  const line = `${a.houseNumber ? `${a.houseNumber} ` : ""}${road}, ${city}, NY${a.postcode ? ` ${a.postcode}` : ""}`;
  return { address: line, road, precision: (a.matchDistanceM ?? 99) <= 35 && a.houseNumber ? "front" : "near" };
}

export function riskLevelOf(score: number): RiskLevel {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "moderate";
  return "low";
}

export function computeRisk(h: Pick<Hydrant, "id" | "status" | "monitored" | "seed">, incidents: Incident[], now: number): number {
  const mine = incidents.filter((i) => i.hydrantId === h.id && i.kind === "obstruction");
  const last30 = mine.filter((i) => now - i.startedAt < 30 * 86400000).length;
  const resolved = mine.filter((i) => i.resolvedAt);
  const avgH = resolved.length
    ? resolved.reduce((s, i) => s + (i.resolvedAt! - i.startedAt), 0) / resolved.length / 3600000
    : 0;
  const statusBonus = h.status === "blocked" ? 25 : h.status === "warning" ? 12 : 0;
  const base = (h.seed % 100) / 10; // stable site factor (street parking density, plow route, etc.)
  return Math.round(Math.min(100, last30 * 14 + mine.length * 3 + Math.min(avgH, 12) * 2.5 + statusBonus + base));
}

function enrich(raw: RawHydrant[], source: LocationSource, now: number): { hydrants: Hydrant[]; incidents: Incident[]; source: LocationSource } {
  // Stable ordering → stable IDs.
  const sorted = [...raw].sort((a, b) => (a.osmId ?? 0) - (b.osmId ?? 0) || a.lat - b.lat || a.lng - b.lng);
  const anchor = Math.floor(now / 3600000) * 3600000; // anchor seeded history to the hour
  const hydrants: Hydrant[] = [];
  const incidents: Incident[] = [];

  sorted.forEach((rh, idx) => {
    const id = source === "seeded" ? `DEMO-${String(idx + 1).padStart(3, "0")}` : `ROC-${String(idx + 1).padStart(4, "0")}`;
    const seed = hash(rh.osmId ?? id, rh.lat.toFixed(5), rh.lng.toFixed(5));
    const r = rng(seed);
    const nb = nearestNeighborhood(rh.lat, rh.lng);
    const addr = formatAddress(rh.addr);
    const monitored = r() < 0.88;
    const status: HydrantStatus = !monitored
      ? "offline"
      : weighted(r, [
          ["clear", 80],
          ["warning", 8],
          ["blocked", 7],
          ["offline", 5],
        ] as const);
    const obstructionType = status === "blocked" || status === "warning" ? weighted(r, OBSTRUCTIONS) : null;
    const statusSince =
      status === "clear" ? anchor - Math.floor(r() * 9 * 86400000) : anchor - Math.floor((0.3 + r() * 5) * 3600000);

    // Seeded resolved incident history over the past 60 days.
    const propensity = r();
    const histCount = monitored ? Math.floor(propensity * propensity * 6) : 0;
    for (let k = 0; k < histCount; k++) {
      const startedAt = anchor - Math.floor((1 + r() * 59) * 86400000) - Math.floor(r() * 86400000);
      const durMin = 15 + Math.floor(r() * r() * 720);
      const ot = weighted(r, OBSTRUCTIONS);
      const detail = pickDetail(ot, id, k);
      incidents.push({
        detail,
        id: `INC-${id}-${k}`,
        hydrantId: id,
        kind: "obstruction",
        obstructionType: ot,
        severity: "critical",
        status: "resolved",
        startedAt,
        resolvedAt: startedAt + durMin * 60000,
        origin: "seeded",
      });
    }
    if (status === "blocked" || status === "warning") {
      incidents.push({
        id: `INC-${id}-open`,
        hydrantId: id,
        kind: "obstruction",
        obstructionType,
        severity: status === "blocked" ? "critical" : "warning",
        status: "active",
        startedAt: statusSince,
        origin: "seeded",
        detail: obstructionType ? pickDetail(obstructionType, id, "open") : undefined,
      });
    } else if (status === "offline" && monitored) {
      incidents.push({
        id: `INC-${id}-dev`,
        hydrantId: id,
        kind: "device",
        obstructionType: null,
        severity: "warning",
        status: "active",
        startedAt: statusSince,
        origin: "seeded",
      });
    }

    const h: Hydrant = {
      id,
      osmId: rh.osmId,
      locationSource: source,
      lat: rh.lat,
      lng: rh.lng,
      street: addr.road ?? nearestStreet(rh.lat, rh.lng),
      address: addr.address,
      addressPrecision: addr.precision,
      neighborhood: rh.addr?.neighbourhood ?? nb.name,
      city: rh.addr?.city ? `${rh.addr.city.replace(/^(City|Town|Village) of /, "")}, NY` : nb.city,
      monitored,
      status,
      obstructionType,
      obstructionDetail: obstructionType ? pickDetail(obstructionType, id, "open") : null,
      statusSince,
      lastInspection: anchor - Math.floor((10 + r() * 170) * 86400000),
      uptimePct: monitored ? Math.round((96 + r() * 3.9) * 10) / 10 : 0,
      reportIntervalS: 30,
      riskScore: 0,
      riskLevel: "low",
      osmTags: rh.tags,
      seed,
    };
    hydrants.push(h);
  });

  for (const h of hydrants) {
    h.riskScore = computeRisk(h, incidents, now);
    h.riskLevel = riskLevelOf(h.riskScore);
  }
  return { hydrants, incidents, source };
}
