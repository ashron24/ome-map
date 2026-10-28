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
    label: "HPD Violations (Heatmap)",
    description: "Open housing violations weighted by severity class (A / B / C)",
    source: dataUrl("data/heatmaps/hpd-violations.geojson"),
    attribution: {
      name: "NYC HPD Open Data",
      href: "https://data.cityofnewyork.us/Housing-Development/Open-HPD-Violations/csn4-vhvf",
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
        // Class C (immediately hazardous) = 3×, B = 1.5×, A / unknown = 0.5×
        "heatmap-weight": [
          "match", ["get", "severity"],
          "C", 3.0,
          "B", 1.5,
          "A", 0.5,
          0.5,
        ] as unknown as number,
        "heatmap-intensity": [
          "interpolate", ["linear"], ["zoom"],
          9, 0.6,
          14, 2.5,
        ],
        "heatmap-color": [
          "interpolate", ["linear"], ["heatmap-density"],
          0,   "rgba(0,0,0,0)",
          0.15, "rgba(255,235,59,0.4)",
          0.35, "rgba(255,152,0,0.65)",
          0.6,  "rgba(244,67,54,0.85)",
          0.85, "rgba(183,28,28,0.95)",
          1.0,  "rgb(130,0,0)",
        ],
        "heatmap-radius": [
          "interpolate", ["linear"], ["zoom"],
          9,  6,
          13, 16,
          16, 28,
        ],
        "heatmap-opacity": 0.82,
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
    const severity = String(props["severity"] ?? "?");
    const severityLabel: Record<string, string> = {
      A: "Non-Hazardous",
      B: "Hazardous",
      C: "Immediately Hazardous",
    };
    const attribution = `<a class="attribution-link" href="${def.attribution.href}" target="_blank" rel="noopener">${def.attribution.name}</a>`;

    popup?.remove();
    popup = new Popup({ closeOnClick: true, maxWidth: "280px" })
      .setLngLat(e.lngLat)
      .setHTML(
        `<div><strong>${def.label}</strong></div>` +
          `<dl><dt>Class</dt><dd>${severity} — ${severityLabel[severity] ?? "Unknown"}</dd></dl>` +
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
