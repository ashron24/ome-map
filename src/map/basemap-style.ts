/**
 * Shared basemap utilities ported from CityOfNewYork/nyc-map-kit.
 * Covers: warm tint, borough/landmark labels, subway stations,
 * grey-outside-city, city-line dot, and positron reference colours.
 */
import type { Feature, FeatureCollection, MultiLineString, Point, Polygon } from "geojson";
import type {
  ExpressionSpecification, FillLayerSpecification, FilterSpecification,
  LayerSpecification, StyleSpecification,
} from "maplibre-gl";
import CITY_LIMITS from "./city-limits.json";
import CITY_LINE from "./city-line.json";

// ── subway station icon ───────────────────────────────────────────────────────

export const STATION_ICON = "subway-station";
const STATION_ICON_DPR = 2;
export const STATION_COLOR = "#4a4a4a";
const STATION_SIZE = 18;
const TRAIN_PATH =
  "M9 3h6a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-6a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3Z" +
  "M8.5 6.5h7v4h-7Z" +
  "M10.1 14a1.1 1.1 0 1 0 -2.2 0a1.1 1.1 0 1 0 2.2 0Z" +
  "M16.1 14a1.1 1.1 0 1 0 -2.2 0a1.1 1.1 0 1 0 2.2 0Z" +
  "M8.2 17h1.8l-1.6 4h-1.8Z" +
  "M14 17h1.8l1.6 4h-1.8Z";

export function stationIcon(): ImageData {
  const px = STATION_SIZE * STATION_ICON_DPR;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(STATION_ICON_DPR, STATION_ICON_DPR);
  const r = STATION_SIZE / 2;
  ctx.beginPath();
  ctx.arc(r, r, r - 0.75, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = STATION_COLOR;
  ctx.stroke();
  const glyph = STATION_SIZE * 0.66;
  ctx.translate(r - glyph / 2, r - glyph / 2);
  ctx.scale(glyph / 24, glyph / 24);
  ctx.fillStyle = STATION_COLOR;
  ctx.fill(new Path2D(TRAIN_PATH), "evenodd");
  return ctx.getImageData(0, 0, px, px);
}

// ── name expression ──────────────────────────────────────────────────────────

export function nameExpression(lang = "en"): ExpressionSpecification {
  return lang === "en"
    ? ["coalesce", ["get", "name:latin"], ["get", "name:en"], ["get", "name"]]
    : ["coalesce", ["get", `name:${lang}`], ["get", "name:latin"], ["get", "name"]];
}

// ── filter helpers ───────────────────────────────────────────────────────────

export function and(
  existing: FilterSpecification | undefined,
  ...clauses: FilterSpecification[]
): FilterSpecification {
  return (existing
    ? ["all", existing, ...clauses]
    : ["all", ...clauses]) as FilterSpecification;
}

// ── reporting ────────────────────────────────────────────────────────────────

export function reportUnmatched(
  _style: StyleSpecification,
  hits: Record<string, number>,
): void {
  const missed = Object.keys(hits).filter((k) => hits[k] === 0);
  if (!missed.length) return;
  console.warn(`[basemap] rules matched no layer: ${missed.join(", ")}`);
}

// ── positron reference colours ───────────────────────────────────────────────

export const PARK_NAME_COLOR = "hsl(96, 25%, 30%)";
export const POSITRON_LAND = "rgb(242,243,240)";
export const POSITRON_BUILDING = {
  fill: "rgb(234, 234, 229)",
  outline: "rgb(219, 219, 218)",
};
export const POSITRON_ROADS: Record<
  "minor" | "major" | "casing",
  { color: string | ExpressionSpecification; width: ExpressionSpecification }
> = {
  minor: {
    color: ["interpolate", ["linear"], ["zoom"], 13, "hsl(0, 0%, 88%)", 14, "#fff"],
    width: ["interpolate", ["exponential", 1.55], ["zoom"], 13, 1.8, 20, 20],
  },
  major: {
    color: "#fff",
    width: ["interpolate", ["exponential", 1.3], ["zoom"], 10, 2, 20, 20],
  },
  casing: {
    color: "rgb(213, 213, 213)",
    width: ["interpolate", ["exponential", 1.3], ["zoom"], 10, 3, 20, 23],
  },
};

const BUILDING_ZOOM = 16;

export function flatBuildings(layer: FillLayerSpecification) {
  layer.minzoom = BUILDING_ZOOM - 0.5;
  layer.paint = {
    "fill-color": POSITRON_BUILDING.fill,
    "fill-outline-color": POSITRON_BUILDING.outline,
    "fill-opacity": [
      "interpolate", ["linear"], ["zoom"],
      BUILDING_ZOOM - 0.5, 0, BUILDING_ZOOM, 1,
    ],
  };
}

// ── outside the city ─────────────────────────────────────────────────────────

export const OUTSIDE = {
  color: "#4f5b78",
  opacity: 0.1,
  streets: 0.35,
  line: "hsl(0, 0%, 70%)",
};

const OUTSIDE_CITY: Polygon = {
  type: "Polygon",
  coordinates: [
    [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]],
    ...(CITY_LIMITS as { geometry: { coordinates: number[][][][] } })
      .geometry.coordinates.map((polygon) => [...polygon[0]].reverse()),
  ],
};

