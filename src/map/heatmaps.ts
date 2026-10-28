import type { Map as MlMap } from "maplibre-gl";
import { Popup } from "maplibre-gl";
import { dataUrl } from "../util/url.ts";

export type HeatmapId = "hpd-violations" | "dob-violations" | "dep-ecb-violations";

export type HeatmapDef = {
  id: HeatmapId;
  label: string;
  description: string;
  source: string;
  attribution: { name: string; href: string };
  popupFields?: Array<{ key: string; label: string }>;
};

export const HEATMAPS: HeatmapDef[] = [
  {
    id: "hpd-violations",
    label: "HPD Open Violations",
    description: "Open HPD housing violations — Class B (hazardous) and C (immediately hazardous), 150k most recent. Class C weighted 3× in the heatmap. Geocoded via MapPLUTO BBL centroid.",
    source: dataUrl("data/heatmaps/hpd-violations.geojson"),
    attribution: {
      name: "NYC HPD Open Data",
      href: "https://data.cityofnewyork.us/Housing-Development/Open-HPD-Violations/csn4-vhvf",
    },
    popupFields: [
      { key: "class", label: "Class" },
      { key: "status", label: "Status" },
    ],
  },
  {
    id: "dob-violations",
    label: "DOB Active Safety Violations",
    description: "Active NYC Buildings Dept safety violations — 150k most recent. Covers elevators, boilers, facades, and other building systems. Geocoded via MapPLUTO BBL centroid.",
    source: dataUrl("data/heatmaps/dob-violations.geojson"),
    attribution: {
      name: "NYC DOB Open Data",
      href: "https://data.cityofnewyork.us/Housing-Development/DOB-Safety-Violations/855j-jady",
    },
    popupFields: [
      { key: "device_type", label: "Category" },
      { key: "violation_type", label: "Code" },
    ],
  },
  {
    id: "dep-ecb-violations",
    label: "DEP ECB Open Violations",
    description: "Open DEP Environmental Control Board violations with compliance or penalty due. Geocoded via MapPLUTO BBL centroid.",
    source: dataUrl("data/heatmaps/dep-ecb-violations.geojson"),
    attribution: {
      name: "NYC DEP Open Data",
      href: "https://data.cityofnewyork.us/City-Government/DEP-ECB-Violations/skr7-cxt3",
    },
    popupFields: [
      { key: "status", label: "Status" },
      { key: "description", label: "Violation" },
    ],
  },
];

const sourceId = (id: string) => `heatmap-${id}`;
const heatLayerId = (id: string) => `heatmap-${id}`;

export async function ensureHeatmapSource(map: MlMap, def: HeatmapDef): Promise<void> {
  const src = sourceId(def.id);
  if (map.getSource(src)) return;

  try {
    map.addSource(src, { type: "geojson", data: def.source });
  } catch (err) {
    console.error(`[heatmap] addSource failed for ${def.id}:`, err);
    return;
  }

  try {
    map.addLayer({
      id: heatLayerId(def.id),
      type: "heatmap",
      source: src,
      paint: {
        // Optional numeric "weight" property per feature (e.g. HPD class C = 3, class B = 1)
        "heatmap-weight": [
          "case", ["has", "weight"],
          ["to-number", ["get", "weight"]],
          1.0,
        ] as unknown as number,
        "heatmap-intensity": [
          "interpolate", ["linear"], ["zoom"],
          9, 0.04,
          14, 0.15,
        ],
        "heatmap-color": [
          "interpolate", ["linear"], ["heatmap-density"],
          0,    "rgba(0,0,0,0)",
          0.2,  "rgba(255,210,0,0.5)",
          0.45, "rgba(254,178,76,0.72)",
          0.68, "rgba(253,120,45,0.85)",
          0.85, "rgba(240,59,32,0.92)",
          0.95, "rgba(189,0,38,0.97)",
          1.0,  "rgba(128,0,38,1.0)",
        ],
        "heatmap-radius": [
          "interpolate", ["linear"], ["zoom"],
          9,  5,
          13, 12,
          16, 22,
        ],
        "heatmap-opacity": 0.85,
      },
      layout: { visibility: "none" },
    });
  } catch (err) {
    console.error(`[heatmap] addLayer failed for ${def.id}:`, err);
  }

  wireHeatmapPopup(map, def);
}

function wireHeatmapPopup(map: MlMap, def: HeatmapDef): void {
  let popup: Popup | null = null;

  map.on("click", heatLayerId(def.id), (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: [heatLayerId(def.id)] });
    if (!features.length) return;

    const props = (features[0].properties ?? {}) as Record<string, unknown>;
    const attribution = `<a class="attribution-link" href="${def.attribution.href}" target="_blank" rel="noopener">${def.attribution.name}</a>`;

    const rows = (def.popupFields ?? [])
      .map(({ key, label }) => {
        const val = String(props[key] ?? "");
        return val ? `<dt>${label}</dt><dd>${val}</dd>` : "";
      })
      .filter(Boolean)
      .join("");

    popup?.remove();
    popup = new Popup({ closeOnClick: true, maxWidth: "280px" })
      .setLngLat(e.lngLat)
      .setHTML(
        `<div><strong>${def.label}</strong></div>` +
          `<dl>${rows}</dl>` +
          `<div style="margin-top:6px;font-size:11px;color:#888;">Source: ${attribution}</div>`,
      )
      .addTo(map);
  });

  map.on("mouseenter", heatLayerId(def.id), () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", heatLayerId(def.id), () => {
    map.getCanvas().style.cursor = "";
  });
}

export function setHeatmapVisible(map: MlMap, def: HeatmapDef, visible: boolean): void {
  const id = heatLayerId(def.id);
  if (!map.getLayer(id)) return;
  map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
}
