import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";

import { Map as MlMap, NavigationControl, ScaleControl } from "maplibre-gl";
import {
  BASEMAPS,
  DEFAULT_BASEMAP,
  loadBasemapStyle,
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
import {
  ETHNICITY_LAYERS,
  ensureEthnicityCentroidsSource,
  setEthnicityLayerVisible,
} from "./map/ethnicityLayers.ts";
import {
  HEATMAPS,
  ensureHeatmapSource,
  setHeatmapVisible,
} from "./map/heatmaps.ts";
import { mountLayerPanel } from "./ui/layerPanel.ts";
import {
  debounce,
  parseHash,
  writeHash,
  emptyState,
} from "./state/urlState.ts";
import type { AppState } from "./state/urlState.ts";
import { STATION_ICON, stationIcon } from "./map/basemap-style.ts";

const NYC_CENTER: [number, number] = [-73.9796, 40.7033];

const initialState = parseHash(window.location.hash);
const initialBasemapDef =
  BASEMAPS.find((b) => b.id === initialState.basemap) ??
  BASEMAPS.find((b) => b.id === DEFAULT_BASEMAP)!;

const initialStyle = await loadBasemapStyle(initialBasemapDef);

const map = new MlMap({
  container: "map",
  style: initialStyle,
  center: initialState.center ?? NYC_CENTER,
  zoom: initialState.zoom ?? 10.5,
  minZoom: 9,
  maxZoom: 18,
});

map.addControl(new NavigationControl({ visualizePitch: false }), "top-right");
map.addControl(new ScaleControl({ unit: "imperial" }), "bottom-left");

// Register the subway station icon whenever the style (re)loads.
map.on("style.load", () => {
  if (!map.hasImage(STATION_ICON)) {
    map.addImage(STATION_ICON, stationIcon(), { pixelRatio: 2 });
  }
});

const state: AppState = {
  ...emptyState(),
  basemap: initialBasemapDef.id,
  ethnicities: new Set(initialState.ethnicities),
  heatmaps: new Set(initialState.heatmaps),
};

function snapshotState(): AppState {
  const c = map.getCenter();
  return {
    zoom: map.getZoom(),
    center: [c.lng, c.lat],
    basemap: state.basemap,
    districts: state.districts,
    pois: state.pois,
    heatmaps: state.heatmaps,
    metric: state.metric,
    ethnicities: state.ethnicities,
  };
}

const persist = debounce(() => writeHash(snapshotState()), 250);

map.on("moveend", persist);

// Re-add all active overlay layers after a style swap.
async function restoreOverlays() {
  for (const id of state.districts) {
    const def = DISTRICTS.find((d) => d.id === id);
    if (!def) continue;
    await ensureDistrictSource(map, def);
    setDistrictVisible(map, def, true);
  }
  for (const id of state.pois) {
    const def = POIS.find((p) => p.id === id);
    if (!def) continue;
    await ensurePOISource(map, def);
    setPOIVisible(map, def, true);
  }
  if (state.metric) {
    const m = METRICS.find((x) => x.id === state.metric);
    if (m) {
      await ensureDemographicsSource(map);
      setDemographicMetric(map, m);
    }
  }
  if (state.ethnicities.size > 0) {
    await ensureEthnicityCentroidsSource(map);
    for (const id of state.ethnicities) {
      const def = ETHNICITY_LAYERS.find((l) => l.id === id);
      if (!def) continue;
      setEthnicityLayerVisible(map, def, true);
    }
  }
  for (const id of state.heatmaps) {
    const def = HEATMAPS.find((h) => h.id === id);
    if (!def) continue;
    await ensureHeatmapSource(map, def);
    setHeatmapVisible(map, def, true);
  }
}

async function setBasemap(id: BasemapId) {
  const def = BASEMAPS.find((b) => b.id === id);
  if (!def) return;
  state.basemap = id;

  const newStyle = await loadBasemapStyle(def);
  map.setStyle(newStyle);

  // Wait for the new style to be fully applied before restoring overlays.
  map.once("style.load", () => {
    void restoreOverlays();
    persist();
  });
}

function mountPanel() {
  const panel = document.getElementById("panel");
  if (!panel) return;
  mountLayerPanel(panel, {
    map,
    onBasemapChange: (id) => void setBasemap(id),
    initialBasemap: state.basemap ?? DEFAULT_BASEMAP,
    activeDistricts: state.districts,
    activePOIs: state.pois,
    activeHeatmaps: state.heatmaps,
    activeEthnicities: state.ethnicities,
    onChange: persist,
    initialMetric: initialState.metric,
    initialEthnicities: initialState.ethnicities,
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
  // Ethnicity layers
  if (initialState.ethnicities.size > 0) {
    await ensureEthnicityCentroidsSource(map);
    for (const id of initialState.ethnicities) {
      const def = ETHNICITY_LAYERS.find((l) => l.id === id);
      if (!def) continue;
      state.ethnicities.add(id);
      setEthnicityLayerVisible(map, def, true);
    }
  }
  // Heatmap layers
  for (const id of initialState.heatmaps) {
    const def = HEATMAPS.find((h) => h.id === id);
    if (!def) continue;
    state.heatmaps.add(id);
    await ensureHeatmapSource(map, def);
    setHeatmapVisible(map, def, true);
  }
}

function setupPanelToggle() {
  const toggle = document.getElementById("panel-toggle");
  const panel = document.getElementById("panel");
  if (!toggle || !panel) return;

  const isMobile = () => window.matchMedia("(max-width: 640px)").matches;
  if (isMobile()) panel.classList.add("panel-collapsed");

  toggle.addEventListener("click", () => {
    panel.classList.toggle("panel-collapsed");
  });
}

mountPanel();
setupPanelToggle();

// applyInitialLayers needs the style to be ready first.
map.once("style.load", () => void applyInitialLayers());

(window as unknown as { __map: MlMap; __state: AppState }).__map = map;
(window as unknown as { __map: MlMap; __state: AppState }).__state = state;
