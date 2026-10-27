/**
 * OTI NYC Basemap v3 loader, ported from CityOfNewYork/nyc-map-kit.
 * Fetches Esri's vector tile style and applies palette + label cleanup.
 */
import type { StyleSpecification, SymbolLayerSpecification } from "maplibre-gl";
import {
  addBoroughLabels, addLandmarkLabels, addSubwayStations, and,
  flatBuildings, OUTSIDE, PARK_NAME_COLOR, POSITRON_LAND, POSITRON_ROADS,
  reportUnmatched, warmTint,
} from "./basemap-style.ts";

const NYC_BASEMAP_STYLE =
  "https://www.arcgis.com/sharing/rest/content/items/df7862bfd7984baab51ff9df8e214278/resources/styles/root.json";

const BASEMAP_PALETTE = {
  water: "hsl(202, 42%, 80%)",
  park: "hsl(96, 30%, 84%)",
  cemetery: "hsl(96, 16%, 83%)",
};

export async function loadNycBasemap(
  subwayStationsUrl: string,
  cemeteriesUrl: string,
): Promise<StyleSpecification> {
  const style = await loadEsriStyle(NYC_BASEMAP_STYLE);
  const quiet = nycRoadsAsLines(quietNycDetail(nycBasemapPalette(style, BASEMAP_PALETTE)));
  const cemeteries = addNycCemeteries(quiet, cemeteriesUrl, BASEMAP_PALETTE.cemetery);
  const labelled = nycLabels(cemeteries, "en", subwayStationsUrl);
  return warmTint(quietNycRegion(labelled));
}

async function loadEsriStyle(styleUrl: string): Promise<StyleSpecification> {
  const resp = await fetch(styleUrl);
  if (!resp.ok) throw new Error(`basemap style ${styleUrl} returned ${resp.status}`);
  const style = await resp.json();
  for (const source of Object.values(style.sources || {}) as Record<string, unknown>[]) {
    if (source.type === "vector" && Array.isArray(source.tiles)) delete source.url;
    if (typeof source.attribution === "string") {
      source.attribution = source.attribution.replace(/^SOURCE:/, "Source:");
    }
  }
  return style;
}

// ── palette ───────────────────────────────────────────────────────────────────

const NYC_WATER = ["Ocean", "Inland Hydrography", "Region Hydrography"];
const NYC_PARK = ["Parks", "Region Parks", "Plaza", "The High Line"];
const NYC_LAND = ["Land/Land_NYC", "Land/Land_Region"];
const NYC_LAND_COLOR = POSITRON_LAND;
const NYC_PATH_OPACITY = 0.74;
const NYC_STATION = "rgb(191,191,187)";

function nycBasemapPalette(
  style: StyleSpecification,
  options: { water: string; park: string },
): StyleSpecification {
  const hits: Record<string, number> = { water: 0, park: 0, stations: 0, buildings: 0, paths: 0 };
  for (const key of NYC_LAND) hits[key] = 0;
  for (const layer of style.layers || []) {
    if (layer.type !== "fill" && layer.type !== "line") continue;
    const paint = layer.paint as Record<string, unknown> | undefined;
    if (!paint || "fill-pattern" in paint) continue;
    const sourceLayer = layer["source-layer"] || "";
    if (sourceLayer === "Buildings" && layer.type === "fill") {
      hits.buildings++;
      flatBuildings(layer);
      continue;
    }
    if (layer.id === "Sidewalks/Sidewalk") {
      hits.paths++;
      layer.paint = { "fill-color": NYC_LAND_COLOR, "fill-opacity": NYC_PATH_OPACITY };
      continue;
    }
    const land = NYC_LAND.find((k) => layer.id.startsWith(k + "/"));
    let rule: string | undefined;
    let color: string | undefined;
    if (layer.id === "Parks/Pool" || NYC_WATER.includes(sourceLayer))
      [rule, color] = ["water", options.water];
    else if (NYC_PARK.includes(sourceLayer))
      [rule, color] = ["park", options.park];
    else if (sourceLayer === "Rail Stations")
      [rule, color] = ["stations", NYC_STATION];
    else if (land)
      [rule, color] = [land, NYC_LAND_COLOR];
    if (!rule || !color) continue;
    hits[rule]++;
    for (const prop of Object.keys(paint)) {
      if (prop.includes("color")) paint[prop] = color;
      else if (prop.endsWith("-opacity") && (rule === "water" || rule === "park"))
        delete paint[prop];
    }
  }
  reportUnmatched(style, hits);
  return style;
}