export function greyOutsideCity(
  style: StyleSpecification,
  below: string,
  opacity = OUTSIDE.opacity,
): StyleSpecification {
  const at = style.layers.findIndex((l) => l.id === below);
  if (at < 0) {
    reportUnmatched(style, { [below]: 0 });
    return style;
  }
  style.sources = Object.assign({}, style.sources, {
    outside_city: { type: "geojson" as const, data: OUTSIDE_CITY },
  });
  style.layers.splice(at, 0, {
    id: "outside_city",
    type: "fill",
    source: "outside_city",
    paint: { "fill-color": OUTSIDE.color, "fill-opacity": opacity },
  });
  return style;
}

export function dotCityLine(
  style: StyleSpecification,
  at: number,
): StyleSpecification {
  style.sources = Object.assign({}, style.sources, {
    city_line: {
      type: "geojson" as const,
      data: CITY_LINE as Feature<MultiLineString>,
    },
  });
  style.layers.splice(at < 0 ? style.layers.length : at, 0, {
    id: "city_line",
    type: "line",
    source: "city_line",
    paint: {
      "line-color": OUTSIDE.line,
      "line-width": 1,
      "line-dasharray": [1, 2],
    },
  });
  return style;
}

// ── borough labels ────────────────────────────────────────────────────────────

const BOROUGH_LABELS: FeatureCollection<Point> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-73.9665, 40.7831] },
      properties: { name: "Manhattan", "name:zh": "曼哈頓", "name:ru": "Манхэттен",
        "name:bn": "ম্যানহাটন", "name:ko": "맨해튼", "name:ar": "مانهاتن" },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-73.876, 40.862] },
      properties: { name: "The Bronx", "name:es": "El Bronx", "name:zh": "布朗克斯",
        "name:ru": "Бронкс", "name:bn": "দ্য ব্রংক্স", "name:ko": "브롱크스" },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-73.7949, 40.7282] },
      properties: { name: "Queens", "name:zh": "皇后區", "name:ru": "Куинс",
        "name:bn": "কুইন্স", "name:ko": "퀸스", "name:ar": "كوينز" },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-73.959, 40.6827] },
      properties: { name: "Brooklyn", "name:zh": "布魯克林區", "name:ru": "Бруклин",
        "name:bn": "ব্রুকলিন", "name:ko": "브루클린", "name:ar": "بروكلين" },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-74.1502, 40.5795] },
      properties: { name: "Staten Island", "name:zh": "史泰登岛", "name:ru": "Статен-Айленд",
        "name:bn": "স্ট্যাটেন আইল্যান্ড", "name:ko": "스태튼아일랜드" },
    },
  ],
};

export function addBoroughLabels(
  style: StyleSpecification,
  lang: string,
  maxzoom: number,
): StyleSpecification {
  if ((style.layers || []).some((l) => l.id === "borough_label")) return style;
  style.sources = Object.assign({}, style.sources, {
    boroughs: { type: "geojson" as const, data: BOROUGH_LABELS },
  });
  (style.layers || []).push({
    id: "borough_label",
    type: "symbol",
    source: "boroughs",
    maxzoom,
    layout: {
      "text-field": nameExpression(lang),
      "text-font": ["Noto Sans Regular"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 9, 13, 12, 17],
      "text-max-width": 8,
    },
    paint: {
      "text-color": "#4a4a4a",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.4,
      "text-halo-blur": 1,
    },
  });
  return style;
}

// ── landmark labels ───────────────────────────────────────────────────────────

const LANDMARK_LABELS: FeatureCollection<Point> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-74.0445, 40.6893] },
      properties: { name: "Statue of Liberty", "name:es": "Estatua de la Libertad",
        "name:zh": "自由女神像", "name:ru": "Статуя Свободы" },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-74.0397, 40.699] },
      properties: { name: "Ellis Island", "name:es": "Isla Ellis", "name:ru": "Остров Эллис" },
    },
  ],
};

export function addLandmarkLabels(
  style: StyleSpecification,
  lang: string,
): StyleSpecification {
  if ((style.layers || []).some((l) => l.id === "landmark_label")) return style;
  style.sources = Object.assign({}, style.sources, {
    landmarks: { type: "geojson" as const, data: LANDMARK_LABELS },
  });
  (style.layers || []).push({
    id: "landmark_label",
    type: "symbol",
    source: "landmarks",
    minzoom: 13,
    layout: {
      "text-field": nameExpression(lang),
      "text-font": ["Noto Sans Italic"],
      "text-size": 12,
      "text-max-width": 7,
    },
    paint: {
      "text-color": "#666",
      "text-halo-color": "rgba(255, 255, 255, 0.8)",
      "text-halo-width": 1,
    },
  });
  return style;
}

