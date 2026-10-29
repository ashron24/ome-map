/**
 * Viewport-aware polygon labels.
 *
 * MapLibre labels a polygon source once per clipped tile piece, which repeats
 * labels at high zoom, and drops a label entirely once its anchor leaves the
 * screen. Instead, each label layer here reads from a Point source that is
 * recomputed after every move: one point per named area, placed at the pole
 * of inaccessibility of the area's on-screen part, and only if an estimate of
 * the label's box fits inside that part.
 *
 * All geometry is held in Web Mercator units (0..1 world), so one pixel is
 * 1 / (512 * 2^zoom) in both axes. Rotation and pitch are approximated by the
 * viewport's enclosing bounds.
 */
import type { Map as MlMap, GeoJSONSource, ExpressionSpecification } from "maplibre-gl";
import polylabel from "polylabel";
import { clipPolygon } from "lineclip";

type Pt = [number, number];
type Ring = Pt[];
type BBox = [number, number, number, number];

type Part = {
  rings: Ring[];
  bbox: BBox;
  // Pole of the whole part, computed lazily for parts fully on screen
  pole?: { pt: Pt; dist: number };
};

type Area = { props: GeoJSON.GeoJsonProperties; text: string; parts: Part[] };

export type ZoomStops = [number, number][];

export type DynamicLabelOptions = {
  /** Point source the label layer reads from */
  sourceId: string;
  /** Symbol layer whose visibility and minzoom gate updates */
  layerId: string;
  /** Polygon GeoJSON to label */
  url: string;
  /** Property that names an area; parts sharing a name get one label */
  nameKey: string;
  /** The label string, matching the layer's text-field */
  text: (props: GeoJSON.GeoJsonProperties) => string;
  /** text-size stops, matching the layer's text-size */
  textSize: ZoomStops;
  /** text-max-width in ems, matching the layer */
  maxWidthEms: number;
};

type LabelSet = DynamicLabelOptions & { areas: Area[] };

// Average glyph advance and line height for Noto Sans Bold, in ems
const CHAR_EM = 0.6;
const LINE_EM = 1.2;
// Room left around the text box for the halo
const BOX_PAD_PX = 2;

const TILE_SIZE = 512;

// ── public API ────────────────────────────────────────────────────────────────

/** Build a `text-size` expression from stops, for use with `textSize`. */
export function zoomStopsExpression(stops: ZoomStops): ExpressionSpecification {
  return ["interpolate", ["linear"], ["zoom"], ...stops.flat()] as ExpressionSpecification;
}

/**
 * Start keeping `opts.sourceId` filled with viewport-fitted label points.
 * Safe to call again after a style swap; the polygons are only parsed once.
 */
export async function registerDynamicLabels(
  map: MlMap,
  opts: DynamicLabelOptions,
): Promise<void> {
  const areas = await loadAreas(opts);
  setsFor(map).set(opts.layerId, { ...opts, areas });
  refreshDynamicLabels(map, opts.layerId);
}

/** Recompute labels now — call after changing a label layer's visibility. */
export function refreshDynamicLabels(map: MlMap, layerId?: string): void {
  const sets = setsFor(map);
  if (layerId) {
    const set = sets.get(layerId);
    if (set) update(map, set);
  } else {
    for (const set of sets.values()) update(map, set);
  }
}

// ── registry ──────────────────────────────────────────────────────────────────

const registries = new WeakMap<MlMap, Map<string, LabelSet>>();

function setsFor(map: MlMap): Map<string, LabelSet> {
  let sets = registries.get(map);
  if (!sets) {
    sets = new Map();
    registries.set(map, sets);
    map.on("moveend", () => refreshDynamicLabels(map));
    map.on("resize", () => refreshDynamicLabels(map));
  }
  return sets;
}

const areaCache = new Map<string, Promise<Area[]>>();

function loadAreas(opts: DynamicLabelOptions): Promise<Area[]> {
  const key = `${opts.url}|${opts.nameKey}`;
  let p = areaCache.get(key);
  if (!p) {
    p = fetch(opts.url)
      .then((r) => r.json() as Promise<GeoJSON.FeatureCollection>)
      .then((fc) => buildAreas(fc, opts));
    p.catch(() => areaCache.delete(key));
    areaCache.set(key, p);
  }
  return p;
}

function buildAreas(fc: GeoJSON.FeatureCollection, opts: DynamicLabelOptions): Area[] {
  const byName = new Map<string, Area>();
  for (const f of fc.features) {
    const geom = f.geometry as GeoJSON.Geometry | null;
    const name = f.properties?.[opts.nameKey] as string | null | undefined;
    if (!geom || !name) continue;

    const polys =
      geom.type === "Polygon" ? [geom.coordinates] :
      geom.type === "MultiPolygon" ? geom.coordinates :
      [];
    if (!polys.length) continue;

    let area = byName.get(name);
    if (!area) {
      area = { props: f.properties, text: opts.text(f.properties), parts: [] };
      byName.set(name, area);
    }
    for (const poly of polys) {
      const rings = poly.map((ring) => ring.map(([lng, lat]) => toMercator(lng, lat)));
      if (rings[0]?.length >= 4) area.parts.push({ rings, bbox: ringBBox(rings[0]) });
    }
  }
  return [...byName.values()].filter((a) => a.parts.length);
}

// ── per-move update ───────────────────────────────────────────────────────────

