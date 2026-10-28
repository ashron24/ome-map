import type { StyleSpecification } from "maplibre-gl";
import { loadNycBasemap } from "./nyc-basemap.ts";
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
  | "openfreemap"
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
    id: "openfreemap",
    label: "Light (OpenFreeMap)",
    kind: "vector",
    load: async () => {
      const resp = await fetch(OPENFREEMAP_STYLE);
      if (!resp.ok) throw new Error(`OpenFreeMap style ${resp.status}`);
      return resp.json() as Promise<StyleSpecification>;
    },
  },
  {
    id: "positron-nyc",
    label: "Light (NYC Labels Only)",
    kind: "vector",
    load: async () => {
      const resp = await fetch(OPENFREEMAP_STYLE);
      if (!resp.ok) throw new Error(`OpenFreeMap style ${resp.status}`);
      const style = await resp.json() as StyleSpecification;

      // Strip all text/icon label layers from the base tiles
      style.layers = style.layers.filter((l) => l.type !== "symbol");

      // Add NYC neighborhood labels from our NTA GeoJSON
      const ntaUrl = dataUrl("data/boundaries/nta.geojson");
      (style.sources as Record<string, unknown>)["_nta_bg"] = {
        type: "geojson",
        data: ntaUrl,
      };
      style.layers.push({
        id: "_nta_bg_labels",
        type: "symbol",
        source: "_nta_bg",
        minzoom: 11,
        layout: {
          "text-field": ["coalesce", ["get", "nameCol"], ""],
          "text-font": ["Noto Sans Bold"],
          "text-size": [
            "interpolate", ["linear"], ["zoom"],
            11, 10,
            13, 12,
            15, 15,
          ],
          "text-allow-overlap": false,
          "text-ignore-placement": false,
          "text-padding": 4,
          "text-max-width": 8,
        },
        paint: {
          "text-color": "#555",
          "text-halo-color": "rgba(255,255,255,0.9)",
          "text-halo-width": 1.5,
          "text-halo-blur": 0.5,
        },
      } as unknown as StyleSpecification["layers"][number]);

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

export const DEFAULT_BASEMAP: BasemapId = "openfreemap";

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
