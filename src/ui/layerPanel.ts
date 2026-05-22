import type { Map as MlMap } from "maplibre-gl";
import { BASEMAPS, DEFAULT_BASEMAP } from "../map/basemaps.ts";
import type { BasemapId } from "../map/basemaps.ts";
import { DISTRICTS } from "../map/districts.ts";
import type { DistrictDef } from "../map/districts.ts";
import {
  ensureDistrictSource,
  setDistrictVisible,
} from "../map/layers.ts";
import { POIS } from "../map/pois.ts";
import type { POIDef } from "../map/pois.ts";
import { ensurePOISource, setPOIVisible } from "../map/pois.ts";
import { METRICS } from "../map/demographics.ts";
import type { DemographicMetric } from "../map/demographics.ts";
import {
  ensureDemographicsSource,
  setDemographicMetric,
} from "../map/demographics.ts";

type PanelDeps = {
  map: MlMap;
  onBasemapChange: (id: BasemapId) => void;
  initialBasemap?: BasemapId;
  activeDistricts: Set<string>;
  activePOIs: Set<string>;
  onChange?: () => void;
  initialMetric?: string;
};

let onChangeCallback: (() => void) | undefined;

function notifyChange(): void {
  onChangeCallback?.();
}

export function mountLayerPanel(root: HTMLElement, deps: PanelDeps): void {
  const initialBasemap = deps.initialBasemap ?? DEFAULT_BASEMAP;
  const activeDistricts = deps.activeDistricts;
  const activePOIs = deps.activePOIs;
  onChangeCallback = deps.onChange;

  root.innerHTML = "";

  const title = document.createElement("h1");
  title.textContent = "MOME Map";
  root.appendChild(title);

  const subtitle = document.createElement("p");
  subtitle.className = "subtitle";
  subtitle.innerHTML =
    "Open-source rebuild of the CAU Outreach Map &mdash; public data only";
  root.appendChild(subtitle);

  root.appendChild(
    buildGroup({
      title: "Basemap",
      collapsed: false,
      body: buildBasemapList(initialBasemap, deps.onBasemapChange),
    }),
  );

  root.appendChild(
    buildGroup({
      title: "Districts",
      collapsed: false,
      body: buildDistrictList(
        DISTRICTS.filter((d) => d.group === "core"),
        deps.map,
        activeDistricts,
      ),
    }),
  );

  root.appendChild(
    buildGroup({
      title: "More Districts",
      collapsed: true,
      body: buildDistrictList(
        DISTRICTS.filter((d) => d.group === "extra"),
        deps.map,
        activeDistricts,
      ),
    }),
  );

  root.appendChild(
    buildGroup({
      title: "Facilities & Infrastructure",
      collapsed: false,
      body: buildPOIList(
        POIS.filter((p) => p.group === "facilities"),
        deps.map,
        activePOIs,
      ),
    }),
  );

  root.appendChild(
    buildGroup({
      title: "Outreach & Services",
      collapsed: true,
      body: buildPOIList(
        POIS.filter((p) => p.group === "services"),
        deps.map,
        activePOIs,
      ),
    }),
  );

  root.appendChild(
    buildGroup({
      title: "Demographics (ACS)",
      collapsed: !deps.initialMetric,
      body: buildDemographicsControls(deps.map, deps.initialMetric),
    }),
  );
}

function buildGroup(opts: {
  title: string;
  collapsed: boolean;
  body: HTMLElement;
}): HTMLElement {
  const group = document.createElement("section");
  group.className = "group" + (opts.collapsed ? " collapsed" : "");

  const header = document.createElement("div");
  header.className = "group-header";
  header.innerHTML = `<h2>${opts.title}</h2><span class="caret">&#x25BC;</span>`;
  header.addEventListener("click", () => group.classList.toggle("collapsed"));

  const body = document.createElement("div");
  body.className = "group-body";
  body.appendChild(opts.body);

  group.appendChild(header);
  group.appendChild(body);
  return group;
}

function buildBasemapList(
  initial: BasemapId,
  onChange: (id: BasemapId) => void,
): HTMLElement {
  const list = document.createElement("div");
  for (const b of BASEMAPS) {
    const row = document.createElement("label");
    row.className = "layer-row";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "basemap";
    input.value = b.id;
    input.checked = b.id === initial;
    input.addEventListener("change", () => {
      if (input.checked) {
        onChange(b.id);
        notifyChange();
      }
    });

    const label = document.createElement("span");
    label.className = "layer-label";
    label.textContent = b.label;

    row.appendChild(input);
    row.appendChild(label);
    list.appendChild(row);
  }
  return list;
}

function buildDistrictList(
  defs: DistrictDef[],
  map: MlMap,
  active: Set<string>,
): HTMLElement {
  const list = document.createElement("div");
  for (const d of defs) {
    list.appendChild(buildDistrictRow(d, map, active));
  }
  return list;
}

function buildDistrictRow(
  def: DistrictDef,
  map: MlMap,
  active: Set<string>,
): HTMLElement {
  const row = document.createElement("label");
  row.className = "layer-row";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = active.has(def.id);

  const swatch = document.createElement("span");
  swatch.className = "swatch line" + (def.dash ? " dashed" : "");
  swatch.style.background = def.dash ? "transparent" : def.color;
  swatch.style.color = def.color;
  swatch.style.borderColor = def.color;

  const label = document.createElement("span");
  label.className = "layer-label";
  label.textContent = def.label;

  input.addEventListener("change", async () => {
    if (input.checked) {
      active.add(def.id);
      await ensureDistrictSource(map, def);
      setDistrictVisible(map, def, true);
    } else {
      active.delete(def.id);
      setDistrictVisible(map, def, false);
    }
    notifyChange();
  });

  row.appendChild(input);
  row.appendChild(swatch);
  row.appendChild(label);
  return row;
}

