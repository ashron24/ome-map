import type { Map as MlMap, MapGeoJSONFeature } from "maplibre-gl";
import { Popup } from "maplibre-gl";
import { dataUrl } from "../util/url.ts";

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
  | "cbo-sites";

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
  minZoom?: number;
  popupFields: { key: string; label: string }[];
  attribution: Attribution;
};

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

// SBS location type colors
const SBS_TYPE_COLORS: [string, string][] = [
  ["Workforce1 Career Center", "#C62828"],
  ["NYC Business Solutions Center", "#2E7D32"],
  ["NYC Business Solutions Industrial and Transportation", "#F9A825"],
  ["Employment Works", "#6A1B9A"],
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
    color: "#1976D2",
    popupFields: [
      { key: "name", label: "School" },
      { key: "addr", label: "Address" },
      { key: "opname", label: "Operator" },
      { key: "capacity", label: "Capacity" },
    ],
    attribution: FACDB,
  },
  {
    id: "daycare-prek",
    label: "Day Care & Pre-K",
    group: "facilities",
    source: dataUrl("data/pois/daycare-prek.geojson"),
    geomType: "point",
    color: "#FBC02D",
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
    color: "#D32F2F",
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
    id: "bus-routes",
    label: "Bus Routes",
    group: "facilities",
    source: dataUrl("data/pois/bus-routes.geojson"),
    geomType: "line",
    color: "#BF3030",
    minZoom: 13,
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
    minZoom: 13,
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
    legend: SBS_TYPE_COLORS.map(([label, color]) => ({ label, color })),
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
];

const poiSourceId = (id: string) => `poi-${id}`;
const fillLayer = (id: string) => `poi-${id}-fill`;
const outlineLayer = (id: string) => `poi-${id}-outline`;
const lineLayer = (id: string) => `poi-${id}-line`;
const lineLabelLayer = (id: string) => `poi-${id}-line-label`;
const pointLayer = (id: string) => `poi-${id}-point`;

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

function poiLayerIds(def: POIDef): string[] {
  switch (def.geomType) {
    case "polygon":
      return [fillLayer(def.id), outlineLayer(def.id)];
    case "line":
      return def.id === "subway-lines"
        ? [lineLayer(def.id), lineLabelLayer(def.id)]
        : [lineLayer(def.id)];
    case "point":
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
          "text-size": ["interpolate", ["linear"], ["zoom"], 10, 9, 14, 12],
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
  } else if (def.geomType === "point") {
    tryAddLayer({
      id: pointLayer(def.id),
      type: "circle",
      source: src,
      paint: {
        "circle-color": def.colorExpr !== undefined
          ? def.colorExpr as unknown as string
          : def.hollow ? "#888888" : def.color,
        "circle-radius": def.hollow
          ? ["interpolate", ["linear"], ["zoom"], 10, 2, 13, 3.5, 16, 5]
          : ["interpolate", ["linear"], ["zoom"], 10, 3, 14, 6, 16, 9],
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
        return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(v))}</dd>`;
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
          `<div style="margin-top:6px;font-size:11px;color:#888;">Source: ${attribution}</div>`,
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
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
