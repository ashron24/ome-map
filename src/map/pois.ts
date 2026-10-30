import type { Map as MlMap, MapGeoJSONFeature, ExpressionSpecification } from "maplibre-gl";
import { Popup } from "maplibre-gl";
import { dataUrl } from "../util/url.ts";
import { registerDynamicLabels, refreshDynamicLabels, zoomStopsExpression } from "./dynamicLabels.ts";
import type { ZoomStops } from "./dynamicLabels.ts";

export type POIId =
  | "schools-public"
  | "libraries"
  | "hospitals"
  | "cultural"
  | "daycare-prek"
  | "parks"
  | "community-gardens"
  | "bike-routes"
  | "bus-shelters"
  | "linknyc"
  | "restrooms"
  | "subway-lines"
  | "subway-stations"
  | "bus-routes"
  | "dycd-sites"
  | "sbs-sites"
  | "cbo-sites"
  | "food-sites"
  | "universities";

export type POIGeomType = "point" | "polygon" | "line";

type Attribution = { name: string; href: string };

export type POIDef = {
  id: POIId;
  label: string;
  group: "facilities" | "services";
  source: string;
  geomType: POIGeomType;
  color: string;
  colorExpr?: unknown;
  legend?: { label: string; color: string }[];
  hollow?: boolean;
  /** PNG under public/ drawn instead of a dot, on the map and in the menu */
  icon?: string;
  /** Recolor the icon's shape per category, like colorExpr: property value → color */
  iconTint?: { prop: string; colors: [string, string][]; fallback: string };
  /** `icon-size` override; defaults to ICON_SIZE */
  iconSize?: ExpressionSpecification;
  /** Polygon layers: name labels from `minZoom` up (groupBy: extra props that tell same-named areas apart; include: which areas to label at a zoom) */
  labels?: {
    prop: string;
    groupBy?: string[];
    minZoom: number;
    include?: (props: GeoJSON.GeoJsonProperties, zoom: number) => boolean;
  };
  minZoom?: number;
  popupFields: { key: string; label: string }[];
  attribution: Attribution;
};

// Point symbols grow as you zoom in, all the way to max zoom (18)
const ICON_SIZE: ExpressionSpecification =
  ["interpolate", ["linear"], ["zoom"], 10, 0.7, 13, 1, 15, 1.5, 18, 2.25]; // ≈11 → 36 px
// For dense icon layers: much smaller zoomed out, same size zoomed in
const SMALL_START_ICON_SIZE: ExpressionSpecification =
  ["interpolate", ["linear"], ["zoom"], 10, 0.35, 12, 0.55, 14, 1, 16, 1.6, 18, 2.25]; // ≈6 → 36 px
const DOT_RADIUS: ExpressionSpecification =
  ["interpolate", ["linear"], ["zoom"], 10, 3, 13, 5, 15, 8, 18, 13];
const HOLLOW_DOT_RADIUS: ExpressionSpecification =
  ["interpolate", ["linear"], ["zoom"], 10, 3, 13, 5, 15, 7, 18, 11];

const FACDB: Attribution = {
  name: "NYC DCP FacDB",
  href: "https://data.cityofnewyork.us/City-Government/Facilities-Database-Active-Facilities/ji82-xba5",
};
const NYC_OPEN_DATA: Attribution = {
  name: "NYC Open Data",
  href: "https://opendata.cityofnewyork.us/",
};

// DYCD program area color map (ordered by site count desc)
const DYCD_AREA_COLORS: [string, string][] = [
  ["Discretionary", "#757575"],
  ["Compass", "#1565C0"],
  ["SYEP", "#F57C00"],
  ["Literacy and Immigrant Services", "#7B1FA2"],
  ["CSBG", "#00695C"],
  ["Cornerstone", "#2E7D32"],
  ["Beacon", "#F9A825"],
  ["Office of Neighborhood Safety", "#C62828"],
  ["RHY", "#AD1457"],
  ["WIOA", "#4527A0"],
  ["Strategic Partnerships", "#0277BD"],
  ["Advance and Earn", "#558B2F"],
  ["CSBG-HRA", "#00838F"],
  ["CRED", "#BF360C"],
  ["Unity Works", "#283593"],
];

const DYCD_COLOR_EXPR = [
  "match",
  ["get", "program_area"],
  ...DYCD_AREA_COLORS.flat(),
  "#888888",
];