// ── subway stations ───────────────────────────────────────────────────────────

const STATION_ZOOM = 13;
const STATION_NAME_ZOOM = 14;

export function addSubwayStations(
  style: StyleSpecification,
  url: string,
): StyleSpecification {
  if ((style.layers || []).some((l) => l.id === "subway_station")) return style;
  style.sources = Object.assign({}, style.sources, {
    subway: {
      type: "geojson" as const,
      data: url,
      attribution:
        'Subway stations: <a href="https://data.ny.gov/d/5f5g-n3cz">MTA</a>',
    },
  });
  (style.layers || []).push({
    id: "subway_station",
    type: "symbol",
    source: "subway",
    minzoom: STATION_ZOOM,
    layout: {
      "icon-image": STATION_ICON,
      "icon-size": [
        "interpolate", ["linear"], ["zoom"],
        STATION_ZOOM, 0.7, STATION_NAME_ZOOM, 1,
      ],
      "text-field": ["step", ["zoom"], "", STATION_NAME_ZOOM, ["get", "name"]],
      "text-font": ["Noto Sans Regular"],
      "text-size": 11,
      "text-max-width": 8,
      "text-variable-anchor": ["left", "right", "top", "bottom"],
      "text-radial-offset": 0.9,
      "text-justify": "auto",
      "text-optional": true,
    },
    paint: {
      "text-color": STATION_COLOR,
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.2,
    },
  });
  return style;
}

// ── warm tint ─────────────────────────────────────────────────────────────────

const WARM_HUE = 35;
const WARM_CHROMA = 0.035;
const MAX_SAT = 0.6;
const TINTABLE_L = [0.02, 0.99];
const NEUTRAL_MAX_SAT = 0.12;

interface Hsla { h: number; s: number; l: number; a: number }

function parseColor(value: unknown): Hsla | null {
  const str = String(value).trim().toLowerCase();
  let m = str.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (m) {
    const hex = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
    const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    return rgbToHsl(rgb[0], rgb[1], rgb[2], 1);
  }
  m = str.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const parts = m[1].split(/[,/\s]+/).filter(Boolean).map(parseFloat);
    if (parts.length < 3 || parts.some(Number.isNaN)) return null;
    const [r, g, b] = parts;
    return rgbToHsl(r / 255, g / 255, b / 255, parts.length > 3 ? parts[3] : 1);
  }
  m = str.match(/^hsla?\(([^)]+)\)$/);
  if (m) {
    const parts = m[1].split(/[,/\s]+/).filter(Boolean).map(parseFloat);
    if (parts.length < 3 || parts.some(Number.isNaN)) return null;
    return { h: parts[0], s: parts[1] / 100, l: parts[2] / 100, a: parts.length > 3 ? parts[3] : 1 };
  }
  return null;
}

function rgbToHsl(r: number, g: number, b: number, a: number): Hsla {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return { h, s, l, a };
}

function warmed({ s, l, a }: Hsla): string | null {
  if (s > NEUTRAL_MAX_SAT) return null;
  if (l < TINTABLE_L[0] || l > TINTABLE_L[1]) return null;
  const headroom = 1 - Math.abs(2 * l - 1);
  const sat = Math.min(WARM_CHROMA / headroom, MAX_SAT);
  const satPct = (sat * 100).toFixed(1);
  const light = (l * 100).toFixed(1);
  return a >= 1
    ? `hsl(${WARM_HUE}, ${satPct}%, ${light}%)`
    : `hsla(${WARM_HUE}, ${satPct}%, ${light}%, ${a})`;
}

function tintValue(value: unknown, counter: { n: number }): unknown {
  if (Array.isArray(value)) return value.map((v) => tintValue(v, counter));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, tintValue(v, counter)]),
    );
  }
  if (typeof value !== "string") return value;
  const parsed = parseColor(value);
  if (!parsed) return value;
  const next = warmed(parsed);
  if (!next) return value;
  counter.n++;
  return next;
}

export function warmTint(
  style: StyleSpecification,
  options: { water?: string; park?: string } = {},
): StyleSpecification {
  const { water, park } = options;
  const counter = { n: 0 };
  const setColor = (layer: LayerSpecification, color?: string) => {
    if (!color || !layer.paint) return;
    for (const prop of Object.keys(layer.paint)) {
      if (prop.includes("color"))
        (layer.paint as Record<string, unknown>)[prop] = color;
    }
  };
  for (const layer of style.layers || []) {
    if (layer.type === "symbol") continue;
    if (/water/.test(layer.id || "")) { setColor(layer, water); continue; }
    if (/park|wood/.test(layer.id || "")) { setColor(layer, park); continue; }
    if (/cemetery/.test(layer.id || "")) continue;
    if (layer.type === "background" && layer.paint == null) continue;
    for (const [prop, value] of Object.entries(layer.paint || {})) {
      if (!prop.includes("color")) continue;
      (layer.paint as Record<string, unknown>)[prop] = tintValue(value, counter);
    }
  }
  return style;
}