function buildPOIList(
  defs: POIDef[],
  map: MlMap,
  active: Set<string>,
): HTMLElement {
  const list = document.createElement("div");
  for (const d of defs) {
    list.appendChild(buildPOIRow(d, map, active));
  }
  return list;
}

function buildPOIRow(
  def: POIDef,
  map: MlMap,
  active: Set<string>,
): HTMLElement {
  const row = document.createElement("label");
  row.className = "layer-row";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = active.has(def.id);

  const swatch = document.createElement("span");
  swatch.className = "swatch " + swatchClass(def);
  swatch.style.background = def.geomType === "line" ? "transparent" : def.color;
  swatch.style.color = def.color;
  swatch.style.borderColor = def.color;

  const label = document.createElement("span");
  label.className = "layer-label";
  label.textContent = def.label;

  input.addEventListener("change", async () => {
    if (input.checked) {
      active.add(def.id);
      await ensurePOISource(map, def);
      setPOIVisible(map, def, true);
    } else {
      active.delete(def.id);
      setPOIVisible(map, def, false);
    }
    notifyChange();
  });

  row.appendChild(input);
  row.appendChild(swatch);
  row.appendChild(label);
  return row;
}

function swatchClass(def: POIDef): string {
  if (def.geomType === "line") return "line";
  if (def.geomType === "point") return "dot";
  return "poly";
}

function buildDemographicsControls(
  map: MlMap,
  initialMetric: string | undefined,
): HTMLElement {
  const container = document.createElement("div");

  const noneRow = document.createElement("label");
  noneRow.className = "layer-row";
  const noneInput = document.createElement("input");
  noneInput.type = "radio";
  noneInput.name = "demographic-metric";
  noneInput.value = "";
  noneInput.checked = !initialMetric;
  const noneLabel = document.createElement("span");
  noneLabel.className = "layer-label";
  noneLabel.textContent = "None";
  noneRow.appendChild(noneInput);
  noneRow.appendChild(noneLabel);
  container.appendChild(noneRow);

  for (const metric of METRICS) {
    container.appendChild(buildMetricRow(metric, map, initialMetric === metric.id));
  }

  const legend = document.createElement("div");
  legend.id = "demographics-legend";
  legend.className = "demographics-legend";
  legend.style.display = "none";
  container.appendChild(legend);

  noneInput.addEventListener("change", () => {
    if (!noneInput.checked) return;
    setDemographicMetric(map, null);
    renderLegend(null);
    notifyMetric(null);
  });

  // If initialMetric is set, render its legend (the radio is already checked above)
  if (initialMetric) {
    const m = METRICS.find((mm) => mm.id === initialMetric);
    if (m) renderLegend(m);
  }

  return container;
}

function notifyMetric(metricId: string | null): void {
  // hook into urlState via window.__state mutation if available
  const w = window as unknown as { __state?: { metric?: string } };
  if (w.__state) {
    w.__state.metric = metricId ?? undefined;
  }
  notifyChange();
}

function buildMetricRow(
  metric: DemographicMetric,
  map: MlMap,
  initiallyChecked: boolean,
): HTMLElement {
  const row = document.createElement("label");
  row.className = "layer-row";

  const input = document.createElement("input");
  input.type = "radio";
  input.name = "demographic-metric";
  input.value = metric.id;
  input.checked = initiallyChecked;

  const ramp = document.createElement("span");
  ramp.className = "swatch ramp";
  ramp.style.background = `linear-gradient(to right, ${metric.colors.slice(1).join(", ")})`;

  const label = document.createElement("span");
  label.className = "layer-label";
  label.textContent = metric.label;

  input.addEventListener("change", async () => {
    if (!input.checked) return;
    await ensureDemographicsSource(map);
    setDemographicMetric(map, metric);
    renderLegend(metric);
    notifyMetric(metric.id);
  });

  row.appendChild(input);
  row.appendChild(ramp);
  row.appendChild(label);
  return row;
}

function renderLegend(metric: DemographicMetric | null): void {
  const el = document.getElementById("demographics-legend");
  if (!el) return;
  if (!metric) {
    el.style.display = "none";
    el.innerHTML = "";
    return;
  }
  el.style.display = "block";
  const swatches = metric.colors
    .map((c, i) => {
      const lo = i === 0 ? null : metric.breaks[i - 1];
      const hi = i < metric.breaks.length ? metric.breaks[i] : null;
      const fmt = (v: number) =>
        metric.type === "currency"
          ? `$${(v / 1000).toFixed(0)}k`
          : `${v}%`;
      let labelText: string;
      if (lo === null) labelText = `< ${fmt(hi as number)}`;
      else if (hi === null) labelText = `≥ ${fmt(lo)}`;
      else labelText = `${fmt(lo)}–${fmt(hi)}`;
      const swatchStyle = c === "rgba(0,0,0,0)"
        ? "background: repeating-linear-gradient(45deg, #ddd 0 3px, #fff 3px 6px);"
        : `background: ${c};`;
      return `<div class="legend-row"><span class="legend-sw" style="${swatchStyle}"></span><span class="legend-label">${labelText}</span></div>`;
    })
    .join("");
  el.innerHTML = `<div class="legend-title">${metric.label}</div>${swatches}`;
}
