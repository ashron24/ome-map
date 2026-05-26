import type { Map as MlMap, MapGeoJSONFeature } from "maplibre-gl";
import { Popup } from "maplibre-gl";
import type { DistrictDef } from "./districts.ts";

const FILL_SUFFIX = "-fill";
const LINE_SUFFIX = "-line";
const LABEL_SUFFIX = "-label";

export const sourceId = (id: string) => `district-${id}`;
export const fillLayerId = (id: string) => `district-${id}${FILL_SUFFIX}`;
export const lineLayerId = (id: string) => `district-${id}${LINE_SUFFIX}`;
export const labelLayerId = (id: string) => `district-${id}${LABEL_SUFFIX}`;

export async function ensureDistrictSource(
  map: MlMap,
  def: DistrictDef,
): Promise<void> {
  const src = sourceId(def.id);
  if (map.getSource(src)) return;

  map.addSource(src, {
    type: "geojson",
    data: def.source,
    promoteId: "nameCol",
  });

  map.addLayer({
    id: fillLayerId(def.id),
    type: "fill",
    source: src,
    paint: {
      "fill-color": def.color,
      "fill-opacity": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        0.18,
        0,
      ],
    },
    layout: { visibility: "none" },
  });

  map.addLayer({
    id: lineLayerId(def.id),
    type: "line",
    source: src,
    paint: {
      "line-color": def.color,
      "line-width": def.lineWidth,
      "line-opacity": 0.9,
      ...(def.dash ? { "line-dasharray": def.dash } : {}),
    },
    layout: {
      "line-cap": "round",
      "line-join": "round",
      visibility: "none",
    },
  });

  map.addLayer({
    id: labelLayerId(def.id),
    type: "symbol",
    source: src,
    layout: {
      "text-field": def.labelPrefix
        ? ["concat", def.labelPrefix, ["coalesce", ["get", "nameCol"], ""]]
        : ["coalesce", ["get", "nameCol"], ""],
      "text-font": ["Noto Sans Regular"],
      "text-size": [
        "interpolate",
        ["linear"],
        ["zoom"],
        10,
        9,
        12,
        12,
        14,
        16,
      ],
      "text-allow-overlap": false,
      "text-padding": 4,
      visibility: "none",
    },
    paint: {
      "text-color": def.color,
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.5,
      "text-halo-blur": 0.5,
    },
    minzoom: 10,
  });

  wireInteractivity(map, def);
}

function wireInteractivity(map: MlMap, def: DistrictDef): void {
  let popup: Popup | null = null;
  let hovered: number | string | undefined;

  const fill = fillLayerId(def.id);
  const src = sourceId(def.id);

  map.on("mousemove", fill, (e) => {
    if (!e.features?.length) return;
    map.getCanvas().style.cursor = "pointer";
    const f = e.features[0] as MapGeoJSONFeature;
    if (hovered !== undefined) {
      map.setFeatureState({ source: src, id: hovered }, { hover: false });
    }
    hovered = f.id as number | string;
    map.setFeatureState({ source: src, id: hovered }, { hover: true });
  });

  map.on("mouseleave", fill, () => {
    map.getCanvas().style.cursor = "";
    if (hovered !== undefined) {
      map.setFeatureState({ source: src, id: hovered }, { hover: false });
      hovered = undefined;
    }
  });

  map.on("click", fill, (e) => {
    if (!e.features?.length) return;
    const f = e.features[0] as MapGeoJSONFeature;
    const props = f.properties as { nameCol?: string; nameAlt?: string | null };
    const name = props.nameCol ?? "(unnamed)";
    const alt = props.nameAlt ? `<dt>Alt</dt><dd>${escapeHtml(props.nameAlt)}</dd>` : "";
    const attribution = `<a class="attribution-link" href="${def.attribution.href}" target="_blank" rel="noopener">${escapeHtml(def.attribution.name)}</a>`;

    popup?.remove();
    popup = new Popup({ closeOnClick: true })
      .setLngLat(e.lngLat)
      .setHTML(
        `<div><strong>${escapeHtml(def.label)}</strong></div>` +
          `<dl><dt>${escapeHtml(def.labelPrefix?.trim() ?? "Name")}</dt><dd>${escapeHtml(name)}</dd>${alt}</dl>` +
          `<div style="margin-top:6px;font-size:11px;color:#888;">Source: ${attribution}</div>`,
      )
      .addTo(map);
  });
}

export function setDistrictVisible(
  map: MlMap,
  def: DistrictDef,
  visible: boolean,
): void {
  if (!map.getLayer(lineLayerId(def.id))) return;
  const v = visible ? "visible" : "none";
  map.setLayoutProperty(fillLayerId(def.id), "visibility", v);
  map.setLayoutProperty(lineLayerId(def.id), "visibility", v);
  map.setLayoutProperty(labelLayerId(def.id), "visibility", v);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