// SBS location type colors (data values for match expression)
const SBS_TYPE_COLORS: [string, string][] = [
  ["Workforce1 Career Center", "#C62828"],
  ["NYC Business Solutions Center", "#2E7D32"],
  ["NYC Business Solutions Industrial and Transportation", "#F9A825"],
  ["Employment Works", "#6A1B9A"],
];

// Shortened display labels for the legend
const SBS_LEGEND = [
  { label: "Workforce1 Career Center", color: "#C62828" },
  { label: "NYC Business Solutions Center", color: "#2E7D32" },
  { label: "NYC Business Solutions I & T", color: "#F9A825" },
  { label: "Employment Works", color: "#6A1B9A" },
];

const SCHOOL_KIND_COLORS: [string, string][] = [
  ["Charter School", "#F57F17"],
  ["Public School", "#1565C0"],
];
const SCHOOL_COLOR_EXPR = ["match", ["get", "kind"], ...SCHOOL_KIND_COLORS.flat(), "#888888"];

const HOSPITAL_KIND_COLORS: [string, string][] = [
  ["Hospital", "#B71C1C"],
  ["Clinic", "#0277BD"],
];
const HOSPITAL_COLOR_EXPR = ["match", ["get", "kind"], ...HOSPITAL_KIND_COLORS.flat(), "#888888"];

const DAYCARE_KIND_COLORS: [string, string][] = [
  ["Day Care", "#F9A825"],
  ["Pre-K", "#2E7D32"],
];
const DAYCARE_COLOR_EXPR = ["match", ["get", "kind"], ...DAYCARE_KIND_COLORS.flat(), "#888888"];

const UNIVERSITY_KIND_COLORS: [string, string][] = [
  ["CUNY/SUNY", "#C62828"],
  ["Community College", "#558B2F"],
  ["Private / Other", "#6A1B9A"],
];

const UNIVERSITY_COLOR_EXPR = [
  "match",
  ["get", "kind"],
  ...UNIVERSITY_KIND_COLORS.flat(),
  "#888888",
];

const FOOD_TYPE_COLORS: [string, string][] = [
  ["Soup Kitchen", "#E53935"],
  ["Food Pantry", "#43A047"],
];

const FOOD_COLOR_EXPR = [
  "match",
  ["get", "type"],
  ...FOOD_TYPE_COLORS.flat(),
  "#888888",
];

const SBS_COLOR_EXPR = [
  "match",
  ["get", "location_type"],
  ...SBS_TYPE_COLORS.flat(),
  "#888888",
];


