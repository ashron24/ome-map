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
  | "restrooms";

export type POIGeomType = "point" | "polygon" | "line";

type Attribution = { name: string; href: string };

export type POIDef = {
  id: POIId;
  label: string;
  group: "facilities" | "services";
  source: string;
  geomType: POIGeomType;
  color: string;
  cluster?: boolean;
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

export const POIS: POIDef[] = [
  {
    id: "schools-public",
    label: "Public Schools (K-12)",
    group: "facilities",
    source: dataUrl("data/pois/schools-public.geojson"),
    geomType: "point",
    color: "#1976D2",
    cluster: true,
    popupFields: [
      { key: "name", label: "School" },
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
    cluster: false,
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
    cluster: true,
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
    cluster: true,
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
    id: "bus-shelters",
    label: "Bus Shelters",
    group: "facilities",
    source: dataUrl("data/pois/bus-shelters.geojson"),
    geomType: "point",
    color: "#455A64",
    cluster: true,
    minZoom: 11,
    popupFields: [
      { key: "street", label: "On" },
      { key: "cross_street", label: "Cross" },
      { key: "corner", label: "Corner" },
      { key: "boro", label: "Borough" },
    ],
    attribution: NYC_OPEN_DATA,
  },
  {
    id: "daycare-prek",
    label: "Day Care & Pre-K",
    group: "services",
    source: dataUrl("data/pois/daycare-prek.geojson"),
    geomType: "point",
    color: "#FBC02D",
    cluster: true,
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
    id: "community-gardens",
    label: "Community Gardens",
    group: "services",
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
    id: "linknyc",
    label: "LinkNYC Kiosks",
    group: "services",
    source: dataUrl("data/pois/linknyc.geojson"),
    geomType: "point",
    color: "#00ACC1",
    cluster: true,
    minZoom: 11,
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
    group: "services",
    source: dataUrl("data/pois/restrooms.geojson"),
    geomType: "point",
    color: "#5D4037",
    cluster: true,
    minZoom: 11,
    popupFields: [
      { key: "name", label: "Name" },
      { key: "type", label: "Type" },
      { key: "hours", label: "Hours" },
      { key: "operator", label: "Operator" },
      { key: "accessibility", label: "Accessibility" },
    ],
    attribution: NYC_OPEN_DATA,
  },
];

const poiSourceId = (id: string) => `poi-${id}`;
const fillLayer = (id: string) => `poi-${id}-fill`;
const outlineLayer = (id: string) => `poi-${id}-outline`;
const lineLayer = (id: string) => `poi-${id}-line`;
const pointLayer = (id: string) => `poi-${id}-point`;
const clusterLayer = (id: string) => `poi-${id}-cluster`;
const clusterCountLayer = (id: string) => `poi-${id}-cluster-count`;

function poiLayerIds(def: POIDef): string[] {
  switch (def.geomType) {
    case "polygon":
      return [fillLayer(def.id), outlineLayer(def.id)];
    case "line":
      return [lineLayer(def.id)];
    case "point":
      if (def.cluster) {
        return [
          clusterLayer(def.id),
          clusterCountLayer(def.id),
          pointLayer(def.id),
        ];
      }
      return [pointLayer(def.id)];
  }
}

export async function ensurePOISource(
  map: MlMap,
  def: POIDef,
): Promise<void> {
  const src = poiSourceId(def.id);
  if (map.getSource(src)) return;

  if (def.geomType === "point" && def.cluster) {
    map.addSource(src, {
      type: "geojson",
      data: def.source,
      cluster: true,
      clusterRadius: 50,
      clusterMaxZoom: 13,
    });
  } else {
    map.addSource(src, {
      type: "geojson",
      data: def.source,
      generateId: true,
    });
  }

  if (def.geomType === "polygon") {
    map.addLayer({
      id: fillLayer(def.id),
      type: "fill",
      source: src,
      paint: {
        "fill-color": def.color,
        "fill-opacity": 0.35,
      },
      layout: { visibility: "none" },
    });
    map.addLayer({
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
    map.addLayer({
      id: lineLayer(def.id),
      type: "line",
      source: src,
      paint: {
        "line-color": def.color,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10,
          1,
          14,
          2.5,
          16,
          4,
        ],
        "line-opacity": 0.85,
      },
      layout: {
        "line-cap": "round",
        "line-join": "round",
        visibility: "none",
      },
    });
  } else if (def.geomType === "point") {
    if (def.cluster) {
      map.addLayer({
        id: clusterLayer(def.id),
        type: "circle",
        source: src,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": def.color,
          "circle-radius": [
            "step",
            ["get", "point_count"],
            12,
            50,
            16,
            200,
            22,
          ],
          "circle-opacity": 0.85,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
        layout: { visibility: "none" },
      });

      map.addLayer({
        id: clusterCountLayer(def.id),
        type: "symbol",
        source: src,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Medium"],
          "text-size": 11,
          visibility: "none",
        },
        paint: { "text-color": "#ffffff" },
      });

      map.addLayer({
        id: pointLayer(def.id),
        type: "circle",
        source: src,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": def.color,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            3,
            14,
            6,
            16,
            9,
          ],
          "circle-opacity": 0.9,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
        },
        layout: { visibility: "none" },
        ...(def.minZoom ? { minzoom: def.minZoom } : {}),
      });
    } else {
      map.addLayer({
        id: pointLayer(def.id),
        type: "circle",
        source: src,
        paint: {
          "circle-color": def.color,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            4,
            14,
            8,
            16,
            12,
          ],
          "circle-opacity": 0.9,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
        },
        layout: { visibility: "none" },
        ...(def.minZoom ? { minzoom: def.minZoom } : {}),
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

  // Cluster click → zoom in
  if (def.geomType === "point" && def.cluster) {
    map.on("click", clusterLayer(def.id), async (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [clusterLayer(def.id)],
      });
      const f = features[0];
      if (!f) return;
      const clusterId = f.properties?.cluster_id as number | undefined;
      if (clusterId === undefined) return;
      const src = map.getSource(poiSourceId(def.id)) as unknown as {
        getClusterExpansionZoom: (id: number) => Promise<number>;
      };
      try {
        const zoom = await src.getClusterExpansionZoom(clusterId);
        const geom = f.geometry as unknown as { coordinates: [number, number] };
        map.easeTo({ center: geom.coordinates, zoom });
      } catch {
        // ignore
      }
    });
    map.on("mouseenter", clusterLayer(def.id), () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", clusterLayer(def.id), () => {
      map.getCanvas().style.cursor = "";
    });
  }
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
