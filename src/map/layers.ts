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
const labelSourceId = (id: string) => `district-${id}-labels`;

type Ring = number[][];
type PolygonCoords = Ring[];
type MultiPolygonCoords = PolygonCoords[];

function bboxArea(ring: Ring): number {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return (maxX - minX) * (maxY - minY);
}

function largestPoly(polys: MultiPolygonCoords): PolygonCoords | null {
  let best: PolygonCoords | null = null;
  let bestArea = -1;
  for (const poly of polys) {
    if (!poly[0]) continue;
    const area = bboxArea(poly[0]);
    if (area > bestArea) { bestArea = area; best = poly; }
  }
  return best;
}

async function deriveLabelSource(url: string): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch(url);
  const fc = await res.json() as GeoJSON.FeatureCollection;
  const features: GeoJSON.Feature[] = [];
  for (const f of fc.features) {
    const geom = f.geometry as GeoJSON.Geometry | null;
    if (!geom) continue;
    let outGeom: GeoJSON.Geometry;
    if (geom.type === "Polygon") {
      outGeom = geom;
    } else if (geom.type === "MultiPolygon") {
      const largest = largestPoly(geom.coordinates as MultiPolygonCoords);
      if (!largest) continue;
      outGeom = { type: "Polygon", coordinates: largest };
    } else {
      continue;
    }
    features.push({ type: "Feature", properties: f.properties, geometry: outGeom });
  }
  return { type: "FeatureCollection", features };
}

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
      "line-width": def.lineWidth + 0.5,
      "line-opacity": 0.9,
      ...(def.dash ? { "line-dasharray": def.dash } : {}),
    },
    layout: {
      "line-cap": "round",
      "line-join": "round",
      visibility: "none",
    },
  });

  const labelSrc = labelSourceId(def.id);
  const labelData = await deriveLabelSource(def.source);
  map.addSource(labelSrc, { type: "geojson", data: labelData });

  map.addLayer({
    id: labelLayerId(def.id),
    type: "symbol",
    source: labelSrc,
    layout: {
      "text-field": def.labelPrefix
        ? ["concat", def.labelPrefix, ["coalesce", ["get", "nameCol"], ""]]
        : ["coalesce", ["get", "nameCol"], ""],
      "text-font": ["Noto Sans Bold"],
      "text-size": [
        "interpolate",
        ["linear"],
        ["zoom"],
        10, def.id === "nta" || def.id === "zipcode" ? 9 : 13,
        12, def.id === "nta" || def.id === "zipcode" ? 12 : 17,
        14, def.id === "nta" || def.id === "zipcode" ? 16 : 22,
      ],
      "text-allow-overlap": false,
      "text-padding": 4,
      "text-max-width": def.labelMaxWidth ?? 10,
      visibility: "none",
    },
    paint: {
      "text-color": def.labelColor ?? def.color,
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