function update(map: MlMap, set: LabelSet): void {
  const src = map.getSource(set.sourceId) as GeoJSONSource | undefined;
  const layer = map.getLayer(set.layerId);
  if (!src || !layer) return;
  if (map.getLayoutProperty(set.layerId, "visibility") === "none") return;

  const zoom = map.getZoom();
  const features: GeoJSON.Feature[] = [];

  if (zoom >= (layer.minzoom ?? 0)) {
    const pxPerUnit = TILE_SIZE * 2 ** zoom;
    const b = map.getBounds();
    const [x0, y0] = toMercator(b.getWest(), b.getNorth());
    const [x1, y1] = toMercator(b.getEast(), b.getSouth());
    const view: BBox = [x0, y0, x1, y1];

    const fontPx = interpolateStops(set.textSize, zoom);
    for (const area of set.areas) {
      const [w, h] = labelBoxPx(area.text, fontPx, set.maxWidthEms);
      const pt = placeLabel(area, view, pxPerUnit, w / pxPerUnit, h / pxPerUnit);
      if (pt) {
        features.push({
          type: "Feature",
          properties: area.props,
          geometry: { type: "Point", coordinates: fromMercator(pt) },
        });
      }
    }
  }

  src.setData({ type: "FeatureCollection", features });
}

/**
 * Best label point for one area in the current view, or null if no on-screen
 * part has room. Picks the visible piece with the largest inscribed circle.
 */
function placeLabel(area: Area, view: BBox, pxPerUnit: number, w: number, h: number): Pt | null {
  let best: { pt: Pt; dist: number; rings: Ring[] } | null = null;

  for (const part of area.parts) {
    if (!intersects(part.bbox, view)) continue;

    let rings: Ring[];
    let pole: { pt: Pt; dist: number };
    if (contains(view, part.bbox)) {
      rings = part.rings;
      pole = part.pole ??= poleOf(rings, Math.min(part.bbox[2] - part.bbox[0], part.bbox[3] - part.bbox[1]) / 200);
    } else {
      rings = clipRings(part.rings, view);
      if (!rings.length) continue;
      pole = poleOf(rings, 1 / pxPerUnit);
    }

    if (!best || pole.dist > best.dist) best = { ...pole, rings };
  }

  if (!best || best.dist < h / 2) return null;
  return boxFits(best.pt, w, h, best.rings) ? best.pt : null;
}

// ── geometry helpers ──────────────────────────────────────────────────────────

function toMercator(lng: number, lat: number): Pt {
  const s = Math.sin((lat * Math.PI) / 180);
  return [(lng + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)];
}

function fromMercator([x, y]: Pt): Pt {
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
  return [x * 360 - 180, lat];
}

function ringBBox(ring: Ring): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

function intersects(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function contains(outer: BBox, inner: BBox): boolean {
  return inner[0] >= outer[0] && inner[2] <= outer[2] && inner[1] >= outer[1] && inner[3] <= outer[3];
}

/** Clip outer ring and holes to the view; empty if the outer ring vanishes. */
function clipRings(rings: Ring[], view: BBox): Ring[] {
  const out: Ring[] = [];
  for (let i = 0; i < rings.length; i++) {
    const clipped = clipPolygon(rings[i], view);
    if (clipped.length < 3) {
      if (i === 0) return [];
      continue;
    }
    out.push(clipped);
  }
  return out;
}

function poleOf(rings: Ring[], precision: number): { pt: Pt; dist: number } {
  const p = polylabel(rings, precision);
  return { pt: [p[0], p[1]], dist: p.distance };
}

/** Whether a w×h box centred on `c` lies inside the polygon (corners + edge midpoints). */
function boxFits(c: Pt, w: number, h: number, rings: Ring[]): boolean {
  const dx = w / 2, dy = h / 2;
  // Inscribed circle already covers the box
  if (Math.hypot(dx, dy) <= polyDist(c, rings)) return true;
  for (const [sx, sy] of [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]]) {
    if (!insidePolygon([c[0] + sx * dx, c[1] + sy * dy], rings)) return false;
  }
  return true;
}

function insidePolygon([x, y]: Pt, rings: Ring[]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function polyDist([x, y]: Pt, rings: Ring[]): number {
  let min = Infinity;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      min = Math.min(min, segDist(x, y, ring[j], ring[i]));
    }
  }
  return min;
}

function segDist(px: number, py: number, [ax, ay]: Pt, [bx, by]: Pt): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// ── label size estimate ───────────────────────────────────────────────────────

function interpolateStops(stops: ZoomStops, zoom: number): number {
  if (zoom <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [z1, v1] = stops[i];
    if (zoom <= z1) {
      const [z0, v0] = stops[i - 1];
      return v0 + ((v1 - v0) * (zoom - z0)) / (z1 - z0);
    }
  }
  return stops[stops.length - 1][1];
}

/** Approximate rendered [width, height] in px, word-wrapped like text-max-width. */
function labelBoxPx(text: string, fontPx: number, maxWidthEms: number): [number, number] {
  const maxChars = Math.max(1, Math.floor(maxWidthEms / CHAR_EM));
  const lines: number[] = [];
  let line = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? line + 1 + word.length : word.length;
    if (line && next > maxChars) {
      lines.push(line);
      line = word.length;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  const widest = Math.max(0, ...lines);
  return [
    widest * CHAR_EM * fontPx + 2 * BOX_PAD_PX,
    Math.max(1, lines.length) * LINE_EM * fontPx + 2 * BOX_PAD_PX,
  ];
}
