import type { StyleSpecification } from "maplibre-gl";
import { loadNycBasemap } from "./nyc-basemap.ts";
import { deriveLabelSource } from "./labelSource.ts";
import { dataUrl } from "../util/url.ts";

// ── types ─────────────────────────────────────────────────────────────────────

type RasterBasemapDef = {
  kind: "raster";
  tiles: string[];
  attribution: string;
  tileSize: number;
  maxzoom: number;
};

type VectorBasemapDef = {
  kind: "vector";
  load: () => Promise<StyleSpecification>;
};

export type BasemapId =
  | "nyc"
  | "positron-nyc"
  | "osm"
  | "esri-imagery";

export type BasemapDef = (RasterBasemapDef | VectorBasemapDef) & {
  id: BasemapId;
  label: string;
};

// ── basemap list ──────────────────────────────────────────────────────────────

const GLYPHS_URL =
  "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf";

const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

export const BASEMAPS: BasemapDef[] = [
  {
    id: "nyc",
    label: "NYC Basemap",
    kind: "vector",
    load: () =>
      loadNycBasemap(
        dataUrl("subway-stations.geojson"),
        dataUrl("cemeteries.geojson"),
      ),
  },
  {
    id: "positron-nyc",
    label: "Light (NYC Labels Only)",
    kind: "vector",
    load: async () => {
      const resp = await fetch(OPENFREEMAP_STYLE);
      if (!resp.ok) throw new Error(`OpenFreeMap style ${resp.status}`);
      const style = await resp.json() as StyleSpecification;

      // Keep road and water name labels from vector tiles; drop all place/poi labels
      const KEEP_SOURCE_LAYERS = new Set(["transportation_name", "water_name"]);
      style.layers = style.layers.filter((l) => {
        if (l.type !== "symbol") return true;
        const sl = ("source-layer" in l ? l["source-layer"] : undefined) as string | undefined;
        return !sl || KEEP_SOURCE_LAYERS.has(sl);
      });

      const sources = style.sources as Record<string, unknown>;
      // One label per neighborhood, on its largest polygon part
      sources["_nta_bg"] = {
        type: "geojson",
        data: await deriveLabelSource(dataUrl("neighborhoods.geojson"), "NTAName3"),
      };
      sources["_boroughs_bg"] = {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            { type: "Feature", properties: { name: "Manhattan" },    geometry: { type: "Point", coordinates: [-73.9712, 40.7831] } },
            { type: "Feature", properties: { name: "Brooklyn" },     geometry: { type: "Point", coordinates: [-73.9442, 40.6501] } },
            { type: "Feature", properties: { name: "Queens" },       geometry: { type: "Point", coordinates: [-73.8370, 40.7282] } },
            { type: "Feature", properties: { name: "The Bronx" },    geometry: { type: "Point", coordinates: [-73.8648, 40.8448] } },
            { type: "Feature", properties: { name: "Staten Island" }, geometry: { type: "Point", coordinates: [-74.1502, 40.5795] } },
          ],
        },
      };

      const push = (layer: object) =>
        style.layers.push(layer as StyleSpecification["layers"][number]);

      // Borough labels — large, uppercase, visible at lower zooms
      push({
        id: "_borough_labels",
        type: "symbol",
        source: "_boroughs_bg",
        minzoom: 8,
        maxzoom: 13,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 8, 11, 12, 17],
          "text-letter-spacing": 0.12,
          "text-transform": "uppercase",
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#555",
          "text-halo-color": "rgba(255,255,255,0.9)",
          "text-halo-width": 2,
        },
      });

      // Neighborhood (NTA) labels — finer detail at higher zooms
      push({
        id: "_nta_bg_labels",
        type: "symbol",
        source: "_nta_bg",
        minzoom: 11,
        layout: {
          "text-field": ["coalesce", ["get", "NTAName3"], ["get", "AltName"], ""],
          "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 11, 10, 13, 14, 15, 20],
          "text-allow-overlap": false,
          "text-padding": 4,
          "text-max-width": 8,
          "text-letter-spacing": 0.02,
        },
        paint: {
          "text-color": "#777",
          "text-halo-color": "#ffffff",
          "text-halo-width": 2.5,
          "text-halo-blur": 0,
        },
      });

      return style;
    },
  },
  {
    id: "osm",
    label: "OSM Streets",
    kind: "raster",
    tiles: [
      "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
      "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
      "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
    ],
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    tileSize: 256,
    maxzoom: 19,
  },
  {
    id: "esri-imagery",
    label: "Satellite",
    kind: "raster",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution:
      "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
    tileSize: 256,
    maxzoom: 19,
  },
];

export const DEFAULT_BASEMAP: BasemapId = "positron-nyc";

// ── style builders ────────────────────────────────────────────────────────────

function rasterStyle(def: RasterBasemapDef & { id: BasemapId; label: string }): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sources: {
      basemap: {
        type: "raster",
        tiles: def.tiles,
        tileSize: def.tileSize,
        attribution: def.attribution,
        maxzoom: def.maxzoom,
      },
    },
    layers: [{ id: "basemap", type: "raster", source: "basemap" }],
  };
}

export async function loadBasemapStyle(def: BasemapDef): Promise<StyleSpecification> {
  if (def.kind === "raster") return rasterStyle(def);
  return def.load();
}
