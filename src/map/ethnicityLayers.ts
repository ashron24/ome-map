import type { Map as MlMap, MapGeoJSONFeature } from "maplibre-gl";
import { Popup } from "maplibre-gl";
import { dataUrl } from "../util/url.ts";

export type EthnicityLayer = {
  id: string;
  label: string;
  prop: string;
  color: string;
  group: "hispanic" | "asian";
};

const SOURCE_ID = "ethnicity-centroids";
const DATA_URL = dataUrl("data/census/tract-centroids.geojson");

// Scale: circle-radius = SCALE * sqrt(count), so area ∝ count
const SCALE = 0.2;

export const ETHNICITY_LAYERS: EthnicityLayer[] = [
  { id: "puerto-rican",      label: "Puerto Rican",      prop: "cnt_puerto_rican",      color: "#e41a1c", group: "hispanic" },
  { id: "dominican",         label: "Dominican",          prop: "cnt_dominican",          color: "#ff7f00", group: "hispanic" },
  { id: "mexican",           label: "Mexican",            prop: "cnt_mexican",            color: "#4daf4a", group: "hispanic" },
  { id: "central-american",  label: "Central American",   prop: "cnt_central_american",   color: "#984ea3", group: "hispanic" },
  { id: "south-american",    label: "South American",     prop: "cnt_south_american",     color: "#377eb8", group: "hispanic" },
  { id: "colombian",         label: "Colombian",          prop: "cnt_colombian",          color: "#a65628", group: "hispanic" },
  { id: "ecuadorian",        label: "Ecuadorian",         prop: "cnt_ecuadorian",         color: "#f781bf", group: "hispanic" },
  { id: "chinese",           label: "Chinese",            prop: "cnt_chinese",            color: "#1b9e77", group: "asian" },
  { id: "korean",            label: "Korean",             prop: "cnt_korean",             color: "#66c2a5", group: "asian" },
  { id: "filipino",          label: "Filipino",           prop: "cnt_filipino",           color: "#fc8d62", group: "asian" },
  { id: "asian-indian",      label: "Asian Indian",       prop: "cnt_asian_indian",       color: "#8da0cb", group: "asian" },
  { id: "bangladeshi",       label: "Bangladeshi",        prop: "cnt_bangladeshi",        color: "#e78ac3", group: "asian" },
];

let popup: Popup | null = null;
let sourceLoaded = false;

function layerId(ethId: string): string {
  return `ethnicity-${ethId}`;
}

export async function ensureEthnicityCentroidsSource(map: MlMap): Promise<void> {
  if (sourceLoaded) return;
  sourceLoaded = true;

  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: DATA_URL,
      generateId: true,
    });
  }

  for (const layer of ETHNICITY_LAYERS) {
    if (map.getLayer(layerId(layer.id))) continue;
    map.addLayer({
      id: layerId(layer.id),
      type: "circle",
      source: SOURCE_ID,
      paint: {
        "circle-radius": [
          "*", SCALE,
          ["sqrt", ["max", 0, ["coalesce", ["to-number", ["get", layer.prop]], 0]]],
        ],
        "circle-color": layer.color,
        "circle-opacity": 0.72,
        "circle-stroke-width": 0.5,
        "circle-stroke-color": "#ffffff",
      },
      layout: { visibility: "none" },
      filter: [">", ["coalesce", ["to-number", ["get", layer.prop]], 0], 0],
    });
  }

  wirePopup(map);
}

export function setEthnicityLayerVisible(
  map: MlMap,
  layerDef: EthnicityLayer,
  visible: boolean,
): void {
  const id = layerId(layerDef.id);
  if (!map.getLayer(id)) return;
  map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
}

function wirePopup(map: MlMap): void {
  const allLayerIds = ETHNICITY_LAYERS.map((l) => layerId(l.id));

  map.on("mousemove", (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: allLayerIds });
    map.getCanvas().style.cursor = features.length ? "pointer" : "";
  });

  map.on("click", (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: allLayerIds });
    if (!features.length) return;

    const f = features[0] as MapGeoJSONFeature;
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const geoid = props.geoid ? String(props.geoid) : "(unknown)";
    const totalpop = props.totalpop !== null && props.totalpop !== undefined
      ? Number(props.totalpop).toLocaleString("en-US")
      : "N/A";

    const rows: string[] = [];
    rows.push(`<dt>Tract</dt><dd>${escapeHtml(geoid)}</dd>`);
    rows.push(`<dt>Total Population</dt><dd>${totalpop}</dd>`);
    rows.push(`<dt style="margin-top:6px;border-top:1px solid #ddd;padding-top:4px">Hispanic Origin</dt><dd></dd>`);

    for (const layer of ETHNICITY_LAYERS.filter((l) => l.group === "hispanic")) {
      const v = props[layer.prop];
      if (v === null || v === undefined) continue;
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      rows.push(`<dt>${escapeHtml(layer.label)}</dt><dd>${n.toLocaleString("en-US")}</dd>`);
    }

    rows.push(`<dt style="margin-top:6px;border-top:1px solid #ddd;padding-top:4px">Asian Origin</dt><dd></dd>`);
    for (const layer of ETHNICITY_LAYERS.filter((l) => l.group === "asian")) {
      const v = props[layer.prop];
      if (v === null || v === undefined) continue;
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      rows.push(`<dt>${escapeHtml(layer.label)}</dt><dd>${n.toLocaleString("en-US")}</dd>`);
    }

    popup?.remove();
    popup = new Popup({ closeOnClick: true, maxWidth: "300px" })
      .setLngLat(e.lngLat)
      .setHTML(
        `<strong>Census Tract ${escapeHtml(geoid.slice(-6))}</strong>` +
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