// ── quiet detail ──────────────────────────────────────────────────────────────

const NYC_DETAIL = [
  "Sidewalks/Elevated Sidewalk/1", "Sidewalks/Elevated Sidewalk/0",
  "Medians", "Parking Lots", "Pedestrian Overpass", "Traffic Direction",
  "Addresses", "Rail Stations/Station Entrance", "NYC Open Space",
  "Buildings/Building/2", "Buildings/Building/0",
  "Buildings/Landmark Building/2", "Buildings/Landmark Building/0",
];

function quietNycDetail(style: StyleSpecification): StyleSpecification {
  const hits: Record<string, number> = Object.fromEntries(NYC_DETAIL.map((k) => [k, 0]));
  style.layers = (style.layers || []).filter((layer) => {
    const key = [layer.id, "source-layer" in layer ? layer["source-layer"] : undefined]
      .find((k) => k !== undefined && k in hits);
    if (key === undefined) return true;
    hits[key]++;
    return false;
  });
  reportUnmatched(style, hits);
  return style;
}

// ── cemeteries ────────────────────────────────────────────────────────────────

function addNycCemeteries(
  style: StyleSpecification,
  url: string,
  color: string,
): StyleSpecification {
  const layers = style.layers || [];
  if (layers.some((l) => l.id === "cemetery")) return style;
  const hits = { "Inland Hydrography": 0 };
  const at = layers.findIndex(
    (l) => "source-layer" in l && l["source-layer"] === "Inland Hydrography",
  );
  if (at >= 0) {
    hits["Inland Hydrography"]++;
    style.sources = Object.assign({}, style.sources, {
      cemeteries: { type: "geojson" as const, data: url },
    });
    layers.splice(at, 0, {
      id: "cemetery",
      type: "fill",
      source: "cemeteries",
      paint: { "fill-color": color, "fill-antialias": false },
    });
  }
  reportUnmatched(style, hits);
  return style;
}

// ── roads as lines ────────────────────────────────────────────────────────────

const NYC_MINOR_ROADS = ["Local Road", "Ramp", "Alley, Private Road"];
const NYC_MAJOR_ROADS = ["Primary", "Secondary", "Bridge"];

function nycRoadsAsLines(style: StyleSpecification): StyleSpecification {
  const hits: Record<string, number> = { Roadbeds: 0, "Roadbed Edge": 0 };
  for (const cls of [...NYC_MINOR_ROADS, ...NYC_MAJOR_ROADS]) hits[cls] = 0;
  style.layers = (style.layers || []).filter((layer) => {
    const sourceLayer = "source-layer" in layer ? layer["source-layer"] : undefined;
    if (sourceLayer === "Roadbeds" || sourceLayer === "Roadbed Edge") {
      hits[sourceLayer]++;
      return false;
    }
    const [, cls, part] = layer.id.match(/^(?:NYC|Region) Roads\/(.+)\/([01])$/) || [];
    const minor = NYC_MINOR_ROADS.includes(cls);
    if (layer.type !== "line" || (!minor && !NYC_MAJOR_ROADS.includes(cls))) return true;
    hits[cls]++;
    if (minor && part === "1") return false;
    const look = minor
      ? POSITRON_ROADS.minor
      : part === "1" ? POSITRON_ROADS.casing : POSITRON_ROADS.major;
    delete layer.maxzoom;
    layer.paint = { "line-color": look.color, "line-width": look.width };
    return true;
  });
  reportUnmatched(style, hits);
  return style;
}

// ── labels ────────────────────────────────────────────────────────────────────

const NYC_LABEL_KINDS = {
  place: ["City Labels", "Neighborhoods"],
  water: ["Water Area Labels", "Water Line Labels/label", "Region Hydrography/label"],
  park: ["Parks/label", "The High Line/label"],
};
const NYC_LABEL_COLORS = {
  place: "#4a4a4a",
  water: "#495e91",
  park: PARK_NAME_COLOR,
  other: "#666",
};
const NYC_SHIELD_ZOOM = 11;
const NYC_NEIGHBOURHOOD_ZOOM = 12;
const NYC_NEIGHBOURHOOD_TYPE: SymbolLayerSpecification["layout"] = {
  "text-font": ["Noto Sans Italic"],
  "text-transform": "uppercase",
  "text-letter-spacing": 0.1,
};

