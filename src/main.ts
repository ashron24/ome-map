import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";

import { Map as MlMap, NavigationControl, ScaleControl } from "maplibre-gl";
import {
  BASEMAPS,
  DEFAULT_BASEMAP,
  makeInitialStyle,
} from "./map/basemaps.ts";
import type { BasemapId } from "./map/basemaps.ts";
import { DISTRICTS } from "./map/districts.ts";
import {
  ensureDistrictSource,
  setDistrictVisible,
} from "./map/layers.ts";
import { POIS } from "./map/pois.ts";
import { ensurePOISource, setPOIVisible } from "./map/pois.ts";
import {
  METRICS,
  ensureDemographicsSource,
  setDemographicMetric,
} from "./map/demographics.ts";
import { mountLayerPanel } from "./ui/layerPanel.ts";
import {
  debounce,
  parseHash,
  writeHash,
  emptyState,
} from "./state/urlState.ts";
import type { AppState } from "./state/urlState.ts";

const NYC_CENTER: [number, number] = [-73.9796, 40.7033];
const BASEMAP_LAYER_ID = "basemap";
const BASEMAP_SOURCE_ID = "basemap";

const initialState = parseHash(window.location.hash);
const initialBasemap =
  BASEMAPS.find((b) => b.id === initialState.basemap) ??
  BASEMAPS.find((b) => b.id === DEFAULT_BASEMAP)!;

const map = new MlMap({
  container: "map",
  style: makeInitialStyle(initialBasemap),
  center: initialState.center ?? NYC_CENTER,
  zoom: initialState.zoom ?? 10.5,
  minZoom: 9,
  maxZoom: 18,
});

map.addControl(new NavigationControl({ visualizePitch: false }), "top-right");
map.addControl(new ScaleControl({ unit: "imperial" }), "bottom-left");

const state: AppState = {
  ...emptyState(),
  basemap: initialBasemap.id,
};

function snapshotState(): AppState {
  const c = map.getCenter();
  return {
    zoom: map.getZoom(),
    center: [c.lng, c.lat],
    basemap: state.basemap,
    districts: state.districts,
    pois: state.pois,
    metric: state.metric,
  };
}

const persist = debounce(() => writeHash(snapshotState()), 250);

map.on("moveend", persist);

function setBasemap(id: BasemapId) {
  const def = BASEMAPS.find((b) => b.id === id);
  if (!def) return;
  state.basemap = id;

  if (map.getLayer(BASEMAP_LAYER_ID)) map.removeLayer(BASEMAP_LAYER_ID);
  if (map.getSource(BASEMAP_SOURCE_ID)) map.removeSource(BASEMAP_SOURCE_ID);

  map.addSource(BASEMAP_SOURCE_ID, {
    type: "raster",
    tiles: def.tiles,
    tileSize: def.tileSize,
    attribution: def.attribution,
    maxzoom: def.maxzoom,
  });

  const firstOther = map
    .getStyle()
    .layers.find((l) => l.id !== BASEMAP_LAYER_ID)?.id;

  map.addLayer(
    { id: BASEMAP_LAYER_ID, type: "raster", source: BASEMAP_SOURCE_ID },
    firstOther,
  );

  persist();
}

function mountPanel() {
  const panel = document.getElementById("panel");
  if (!panel) return;
  mountLayerPanel(panel, {
    map,
    onBasemapChange: setBasemap,
    initialBasemap: state.basemap ?? DEFAULT_BASEMAP,
    activeDistricts: state.districts,
    activePOIs: state.pois,
    onChange: persist,
    initialMetric: initialState.metric,
  });
}

async function applyInitialLayers() {
  // Districts
  for (const id of initialState.districts) {
    const def = DISTRICTS.find((d) => d.id === id);
    if (!def) continue;
    state.districts.add(id);
    await ensureDistrictSource(map, def);
    setDistrictVisible(map, def, true);
  }
  // POIs
  for (const id of initialState.pois) {
    const def = POIS.find((p) => p.id === id);
    if (!def) continue;
    state.pois.add(id);
    await ensurePOISource(map, def);
    setPOIVisible(map, def, true);
  }
  // Demographic metric
  if (initialState.metric) {
    const m = METRICS.find((x) => x.id === initialState.metric);
    if (m) {
      state.metric = m.id;
      await ensureDemographicsSource(map);
      setDemographicMetric(map, m);
    }
  }
}

function setupPanelToggle() {
  const toggle = document.getElementById("panel-toggle");
  const panel = document.getElementById("panel");
  if (!toggle || !panel) return;

  const isMobile = () => window.matchMedia("(max-width: 640px)").matches;
  // Start collapsed on mobile, open on desktop
  if (isMobile()) panel.classList.add("panel-collapsed");

  toggle.addEventListener("click", () => {
    panel.classList.toggle("panel-collapsed");
  });
}

mountPanel();
setupPanelToggle();
void applyInitialLayers();

(window as unknown as { __map: MlMap; __state: AppState }).__map = map;
(window as unknown as { __map: MlMap; __state: AppState }).__state = state;