export const POIS: POIDef[] = [
  {
    id: "schools-public",
    label: "Public Schools (K-12)",
    group: "facilities",
    source: dataUrl("data/pois/schools-public.geojson"),
    geomType: "point",
    color: "#888888",
    colorExpr: SCHOOL_COLOR_EXPR,
    legend: SCHOOL_KIND_COLORS.map(([label, color]) => ({ label, color })),
    icon: "icons/school.png",
    iconSize: SMALL_START_ICON_SIZE,
    iconTint: { prop: "kind", colors: SCHOOL_KIND_COLORS, fallback: "#888888" },
    popupFields: [
      { key: "name", label: "School" },
      { key: "addr", label: "Address" },
      { key: "opname", label: "Operator" },
      { key: "capacity", label: "Capacity" },
    ],
    attribution: FACDB,
  },
  {
    id: "universities",
    label: "Colleges & Universities",
    group: "facilities",
    source: dataUrl("data/pois/universities.geojson"),
    geomType: "point",
    color: "#888888",
    colorExpr: UNIVERSITY_COLOR_EXPR,
    legend: UNIVERSITY_KIND_COLORS.map(([label, color]) => ({ label, color })),
    icon: "icons/university.png",
    iconTint: { prop: "kind", colors: UNIVERSITY_KIND_COLORS, fallback: "#888888" },
    popupFields: [
      { key: "name", label: "Institution" },
      { key: "type", label: "Type" },
      { key: "address", label: "Address" },
      { key: "borough", label: "Borough" },
      { key: "operator", label: "Operator" },
    ],
    attribution: FACDB,
  },
  {
    id: "daycare-prek",
    label: "Day Care & Pre-K",
    group: "facilities",
    source: dataUrl("data/pois/daycare-prek.geojson"),
    geomType: "point",
    color: "#888888",
    colorExpr: DAYCARE_COLOR_EXPR,
    legend: DAYCARE_KIND_COLORS.map(([label, color]) => ({ label, color })),
    popupFields: [
      { key: "name", label: "Site" },
      { key: "type", label: "Type" },
      { key: "addr", label: "Address" },
      { key: "opname", label: "Operator" },
      { key: "capacity", label: "Capacity" },
    ],
    attribution: FACDB,
  },
  {
    id: "libraries",
    label: "Libraries",
    group: "facilities",
    source: dataUrl("data/pois/libraries.geojson"),
    geomType: "point",
    color: "#F57C00",
    icon: "icons/library.png",
    popupFields: [
      { key: "name", label: "Library" },
      { key: "addr", label: "Address" },
      { key: "opname", label: "System" },
    ],
    attribution: FACDB,
  },
  {
    id: "hospitals",
    label: "Hospitals & Clinics",
    group: "facilities",
    source: dataUrl("data/pois/hospitals.geojson"),
    geomType: "point",
    color: "#888888",
    colorExpr: HOSPITAL_COLOR_EXPR,
    legend: HOSPITAL_KIND_COLORS.map(([label, color]) => ({ label, color })),
    popupFields: [
      { key: "name", label: "Facility" },
      { key: "type", label: "Type" },
      { key: "addr", label: "Address" },
      { key: "opname", label: "Operator" },
      { key: "capacity", label: "Capacity" },
    ],
    attribution: FACDB,
  },
  {
    id: "cultural",
    label: "Cultural Institutions",
    group: "facilities",
    source: dataUrl("data/pois/cultural.geojson"),
    geomType: "point",
    color: "#7B1FA2",
    popupFields: [
      { key: "name", label: "Name" },
      { key: "type", label: "Type" },
      { key: "addr", label: "Address" },
      { key: "opname", label: "Operator" },
    ],
    attribution: FACDB,
  },
  {
    id: "parks",
    label: "Parks",
    group: "facilities",
    source: dataUrl("data/pois/parks.geojson"),
    geomType: "polygon",
    color: "#388E3C",
    labels: {
      prop: "name",
      groupBy: ["location"], // some parks share a name across separate sites
      minZoom: 13,
      // Biggest parks (≥ 5 acres) from zoom 13, all from 14.5; never the 123
      // parcels named just "Park", which are mostly road medians
      include: (p, zoom) =>
        String(p?.name ?? "").trim() !== "Park" && (zoom >= 14.5 || Number(p?.acres) >= 5),
    },
    popupFields: [
      { key: "name", label: "Park" },
      { key: "type", label: "Type" },
      { key: "acres", label: "Acres" },
      { key: "location", label: "Location" },
    ],
    attribution: NYC_OPEN_DATA,
  },
  {
    id: "community-gardens",
    label: "Community Gardens",
    group: "facilities",
    source: dataUrl("data/pois/community-gardens.geojson"),
    geomType: "polygon",
    color: "#689F38",
    popupFields: [
      { key: "name", label: "Garden" },
      { key: "addr", label: "Address" },
      { key: "neighborhoodname", label: "Neighborhood" },
      { key: "jurisdiction", label: "Jurisdiction" },
    ],
    attribution: NYC_OPEN_DATA,
  },
  {
    id: "bike-routes",
    label: "Bike Routes",
    group: "facilities",
    source: dataUrl("data/pois/bike-routes.geojson"),
    geomType: "line",
    color: "#0a8a3a",
    popupFields: [
      { key: "street", label: "Street" },
      { key: "fromstreet", label: "From" },
      { key: "tostreet", label: "To" },
      { key: "facilitycl", label: "Class" },
    ],
    attribution: NYC_OPEN_DATA,
  },
  {
    id: "subway-stations",
    label: "Subway Stations",
    group: "facilities",
    source: dataUrl("data/pois/subway-stations.geojson"),
    geomType: "point",
    color: "#0039A6",
    hollow: true,
    minZoom: 11,
    popupFields: [
      { key: "name", label: "Station" },
      { key: "daytime_routes", label: "Routes" },
      { key: "line", label: "Line" },
      { key: "structure", label: "Structure" },
    ],
    attribution: { name: "MTA / NY Open Data", href: "https://data.ny.gov/Transportation/MTA-Subway-Stations/39hk-dx4f" },
  },
  {
    id: "subway-lines",
    label: "Subway Lines",
    group: "facilities",
    source: dataUrl("data/pois/subway-lines.geojson"),
    geomType: "line",
    color: "#0039A6",
    popupFields: [
      { key: "name", label: "Line" },
      { key: "route", label: "Route" },
    ],
    attribution: { name: "MTA / NY Open Data", href: "https://data.ny.gov/Transportation/MTA-Subway-Service-Lines/s692-irgq" },
  },
  {
    id: "bus-routes",
    label: "Bus Routes",
    group: "facilities",
    source: dataUrl("data/pois/bus-routes.geojson"),
    geomType: "line",
    color: "#BF3030",
    popupFields: [
      { key: "name", label: "Route" },
      { key: "fullname", label: "Name" },
      { key: "type", label: "Type" },
    ],
    attribution: { name: "MTA / NY Open Data", href: "https://data.ny.gov/Transportation/MTA-Bus-Routes/bzwk-3hb4" },
  },
  {
    id: "bus-shelters",
    label: "Bus Shelters",
    group: "facilities",
    source: dataUrl("data/pois/bus-shelters.geojson"),
    geomType: "point",
    color: "#455A64",
    minZoom: 13,
    popupFields: [
      { key: "street", label: "On" },
      { key: "cross_street", label: "Cross" },
      { key: "corner", label: "Corner" },
      { key: "boro", label: "Borough" },
    ],
    attribution: NYC_OPEN_DATA,
  },
  {
    id: "linknyc",
    label: "LinkNYC Kiosks",
    group: "facilities",
    source: dataUrl("data/pois/linknyc.geojson"),
    geomType: "point",
    color: "#00ACC1",
    icon: "icons/linknyc.png",
    iconSize: SMALL_START_ICON_SIZE,
    popupFields: [
      { key: "site_id", label: "Site ID" },
      { key: "addr", label: "Address" },
      { key: "nta", label: "Neighborhood" },
      { key: "kiosk_type", label: "Type" },
      { key: "wifi_status", label: "Wifi" },
    ],
    attribution: NYC_OPEN_DATA,
  },
  {
    id: "restrooms",
    label: "Public Restrooms",
    group: "facilities",
    source: dataUrl("data/pois/restrooms.geojson"),
    geomType: "point",
    color: "#5D4037",
    minZoom: 13,
    popupFields: [
      { key: "name", label: "Name" },
      { key: "type", label: "Type" },
      { key: "hours", label: "Hours" },
      { key: "operator", label: "Operator" },
      { key: "accessibility", label: "Accessibility" },
    ],
    attribution: NYC_OPEN_DATA,
  },
  {
    id: "dycd-sites",
    label: "DYCD Program Sites",
    group: "services",
    source: dataUrl("data/pois/dycd-sites.geojson"),
    geomType: "point",
    color: "#888888",
    colorExpr: DYCD_COLOR_EXPR,
    legend: DYCD_AREA_COLORS.map(([label, color]) => ({ label, color })),
    popupFields: [
      { key: "name", label: "Site" },
      { key: "program_area", label: "Program Area" },
      { key: "program_type", label: "Type" },
      { key: "provider", label: "Provider" },
      { key: "address", label: "Address" },
      { key: "borough", label: "Borough" },
      { key: "age_range", label: "Ages" },
    ],
    attribution: {
      name: "NYC DYCD / NYC Open Data",
      href: "https://data.cityofnewyork.us/Social-Services/DYCD-Program-Sites/ebkm-iyma",
    },
  },
  {
    id: "sbs-sites",
    label: "SBS Program Sites",
    group: "services",
    source: dataUrl("data/pois/sbs-sites.geojson"),
    geomType: "point",
    color: "#888888",
    colorExpr: SBS_COLOR_EXPR,
    legend: SBS_LEGEND,
    popupFields: [
      { key: "name", label: "Site" },
      { key: "location_type", label: "Type" },
      { key: "hours", label: "Hours" },
      { key: "address", label: "Address" },
      { key: "city", label: "City" },
      { key: "borough", label: "Borough" },
      { key: "details", label: "Details" },
    ],
    attribution: {
      name: "NYC SBS / NYC Open Data",
      href: "https://data.cityofnewyork.us/dataset/Center-Service-Locations/6smc-7mk6",
    },
  },
  {
    id: "cbo-sites",
    label: "NYC Service CBOs",
    group: "services",
    source: dataUrl("data/pois/cbo-sites.geojson"),
    geomType: "point",
    color: "#F57C00",
    popupFields: [
      { key: "name", label: "Organization" },
      { key: "mission", label: "Mission" },
      { key: "address", label: "Address" },
      { key: "borough", label: "Borough" },
      { key: "nta", label: "Neighborhood" },
      { key: "website", label: "Website" },
    ],
    attribution: {
      name: "NYC Open Data",
      href: "https://data.cityofnewyork.us/Social-Services/NYC-Community-Based-Organizations/i4kb-6ab6",
    },
  },
  {
    id: "food-sites",
    label: "Soup Kitchens & Food Pantries",
    group: "services",
    source: dataUrl("data/pois/food-sites.geojson"),
    geomType: "point",
    color: "#888888",
    colorExpr: FOOD_COLOR_EXPR,
    legend: FOOD_TYPE_COLORS.map(([label, color]) => ({ label, color })),
    popupFields: [
      { key: "name", label: "Site" },
      { key: "type", label: "Type" },
      { key: "address", label: "Address" },
      { key: "borough", label: "Borough" },
      { key: "operator", label: "Operator" },
    ],
    attribution: FACDB,
  },
];