function nycLabels(
  style: StyleSpecification,
  lang: string,
  subwayStationsUrl: string,
): StyleSpecification {
  const hits: Record<string, number> = {
    "place labels": 0, "water labels": 0, "park labels": 0,
    "City Labels/label/NYC": 0,
    "Neighborhoods/label/Default": 0, "Boundaries/Counties/label/Default": 0,
  };
  const dropped = ["City Labels/label/NYC", "Boundaries/Counties/label/Default"];
  style.layers = (style.layers || []).filter((l) => {
    if (!dropped.includes(l.id)) return true;
    hits[l.id]++;
    return false;
  });
  for (const layer of style.layers) {
    if (layer.type !== "symbol" || !layer.layout?.["text-font"]) continue;
    const shield = "icon-image" in layer.layout;
    const italic = /Italic/.test(JSON.stringify(layer.layout["text-font"]));
    layer.layout["text-font"] = [
      shield ? "Noto Sans Bold" : italic ? "Noto Sans Italic" : "Noto Sans Regular",
    ];
    if (JSON.stringify(layer.layout["text-field"]).includes("_name}")) {
      layer.filter = and(layer.filter, ["!=", "_name", "NO NAME"]);
    }
    if (shield) {
      if (layer["source-layer"] === "Region Road Labels/label") {
        layer.minzoom = Math.max(layer.minzoom ?? 0, NYC_SHIELD_ZOOM);
      }
      continue;
    }
    const kind = (Object.keys(NYC_LABEL_KINDS) as (keyof typeof NYC_LABEL_KINDS)[]).find(
      (k) => NYC_LABEL_KINDS[k].includes(layer["source-layer"] || ""),
    );
    if (kind) hits[`${kind} labels`]++;
    layer.paint = Object.assign({}, layer.paint, {
      "text-color": NYC_LABEL_COLORS[kind || "other"],
      "text-halo-color": "rgba(255, 255, 255, 0.8)",
    });
  }
  const neighbourhoods = style.layers.find((l) => l.id === "Neighborhoods/label/Default");
  if (neighbourhoods?.type === "symbol") {
    hits["Neighborhoods/label/Default"]++;
    neighbourhoods.minzoom = NYC_NEIGHBOURHOOD_ZOOM;
    neighbourhoods.layout = { ...neighbourhoods.layout, ...NYC_NEIGHBOURHOOD_TYPE };
  }
  addSubwayStations(style, subwayStationsUrl);
  addLandmarkLabels(style, lang);
  addBoroughLabels(style, lang, NYC_NEIGHBOURHOOD_ZOOM);
  reportUnmatched(style, hits);
  return style;
}

// ── quiet region ──────────────────────────────────────────────────────────────

const NYC_REGION_SHIELDS = [
  "Region Road Labels/label/Interstate Shield",
  "Region Road Labels/label/US Route",
];

function quietNycRegion(style: StyleSpecification): StyleSpecification {
  const hits: Record<string, number> = {
    "Land/Land_Region/1": 0, "Inland Hydrography": 0,
    "Region Roads": 0, "City Labels/label/Region": 0,
  };
  const land = style.layers.find((l) => l.id === "Land/Land_Region/1");
  const water = style.layers.findIndex(
    (l) => "source-layer" in l && l["source-layer"] === "Inland Hydrography",
  );
  if (land?.type === "fill" && water >= 0) {
    hits["Land/Land_Region/1"]++;
    hits["Inland Hydrography"]++;
    style.layers.splice(water, 0, {
      ...structuredClone(land),
      id: "outside_city",
      paint: { "fill-color": OUTSIDE.color, "fill-opacity": OUTSIDE.opacity },
    });
  }
  style.layers = style.layers.filter((l) => {
    const sourceLayer = "source-layer" in l ? l["source-layer"] ?? "" : "";
    if (l.id === "City Labels/label/Region") { hits[l.id]++; return false; }
    if (l.type === "fill" && sourceLayer === "Region Airports") return false;
    return !(
      l.type === "symbol" &&
      sourceLayer.startsWith("Region") &&
      !sourceLayer.startsWith("Region Hydrography") &&
      !NYC_REGION_SHIELDS.includes(l.id)
    );
  });
  for (const l of style.layers) {
    if (l.type !== "line" || l["source-layer"] !== "Region Roads") continue;
    hits["Region Roads"]++;
    l.paint = { ...l.paint, "line-opacity": OUTSIDE.streets };
  }
  reportUnmatched(style, hits);
  return style;
}
