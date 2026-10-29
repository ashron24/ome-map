import type { Map as MlMap, MapGeoJSONFeature } from "maplibre-gl";
import { Popup } from "maplibre-gl";
import type { DistrictDef } from "./districts.ts";
import { registerDynamicLabels, refreshDynamicLabels, zoomStopsExpression } from "./dynamicLabels.ts";
import type { ZoomStops } from "./dynamicLabels.ts";
import { dataUrl } from "../util/url.ts";

let cdWebsitesCache: Record<string, string> | null = null;
async function loadCdWebsites(): Promise<Record<string, string>> {
  if (cdWebsitesCache) return cdWebsitesCache;
  try {
    const res = await fetch(dataUrl("data/cd-websites.json"));
    if (res.ok) cdWebsitesCache = await res.json() as Record<string, string>;
  } catch { /* non-fatal */ }
  return cdWebsitesCache ?? {};
}

type ElectedOfficial = { name: string; title: string; party: string; website: string };
type CbEntry = { chair_name?: string; chair_website?: string; manager_name?: string; manager_website?: string; meeting?: string; contact?: string };
type DistrictOfficials = {
  sa: Record<string, ElectedOfficial>;
  ss: Record<string, ElectedOfficial>;
  cc: Record<string, ElectedOfficial>;
  nycongress: Record<string, ElectedOfficial>;
  cd: Record<string, CbEntry>;
};

let officialsCache: DistrictOfficials | null = null;
async function loadOfficials(): Promise<DistrictOfficials> {
  if (officialsCache) return officialsCache;
  try {
    const res = await fetch(dataUrl("data/district-officials.json"));
    if (res.ok) officialsCache = await res.json() as DistrictOfficials;
  } catch { /* non-fatal */ }
  return officialsCache ?? { sa: {}, ss: {}, cc: {}, nycongress: {}, cd: {} };
}

const FILL_SUFFIX = "-fill";
const LINE_SUFFIX = "-line";
const LABEL_SUFFIX = "-label";

export const sourceId = (id: string) => `district-${id}`;
export const fillLayerId = (id: string) => `district-${id}${FILL_SUFFIX}`;
export const lineLayerId = (id: string) => `district-${id}${LINE_SUFFIX}`;
export const labelLayerId = (id: string) => `district-${id}${LABEL_SUFFIX}`;
const labelSourceId = (id: string) => `district-${id}-labels`;

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
      "fill-opacity": 0,
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
  map.addSource(labelSrc, { type: "geojson", data: { type: "FeatureCollection", features: [] } });

  const small = def.id === "nta" || def.id === "zipcode";
  const textSize: ZoomStops = small
    ? [[10, 9], [12, 12], [14, 16]]
    : [[10, 13], [12, 17], [14, 22]];
  const maxWidthEms = def.labelMaxWidth ?? 10;

  map.addLayer({
    id: labelLayerId(def.id),
    type: "symbol",
    source: labelSrc,
    layout: {
      "text-field": def.labelPrefix
        ? ["concat", def.labelPrefix, ["coalesce", ["get", "nameCol"], ""]]
        : ["coalesce", ["get", "nameCol"], ""],
      "text-font": ["Noto Sans Bold"],
      "text-size": zoomStopsExpression(textSize),
      "text-allow-overlap": false,
      "text-padding": 4,
      "text-max-width": maxWidthEms,
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

  // Label points follow the viewport — see dynamicLabels.ts
  await registerDynamicLabels(map, {
    sourceId: labelSrc,
    layerId: labelLayerId(def.id),
    url: def.source,
    nameKey: "nameCol",
    text: (p) => (def.labelPrefix ?? "") + ((p?.["nameCol"] as string | undefined) ?? ""),
    textSize,
    maxWidthEms,
  });

  wireInteractivity(map, def);
}

function wireInteractivity(map: MlMap, def: DistrictDef): void {
  let popup: Popup | null = null;

  const fill = fillLayerId(def.id);

  map.on("mousemove", fill, (e) => {
    if (!e.features?.length) return;
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", fill, () => {
    map.getCanvas().style.cursor = "";
  });

  map.on("click", fill, async (e) => {
    if (!e.features?.length) return;
    const f = e.features[0] as MapGeoJSONFeature;
    const props = f.properties as { nameCol?: string; nameAlt?: string | null };
    const name = props.nameCol ?? "(unnamed)";
    const alt = props.nameAlt ? `<dt>Alt</dt><dd>${escapeHtml(props.nameAlt)}</dd>` : "";
    const attribution = `<a class="attribution-link" href="${def.attribution.href}" target="_blank" rel="noopener">${escapeHtml(def.attribution.name)}</a>`;

    let extraRows = "";

    if (def.id === "cd") {
      const [websites, officials] = await Promise.all([loadCdWebsites(), loadOfficials()]);
      const cdUrl = websites[name];
      if (cdUrl) {
        extraRows += `<dt>Website</dt><dd><a class="popup-link" href="${escapeHtml(cdUrl)}" target="_blank" rel="noopener">${escapeHtml(cdUrl)}</a></dd>`;
      }
      const cb = officials.cd[name];
      if (cb) {
        if (cb.chair_name) {
          extraRows += `<dt>Chair</dt><dd>${escapeHtml(cb.chair_name)}`;
          if (cb.chair_website) extraRows += ` &mdash; <a class="popup-link" href="${escapeHtml(cb.chair_website)}" target="_blank" rel="noopener">website</a>`;
          extraRows += `</dd>`;
        }
        if (cb.manager_name) {
          extraRows += `<dt>District Manager</dt><dd>${escapeHtml(cb.manager_name)}`;
          if (cb.manager_website) extraRows += ` &mdash; <a class="popup-link" href="${escapeHtml(cb.manager_website)}" target="_blank" rel="noopener">website</a>`;
          extraRows += `</dd>`;
        }
        if (cb.meeting) extraRows += `<dt>Meeting</dt><dd>${escapeHtml(cb.meeting).replace(/\n/g, "<br>")}</dd>`;
        if (cb.contact) extraRows += `<dt>Contact</dt><dd>${escapeHtml(cb.contact).replace(/\n/g, "<br>")}</dd>`;
      }
    } else if (def.id === "sa" || def.id === "ss" || def.id === "cc" || def.id === "nycongress") {
      const officials = await loadOfficials();
      const record = officials[def.id as keyof typeof officials] as Record<string, ElectedOfficial>;
      const official = record[name];
      if (official) {
        extraRows += `<dt>${escapeHtml(official.title)}</dt><dd>${escapeHtml(official.name)}</dd>`;
        if (official.party) extraRows += `<dt>Party</dt><dd>${escapeHtml(official.party)}</dd>`;
        if (official.website) extraRows += `<dt>Website</dt><dd><a class="popup-link" href="${escapeHtml(official.website)}" target="_blank" rel="noopener">${escapeHtml(official.website)}</a></dd>`;
      }
    }

    popup?.remove();
    popup = new Popup({ closeOnClick: true })
      .setLngLat(e.lngLat)
      .setHTML(
        `<div><strong>${escapeHtml(def.label)}</strong></div>` +
          `<dl><dt>${escapeHtml(def.labelPrefix?.trim() ?? "Name")}</dt><dd>${escapeHtml(name)}</dd>${alt}${extraRows}</dl>` +
          `<div style="margin-top:6px;font-size:11px;color:#999;">Source: ${attribution}</div>`,
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
  if (visible) refreshDynamicLabels(map, labelLayerId(def.id));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