const poiSourceId = (id: string) => `poi-${id}`;
const fillLayer = (id: string) => `poi-${id}-fill`;
const outlineLayer = (id: string) => `poi-${id}-outline`;
const lineLayer = (id: string) => `poi-${id}-line`;
const lineLabelLayer = (id: string) => `poi-${id}-line-label`;
const pointLayer = (id: string) => `poi-${id}-point`;
const stationLabelLayer = (id: string) => `poi-${id}-station-label`;
const polyLabelLayer = (id: string) => `poi-${id}-label`;
const polyLabelSource = (id: string) => `poi-${id}-labels`;

const POLY_LABEL_SIZE: ZoomStops = [[13, 11], [15, 13], [18, 16]];
const POLY_LABEL_MAX_WIDTH = 8;

// MTA subway line colors by route identifier
const MTA_LINE_COLOR = [
  "match", ["get", "route"],
  ["1", "2", "3"], "#EE352E",
  ["4", "5", "6", "6X"], "#00933C",
  ["7", "7X"], "#B933AD",
  ["A", "C", "E"], "#0039A6",
  ["B", "D", "F", "M"], "#FF6319",
  ["N", "Q", "R", "W"], "#FCCC0A",
  ["J", "Z"], "#996633",
  "L", "#A7A9AC",
  "G", "#6CBE45",
  ["S", "FS", "GS", "H", "SI"], "#808183",
  "#555555",
] as unknown as string;

