import { useEffect, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type MapLayerMouseEvent } from "maplibre-gl";
import { useApp } from "@/stores/appStore";
import { useFilteredHydrants, useMediaQuery, useReducedMotion } from "@/hooks";
import { ROCHESTER_CENTER, ROCHESTER_ZOOM } from "@/data/rochester";
import { token } from "@/lib/utils";
import type { Hydrant } from "@/types";
import { HoverCard } from "./HoverCard";

const BASEMAP = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const SATELLITE_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const BUILDINGS_TILEJSON = "https://tiles.openfreemap.org/planet";
const FONT = ["Montserrat SemiBold", "Open Sans Bold", "Noto Sans Regular"];
export const PANEL_WIDTH = 440;
/** Space the floating panel occupies from the right edge (width + gutters). */
export const PANEL_OFFSET = PANEL_WIDTH + 24;

function toGeoJSON(list: Hydrant[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: list.map((h) => ({
      type: "Feature",
      id: h.id,
      geometry: { type: "Point", coordinates: [h.lng, h.lat] },
      properties: { id: h.id, status: h.status, monitored: h.monitored, risk: h.riskScore },
    })),
  };
}

export function HydrantMap() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const fitted = useRef(false);

  const hydrants = useFilteredHydrants();
  const selectedId = useApp((s) => s.selectedId);
  const focus = useApp((s) => s.focus);
  const heatmap = useApp((s) => s.heatmap);
  const satellite = useApp((s) => s.satellite);
  const buildings3d = useApp((s) => s.buildings3d);
  const reduced = useReducedMotion();
  const wide = useMediaQuery("(min-width: 768px)");

  // ---- create map once ----
  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: BASEMAP,
      center: ROCHESTER_CENTER,
      zoom: ROCHESTER_ZOOM,
      attributionControl: { compact: true },
      maxPitch: 65,
      dragRotate: true,
    });
    mapRef.current = map;
    map.keyboard.enable();

    map.on("error", (e) => {
      // Only surface fatal style failures; individual tile 404s are normal.
      if (!map.isStyleLoaded() && !map.loaded()) setError((e.error as Error)?.message ?? "Map failed to load");
    });

    map.on("load", () => {
      const firstSymbol = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
      const c = {
        ok: token("ok"),
        warn: token("warn"),
        crit: token("crit"),
        muted: token("muted"),
        accent: token("accent"),
        bg: token("bg"),
        s1: token("surface-1"),
        s3: token("surface-3"),
        line: token("line"),
        lineStrong: token("line-strong"),
        text1: token("text-1"),
      };

      // Optional imagery + 3D buildings (hidden until toggled)
      map.addSource("satellite", { type: "raster", tiles: [SATELLITE_TILES], tileSize: 256, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" });
      map.addLayer({ id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" }, paint: { "raster-opacity": 0.9, "raster-saturation": -0.2 } }, firstSymbol);
      map.addSource("ofm", { type: "vector", url: BUILDINGS_TILEJSON, attribution: "© OpenFreeMap" });
      map.addLayer(
        {
          id: "buildings-3d",
          type: "fill-extrusion",
          source: "ofm",
          "source-layer": "building",
          minzoom: 14,
          layout: { visibility: "none" },
          paint: {
            "fill-extrusion-color": c.lineStrong,
            "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
            "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
            "fill-extrusion-opacity": 0.7,
          },
        },
        firstSymbol,
      );

      // Hydrant sources
      map.addSource("hydrants", {
        type: "geojson",
        data: toGeoJSON([]),
        cluster: true,
        clusterRadius: 44,
        clusterMaxZoom: 14,
        clusterProperties: {
          blocked: ["+", ["case", ["==", ["get", "status"], "blocked"], 1, 0]],
          warning: ["+", ["case", ["==", ["get", "status"], "warning"], 1, 0]],
        },
      });
      map.addSource("hydrants-heat", { type: "geojson", data: toGeoJSON([]) });

      map.addLayer({
        id: "risk-heat",
        type: "heatmap",
        source: "hydrants-heat",
        maxzoom: 17,
        layout: { visibility: "none" },
        paint: {
          "heatmap-weight": ["interpolate", ["linear"], ["get", "risk"], 0, 0, 100, 1],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 16, 2],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 18, 16, 42],
          "heatmap-opacity": 0.75,
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(0,0,0,0)",
            0.25,
            token("warn", 0.25),
            0.6,
            token("warn", 0.6),
            1,
            token("crit", 0.85),
          ],
        },
      });

      // Clusters: neutral discs; worst-status ring only when it contains warnings/blocks.
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "hydrants",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": c.s1,
          "circle-radius": ["step", ["get", "point_count"], 14, 10, 17, 40, 21],
          "circle-stroke-color": ["case", [">", ["get", "blocked"], 0], c.crit, [">", ["get", "warning"], 0], c.warn, c.lineStrong],
          "circle-stroke-width": ["case", [">", ["+", ["get", "blocked"], ["get", "warning"]], 0], 2, 1],
        },
      });
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "hydrants",
        filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": FONT, "text-size": 11, "text-allow-overlap": true },
        paint: { "text-color": c.text1 },
      });

      const unclustered: maplibregl.FilterSpecification = ["!", ["has", "point_count"]];
      map.addLayer({
        id: "hydrant-pulse",
        type: "circle",
        source: "hydrants",
        filter: ["all", unclustered, ["==", ["get", "status"], "blocked"]],
        paint: { "circle-color": c.crit, "circle-radius": 10, "circle-opacity": 0.25, "circle-pitch-alignment": "map" },
      });
      map.addLayer({
        id: "hydrant-ring",
        type: "circle",
        source: "hydrants",
        filter: ["all", unclustered, ["==", ["get", "status"], "warning"]],
        paint: { "circle-color": "rgba(0,0,0,0)", "circle-radius": 9.5, "circle-stroke-color": c.warn, "circle-stroke-width": 1.5 },
      });
      map.addLayer({
        id: "hydrant-points",
        type: "circle",
        source: "hydrants",
        filter: unclustered,
        paint: {
          "circle-radius": ["match", ["get", "status"], "blocked", 7.5, "warning", 6, 5.5],
          "circle-color": ["match", ["get", "status"], "clear", c.ok, "warning", c.warn, "blocked", c.crit, c.s1],
          "circle-stroke-color": ["match", ["get", "status"], "offline", c.muted, c.s1],
          "circle-stroke-width": ["match", ["get", "status"], "offline", 1.75, 1.5],
          "circle-opacity": 1,
          "circle-stroke-opacity": ["case", ["get", "monitored"], 1, 0.55],
        },
      });
      map.addLayer({
        id: "hydrant-selected",
        type: "circle",
        source: "hydrants",
        filter: ["==", ["get", "id"], ""],
        paint: { "circle-color": "rgba(0,0,0,0)", "circle-radius": 13, "circle-stroke-color": c.accent, "circle-stroke-width": 2 },
      });

      // Interactions
      map.on("mouseenter", "hydrant-points", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
      map.on("mousemove", "hydrant-points", (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (f) setHover({ id: f.properties.id as string, x: e.point.x, y: e.point.y });
      });
      map.on("mouseleave", "hydrant-points", () => {
        map.getCanvas().style.cursor = "";
        setHover(null);
      });
      map.on("click", "hydrant-points", (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties.id as string | undefined;
        if (id) useApp.getState().select(id);
      });
      map.on("click", "clusters", async (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f) return;
        const src = map.getSource("hydrants") as GeoJSONSource;
        const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id as number);
        map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: zoom + 0.3, duration: 400 });
      });

      setReady(true);
    });

    return () => {
      setReady(false);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ---- data ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const fc = toGeoJSON(hydrants);
    (map.getSource("hydrants") as GeoJSONSource | undefined)?.setData(fc);
    (map.getSource("hydrants-heat") as GeoJSONSource | undefined)?.setData(fc);
    // Frame the dataset once, unless something already asked to focus elsewhere.
    if (!fitted.current && hydrants.length && !useApp.getState().focus && !useApp.getState().selectedId) {
      fitted.current = true;
      const b = new maplibregl.LngLatBounds();
      hydrants.forEach((h) => b.extend([h.lng, h.lat]));
      map.fitBounds(b, { padding: { top: 80, bottom: 96, left: 48, right: 64 }, duration: 0, maxZoom: 14 });
    }
  }, [hydrants, ready]);

  // ---- selection highlight + dimming ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setFilter("hydrant-selected", ["all", ["!", ["has", "point_count"]], ["==", ["get", "id"], selectedId ?? ""]]);
    map.setPaintProperty("hydrant-points", "circle-opacity", selectedId ? ["case", ["==", ["get", "id"], selectedId], 1, 0.85] : 1);
  }, [selectedId, ready]);

  // ---- fly-to requests ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !focus) return;
    const panelOpen = useApp.getState().selectedId !== null;
    map.flyTo({
      center: [focus.lng, focus.lat],
      zoom: focus.zoom ?? Math.max(map.getZoom(), 15),
      padding: panelOpen && wide ? { right: PANEL_OFFSET, left: 0, top: 56, bottom: 64 } : { right: 0, left: 0, top: 0, bottom: panelOpen ? window.innerHeight * 0.45 : 0 },
      duration: reduced ? 0 : 900,
      essential: true,
    });
  }, [focus, ready, reduced, wide]);

  // ---- layer toggles ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setLayoutProperty("risk-heat", "visibility", heatmap ? "visible" : "none");
    map.setLayoutProperty("satellite", "visibility", satellite ? "visible" : "none");
    map.setLayoutProperty("buildings-3d", "visibility", buildings3d ? "visible" : "none");
    for (const id of ["building", "building-top"]) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", buildings3d ? "none" : "visible");
    map.easeTo({ pitch: buildings3d ? 55 : 0, duration: reduced ? 0 : 600 });
  }, [heatmap, satellite, buildings3d, ready, reduced]);

  // ---- blocked pulse (off under reduced motion) ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (reduced) {
      map.setPaintProperty("hydrant-pulse", "circle-radius", 11);
      map.setPaintProperty("hydrant-pulse", "circle-opacity", 0.2);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const loop = (t: number) => {
      const p = ((t - start) % 2000) / 2000;
      map.setPaintProperty("hydrant-pulse", "circle-radius", 8 + p * 12);
      map.setPaintProperty("hydrant-pulse", "circle-opacity", 0.35 * (1 - p));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready, reduced]);

  // Expose map for controls
  useEffect(() => {
    (window as unknown as { __hhMap?: maplibregl.Map | null }).__hhMap = ready ? mapRef.current : null;
  }, [ready]);

  return (
    <div className="absolute inset-0">
      <div ref={container} className="absolute inset-0" aria-label="Map of monitored fire hydrants in Rochester, NY" role="region" />
      {!ready && !error && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-bg">
          <span className="text-sm text-text-3">Loading basemap…</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-bg">
          <div className="max-w-sm rounded-lg border border-line bg-surface-2 p-4 text-sm">
            <p className="font-medium text-text-1">The basemap couldn't load.</p>
            <p className="mt-1 text-text-2">{error}. Check your connection; hydrant data and the rest of the app still work.</p>
            <button className="mt-3 text-accent hover:underline" onClick={() => window.location.reload()}>
              Reload map
            </button>
          </div>
        </div>
      )}
      {hover && <HoverCard {...hover} />}
    </div>
  );
}

export function getMap(): maplibregl.Map | null {
  return (window as unknown as { __hhMap?: maplibregl.Map | null }).__hhMap ?? null;
}
