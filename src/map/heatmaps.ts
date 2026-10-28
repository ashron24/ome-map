import type { Map as MlMap } from "maplibre-gl";
import { Popup } from "maplibre-gl";
import { dataUrl } from "../util/url.ts";

export type HeatmapId = "hpd-violations";

export type HeatmapDef = {
  id: HeatmapId;
  label: string;
  description: string;
  source: string;
  attribution: { name: string; href: string };
};

export const HEATMAPS: HeatmapDef[] = [
  {
    id: "hpd-violations",
    label: "HPD Open Complaints (Heatmap)",
    description: "Active housing maintenance complaints — emergency complaints weighted 3×. Every complaint triggers an HPD inspection and potential violation.",
    source: dataUrl("data/heatmaps/hpd-violations.geojson"),
    attribution: {
      name: "NYC HPD Open Data",
      href: "https://data.cityofnewyork.us/Housing-Development/Housing-Maintenance-Code-Complaints-and-Problems/ygpa-z7cr",
    },
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
        // Emergency complaints weighted 2×, non-emergency 0.5×
        "heatmap-weight": [
          "match", ["get", "urgency"],
          "EMERGENCY", 2.0,
          "NON EMERGENCY", 0.5,
          0.5,
        ] as unknown as number,
        "heatmap-intensity": [
          "interpolate", ["linear"], ["zoom"],
          9, 0.04,
          14, 0.15,
        ],
        "heatmap-color": [
          "interpolate", ["linear"], ["heatmap-density"],
          0,    "rgba(0,0,0,0)",
          0.3,  "rgba(255,237,160,0.25)",
          0.55, "rgba(254,178,76,0.55)",
          0.75, "rgba(253,141,60,0.75)",
          0.9,  "rgba(240,59,32,0.88)",
          0.97, "rgba(189,0,38,0.95)",
          1.0,  "rgba(128,0,38,0.97)",
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
    const urgency = String(props["urgency"] ?? "");
    const category = String(props["category"] ?? "");
    const attribution = `<a class="attribution-link" href="${def.attribution.href}" target="_blank" rel="noopener">${def.attribution.name}</a>`;

    const rows = [
      urgency ? `<dt>Type</dt><dd>${urgency}</dd>` : "",
      category ? `<dt>Category</dt><dd>${category}</dd>` : "",
    ].filter(Boolean).join("");

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