const iconImageId = (id: string) => `poi-icon-${id}`;

// Icons draw at 16 CSS px whatever their source size, so higher-res PNGs stay sharp on retina
const ICON_CSS_PX = 16;

/**
 * Register a POI layer's icon image(s) and return the `icon-image` value: one
 * image, or with `iconTint` one recolored copy per category plus a fallback.
 */
async function addPOIIcons(map: MlMap, def: POIDef, icon: string): Promise<string | ExpressionSpecification> {
  const base = iconImageId(def.id);
  const tint = def.iconTint;
  const variants: [string, string | null][] = tint
    ? [...tint.colors.map(([, color], i): [string, string] => [`${base}-${i}`, color]), [`${base}-default`, tint.fallback]]
    : [[base, null]];

  if (!variants.every(([id]) => map.hasImage(id))) {
    try {
      const { data } = await map.loadImage(dataUrl(icon));
      for (const [id, color] of variants) {
        if (map.hasImage(id)) continue;
        map.addImage(id, color ? tintImage(data, color) : data, { pixelRatio: data.width / ICON_CSS_PX });
      }
    } catch (err) {
      console.error(`[pois] icon load failed for ${def.id}:`, err);
    }
  }

  if (!tint) return base;
  return [
    "match",
    ["get", tint.prop],
    ...tint.colors.flatMap(([value], i) => [value, `${base}-${i}`]),
    `${base}-default`,
  ] as unknown as ExpressionSpecification;
}

