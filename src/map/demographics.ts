import type { Map as MlMap, MapGeoJSONFeature } from "maplibre-gl";
import { Popup } from "maplibre-gl";
import { dataUrl } from "../util/url.ts";

export type DemographicMetric = {
  id: string;
  label: string;
  prop: string;
  type: "percent" | "currency";
  breaks: number[];
  colors: string[];
};

const SOURCE_ID = "demographics";
const FILL_LAYER_ID = "demographics-fill";
const OUTLINE_LAYER_ID = "demographics-outline";
const DATA_URL = dataUrl("data/census/tracts.geojson");

// 7-class YlOrRd for percentage choropleths (matches old map)
const PCT_BREAKS = [10, 20, 35, 50, 65, 80, 90];
const PCT_COLORS = [
  "rgba(0,0,0,0)",
  "#FFFFB2",
  "#FED976",
  "#FEB24C",
  "#FD8D3C",
  "#FC4E2A",
  "#E31A1C",
  "#B10026",
];

// 7-class diverging for income (low=red, mid=neutral, high=green)
const INCOME_BREAKS = [30000, 45000, 60000, 80000, 100000, 125000, 175000];
const INCOME_COLORS = [
  "#d73027",
  "#fc8d59",
  "#fee08b",
  "#ffffbf",
  "#d9ef8b",
  "#91cf60",
  "#1a9850",
  "#006837",
];

export const METRICS: DemographicMetric[] = [
  {
    id: "pct_hispanic",
    label: "% Hispanic",
    prop: "pct_hispanic",
    type: "percent",
    breaks: PCT_BREAKS,
    colors: PCT_COLORS,
  },
  {
    id: "pct_nh_white",
    label: "% White (non-Hispanic)",
    prop: "pct_nh_white",
    type: "percent",
    breaks: PCT_BREAKS,
    colors: PCT_COLORS,
  },
  {
    id: "pct_black",
    label: "% Black",
    prop: "pct_black",
    type: "percent",
    breaks: PCT_BREAKS,
    colors: PCT_COLORS,
  },
  {
    id: "pct_asian",
    label: "% Asian",
    prop: "pct_asian",
    type: "percent",
    breaks: PCT_BREAKS,
    colors: PCT_COLORS,
  },
  {
    id: "pct_foreign_born",
    label: "% Foreign-Born",
    prop: "pct_foreign_born",
    type: "percent",
    breaks: PCT_BREAKS,
    colors: PCT_COLORS,
  },
  {
    id: "pct_non_citizen",
    label: "% Non-Citizen",
    prop: "pct_non_citizen",
    type: "percent",
    breaks: PCT_BREAKS,
    colors: PCT_COLORS,
  },
  {
    id: "median_hh_income",
    label: "Median HH Income",
    prop: "median_hh_income",
    type: "currency",
    breaks: INCOME_BREAKS,
    colors: INCOME_COLORS,
  },
];

let popup: Popup | null = null;
let currentMetric: DemographicMetric | null = null;

export async function ensureDemographicsSource(map: MlMap): Promise<void> {
  if (map.getSource(SOURCE_ID)) return;

  map.addSource(SOURCE_ID, {
    type: "geojson",
    data: DATA_URL,
    generateId: true,
  });

  map.addLayer({
    id: FILL_LAYER_ID,
    type: "fill",
    source: SOURCE_ID,
    paint: {
      "fill-color": "rgba(0,0,0,0)",
      "fill-opacity": 0.75,
    },
    layout: { visibility: "none" },
  });

  map.addLayer({
    id: OUTLINE_LAYER_ID,
    type: "line",
    source: SOURCE_ID,
    paint: {
      "line-color": "#ffffff",
      "line-width": 0.3,
      "line-opacity": 0.6,
    },
    layout: { visibility: "none" },
  });

  wireDemographicsPopup(map);
}

export function setDemographicMetric(
  map: MlMap,
  metric: DemographicMetric | null,
): void {
  currentMetric = metric;
  if (!map.getLayer(FILL_LAYER_ID)) return;

  if (!metric) {
    map.setLayoutProperty(FILL_LAYER_ID, "visibility", "none");
    map.setLayoutProperty(OUTLINE_LAYER_ID, "visibility", "none");
    return;
  }

  map.setLayoutProperty(FILL_LAYER_ID, "visibility", "visible");
  map.setLayoutProperty(OUTLINE_LAYER_ID, "visibility", "visible");

  const colorExpr = buildStepExpression(metric);
  map.setPaintProperty(FILL_LAYER_ID, "fill-color", colorExpr);
}

function buildStepExpression(metric: DemographicMetric): unknown {
  // step([prop value], colors[0], breaks[0], colors[1], breaks[1], colors[2], ...)
  const expr: unknown[] = [
    "step",
    ["coalesce", ["to-number", ["get", metric.prop]], -1],
    metric.colors[0],
  ];
  for (let i = 0; i < metric.breaks.length; i++) {
    expr.push(metric.breaks[i], metric.colors[i + 1]);
  }
  return expr;
}

function wireDemographicsPopup(map: MlMap): void {
  map.on("mouseenter", FILL_LAYER_ID, () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", FILL_LAYER_ID, () => {
    map.getCanvas().style.cursor = "";
  });
  map.on("click", FILL_LAYER_ID, (e) => {
    if (!e.features?.length || !currentMetric) return;
    const f = e.features[0] as MapGeoJSONFeature;
    const props = (f.properties ?? {}) as Record<string, unknown>;

    const ctlabel = props.ctlabel ?? props.ct2020 ?? "(unknown tract)";
    const ntaname = props.ntaname ?? "";
    const totalpop = props.totalpop;

    const rows: string[] = [];
    rows.push(
      `<dt>Tract</dt><dd>${escapeHtml(String(ctlabel))}${ntaname ? ` &mdash; ${escapeHtml(String(ntaname))}` : ""}</dd>`,
    );
    if (totalpop !== null && totalpop !== undefined) {
      rows.push(
        `<dt>Population</dt><dd>${Number(totalpop).toLocaleString("en-US")}</dd>`,
      );
    }
    // Show all metric values on click — context helps interpretation
    for (const m of METRICS) {
      const v = props[m.prop];
      if (v === null || v === undefined) continue;
      const fmt = m.type === "currency"
        ? `$${Number(v).toLocaleString("en-US")}`
        : `${Number(v).toFixed(1)}%`;
      const cur = m.id === currentMetric.id ? " style=\"font-weight:700\"" : "";
      rows.push(`<dt${cur}>${escapeHtml(m.label)}</dt><dd${cur}>${fmt}</dd>`);
    }

    popup?.remove();
    popup = new Popup({ closeOnClick: true, maxWidth: "320px" })
      .setLngLat(e.lngLat)
      .setHTML(
        `<div><strong>${escapeHtml(currentMetric.label)}</strong></div>` +
          `<dl>${rows.join("")}</dl>` +
          `<div style="margin-top:6px;font-size:11px;color:#888;">Source: <a class="attribution-link" href="https://www.census.gov/programs-surveys/acs" target="_blank" rel="noopener">U.S. Census Bureau ACS 5-Year</a></div>`,
      )
      .addTo(map);
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