/** Fill an icon's opaque shape with one color, keeping its alpha (anti-aliased edges, holes). */
function tintImage(img: HTMLImageElement | ImageBitmap, color: string): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function poiLayerIds(def: POIDef): string[] {
  switch (def.geomType) {
    case "polygon":
      return def.labels
        ? [fillLayer(def.id), outlineLayer(def.id), polyLabelLayer(def.id)]
        : [fillLayer(def.id), outlineLayer(def.id)];
    case "line":
      return def.id === "subway-lines"
        ? [lineLayer(def.id), lineLabelLayer(def.id)]
        : [lineLayer(def.id)];
    case "point":
      if (def.id === "subway-stations") return [pointLayer(def.id), stationLabelLayer(def.id)];
      return [pointLayer(def.id)];
  }
}

export async function ensurePOISource(
  map: MlMap,
  def: POIDef,
): Promise<void> {
  const src = poiSourceId(def.id);
  if (map.getSource(src)) return;

  try {
    map.addSource(src, {
      type: "geojson",
      data: def.source,
      generateId: true,
    });
  } catch (err) {
    console.error(`[pois] addSource failed for ${def.id}:`, err);
    return;
  }

  const tryAddLayer = (spec: Parameters<MlMap["addLayer"]>[0]) => {
    try {
      map.addLayer(spec);
    } catch (err) {
      console.error(`[pois] addLayer failed for ${(spec as { id: string }).id}:`, err);
    }
  };

  if (def.geomType === "polygon") {
    tryAddLayer({
      id: fillLayer(def.id),
      type: "fill",
      source: src,
      paint: {
        "fill-color": def.color,
        "fill-opacity": 0.35,
      },
      layout: { visibility: "none" },
    });
    tryAddLayer({
      id: outlineLayer(def.id),
      type: "line",
      source: src,
      paint: {
        "line-color": def.color,
        "line-width": 1.2,
        "line-opacity": 0.9,
      },
      layout: { visibility: "none" },
    });
    if (def.labels) {
      const labels = def.labels;
      map.addSource(polyLabelSource(def.id), { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      tryAddLayer({
        id: polyLabelLayer(def.id),
        type: "symbol",
        source: polyLabelSource(def.id),
        minzoom: labels.minZoom,
        layout: {
          "text-field": ["coalesce", ["get", labels.prop], ""],
          "text-font": ["Noto Sans Bold"],
          "text-size": zoomStopsExpression(POLY_LABEL_SIZE),
          "text-max-width": POLY_LABEL_MAX_WIDTH,
          "text-padding": 3,
          "text-variable-anchor": ["center", "top", "bottom", "left", "right"],
          "text-radial-offset": 0.6,
          visibility: "none",
        },
        paint: {
          "text-color": "#1B5E20",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      });
      // One label per park, placed in its visible part — see dynamicLabels.ts
      await registerDynamicLabels(map, {
        sourceId: polyLabelSource(def.id),
        layerId: polyLabelLayer(def.id),
        url: def.source,
        nameKey: labels.prop,
        groupBy: labels.groupBy,
        include: labels.include,
        text: (p) => String(p?.[labels.prop] ?? ""),
        textSize: POLY_LABEL_SIZE,
        maxWidthEms: POLY_LABEL_MAX_WIDTH,
      });
    }
  } else if (def.geomType === "line") {
    const isSubway = def.id === "subway-lines";
    tryAddLayer({
      id: lineLayer(def.id),
      type: "line",
      source: src,
      paint: {
        "line-color": isSubway ? MTA_LINE_COLOR : def.color,
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          10, isSubway ? 1.5 : 1,
          14, isSubway ? 3 : 2.5,
          16, isSubway ? 5 : 4,
        ],
        "line-opacity": 0.9,
      },
      layout: {
        "line-cap": "round",
        "line-join": "round",
        visibility: "none",
      },
      ...(def.minZoom ? { minzoom: def.minZoom } : {}),
    });
    if (isSubway) {
      tryAddLayer({
        id: lineLabelLayer(def.id),
        type: "symbol",
        source: src,
        layout: {
          "symbol-placement": "line",
          "symbol-spacing": 350,
          "text-field": ["get", "route"],
          "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 10, 11, 14, 15],
          "text-allow-overlap": false,
          "text-ignore-placement": false,
          visibility: "none",
        },
        paint: {
          "text-color": MTA_LINE_COLOR,
          "text-halo-color": "#ffffff",
          "text-halo-width": 2,
        },
      });
    }
  } else if (def.geomType === "point" && def.icon) {
    const image = await addPOIIcons(map, def, def.icon);
    tryAddLayer({
      id: pointLayer(def.id),
      type: "symbol",
      source: src,
      layout: {
        "icon-image": image,
        "icon-size": def.iconSize ?? ICON_SIZE,
        // Behave like the dot layers: never hidden by, or hiding, labels
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        visibility: "none",
      },
      ...(def.minZoom ? { minzoom: def.minZoom } : {}),
    });
  } else if (def.geomType === "point") {
    tryAddLayer({
      id: pointLayer(def.id),
      type: "circle",
      source: src,
      paint: {
        "circle-color": def.colorExpr !== undefined
          ? def.colorExpr as unknown as string
          : def.hollow ? "#888888" : def.color,
        "circle-radius": def.hollow ? HOLLOW_DOT_RADIUS : DOT_RADIUS,
        "circle-opacity": def.hollow ? 0.5 : 0.9,
        "circle-stroke-width": def.hollow ? 1.5 : 1,
        "circle-stroke-color": def.hollow ? def.color : "#ffffff",
        "circle-stroke-opacity": 0.9,
      },
      layout: { visibility: "none" },
      ...(def.minZoom ? { minzoom: def.minZoom } : {}),
    });
    if (def.hollow) {
      try { map.moveLayer(pointLayer(def.id)); } catch (_) {}
    }
    if (def.id === "subway-stations") {
      tryAddLayer({
        id: stationLabelLayer(def.id),
        type: "symbol",
        source: src,
        minzoom: 14,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 15,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
          "text-allow-overlap": false,
          "text-padding": 3,
          visibility: "none",
        },
        paint: {
          "text-color": "#003087",
          "text-halo-color": "#ffffff",
          "text-halo-width": 2,
        },
      });
    }
  }

  wirePOIInteractivity(map, def);
}

function wirePOIInteractivity(map: MlMap, def: POIDef): void {
  let popup: Popup | null = null;
  const interactive = def.geomType === "polygon"
    ? fillLayer(def.id)
    : def.geomType === "line"
      ? lineLayer(def.id)
      : pointLayer(def.id);

  map.on("mouseenter", interactive, () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", interactive, () => {
    map.getCanvas().style.cursor = "";
  });

  map.on("click", interactive, (e) => {
    if (!e.features?.length) return;
    const f = e.features[0] as MapGeoJSONFeature;
    const props = (f.properties ?? {}) as Record<string, unknown>;

    const rows = def.popupFields
      .map(({ key, label }) => {
        const v = props[key];
        if (v === undefined || v === null || v === "") return "";
        const str = String(v);
        const cell = isUrl(str)
          ? `<a class="popup-link" href="${str}" target="_blank" rel="noopener">${escapeHtml(str)}</a>`
          : escapeHtml(str);
        return `<dt>${escapeHtml(label)}</dt><dd>${cell}</dd>`;
      })
      .filter(Boolean)
      .join("");

    const attribution = `<a class="attribution-link" href="${def.attribution.href}" target="_blank" rel="noopener">${escapeHtml(def.attribution.name)}</a>`;

    popup?.remove();
    popup = new Popup({ closeOnClick: true, maxWidth: "320px" })
      .setLngLat(e.lngLat)
      .setHTML(
        `<div><strong>${escapeHtml(def.label)}</strong></div>` +
          `<dl>${rows}</dl>` +
          `<div style="margin-top:6px;font-size:11px;color:#999;">Source: ${attribution}</div>`,
      )
      .addTo(map);
  });
}

export function setPOIVisible(
  map: MlMap,
  def: POIDef,
  visible: boolean,
): void {
  const v = visible ? "visible" : "none";
  for (const id of poiLayerIds(def)) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v);
  }
  if (visible && def.labels) refreshDynamicLabels(map, polyLabelLayer(def.id));
}

function isUrl(s: string): boolean {
  return s.startsWith("http://") || s.startsWith("https://");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
