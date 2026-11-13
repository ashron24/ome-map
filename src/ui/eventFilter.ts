/**
 * Filter bars for event layers, shown at the top of the map while their layer
 * is on. Each bar filters its layer by the fields in its FilterConfig (a
 * checklist, a date range or a number range): any checked value within one
 * field, all fields together. Each bar also exports what it shows to Excel.
 *
 * Matching is decided here, once, and the layer is told which features to
 * draw by their generated ids (their index in the GeoJSON), so the count in
 * the bar always agrees with the map.
 */
import type { Map as MlMap, FilterSpecification } from "maplibre-gl";
import { POIS, onPOIVisibilityChange, setPOIFilter } from "../map/pois.ts";
import type { POIDef, POIId } from "../map/pois.ts";
import { dataUrl } from "../util/url.ts";
import type { Cell, Column } from "../util/xlsx.ts";

type Props = Record<string, unknown>;

type Field =
  | {
    kind: "choice";
    /** URL hash key holding the checked values, comma-separated */
    key: string;
    label: string;
    prop: string;
    /** The property holds several comma-separated values, e.g. "SBS, FDNY" */
    multi?: boolean;
    /** Show how many features have each value */
    counts?: boolean;
    /** Size the dropdown to its values instead of the usual minimum width */
    narrow?: boolean;
    /** Values listed first, in this order; the rest follow alphabetically */
    order?: (def: POIDef) => string[];
    /** A small symbol before each value */
    swatch?: (value: string, def: POIDef) => HTMLElement | null;
  }
  | { kind: "date"; key: string; label: string; prop: string }
  | { kind: "number"; key: string; label: string; prop: string; presets: number[] };

type ExportColumn = Column & { value: (p: Props, f: GeoJSON.Feature) => Cell };

export type FilterConfig = {
  layer: POIId;
  /** Shown at the start of the bar */
  title: string;
  /** Plural noun in the count, e.g. "12 events" */
  noun: string;
  fields: Field[];
  export: { sheet: string; file: string; columns: ExportColumn[] };
};

const str = (p: Props, k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
const lon = (_: Props, f: GeoJSON.Feature) => (f.geometry?.type === "Point" ? round6(f.geometry.coordinates[0]) : null);
const lat = (_: Props, f: GeoJSON.Feature) => (f.geometry?.type === "Point" ? round6(f.geometry.coordinates[1]) : null);

/** The layer's icon as a mask, filled with the legend color for the value. */
function tintedIconSwatch(value: string, def: POIDef): HTMLElement {
  const s = document.createElement("span");
  s.className = "ef-swatch";
  s.style.backgroundColor = def.legend?.find((l) => l.label === value)?.color ?? def.color;
  if (def.icon) {
    const url = `url("${dataUrl(def.icon)}")`;
    s.style.maskImage = url;
    s.style.webkitMaskImage = url;
  }
  return s;
}

/** The icon the layer draws for one of its iconByCategory categories. */
function categoryIconSwatch(category: string, def: POIDef): HTMLElement | null {
  const icon = def.iconByCategory?.icons.find(([k]) => k === category)?.[1];
  if (!icon) return null;
  const img = document.createElement("img");
  img.className = "ef-swatch-img";
  img.src = dataUrl(icon);
  img.alt = "";
  return img;
}

export const FILTERS: FilterConfig[] = [
  {
    layer: "outreach-events",
    title: "Filter events",
    noun: "events",
    fields: [
      {
        kind: "choice", key: "et", label: "Event type", prop: "event_type", counts: true,
        order: (def) => (def.legend ?? []).map((l) => l.label),
        swatch: tintedIconSwatch,
      },
      { kind: "date", key: "ed", label: "Date", prop: "date_iso" },
      { kind: "choice", key: "ea", label: "Agency", prop: "agency", multi: true, narrow: true },
      { kind: "number", key: "eu", label: "Audience", prop: "audience", presets: [50, 100, 500, 1000] },
    ],
    export: {
      sheet: "Events & Outreach",
      file: "events-outreach",
      columns: [
        { header: "Event", width: 40, value: (p) => str(p, "name") },
        { header: "Date", width: 17, value: (p) => (str(p, "date_iso") ? { date: str(p, "date_iso") } : null) },
        { header: "Event Type", width: 26, value: (p) => str(p, "event_type") },
        { header: "Agency", width: 18, value: (p) => str(p, "agency") },
        { header: "Location", width: 36, value: (p) => str(p, "location") },
        { header: "Address", width: 36, value: (p) => str(p, "address") },
        { header: "Approx. Audience", width: 16, value: (p) => (typeof p.audience === "number" ? p.audience : null) },
        { header: "Details", width: 60, value: (p) => str(p, "details") },
        { header: "Link", width: 36, value: (p) => (str(p, "link") ? { link: str(p, "link") } : null) },
        { header: "Latitude", width: 11, value: lat },
        { header: "Longitude", width: 11, value: lon },
      ],
    },
  },
  {
    layer: "ome-events",
    title: "Filter OME events",
    noun: "sessions",
    fields: [
      {
        kind: "choice", key: "ot", label: "Event type", prop: "event_type", counts: true,
        order: () => ["Canvassing", "Event", "NYC 101"],
        // Canvassing has the building pin; Event and NYC 101 the apple
        swatch: (value, def) => categoryIconSwatch(value === "Canvassing" ? "canvass" : "event", def),
      },
      { kind: "date", key: "od", label: "Date", prop: "date_iso" },
      { kind: "choice", key: "oc", label: "Campaign", prop: "campaign", narrow: true },
      { kind: "choice", key: "on", label: "Neighborhood", prop: "neighborhood", narrow: true },
    ],
    export: {
      sheet: "OME Events & Canvasses",
      file: "ome-events-canvasses",
      columns: [
        { header: "Event", width: 44, value: (p) => str(p, "name") },
        { header: "Date", width: 17, value: (p) => (str(p, "date_iso") ? { date: str(p, "date_iso") } : null) },
        { header: "Time", width: 18, value: (p) => str(p, "time") },
        { header: "Type", width: 12, value: (p) => str(p, "event_type") },
        { header: "Campaign", width: 16, value: (p) => str(p, "campaign") },
        { header: "Location", width: 36, value: (p) => str(p, "location") },
        { header: "Address", width: 44, value: (p) => str(p, "address") },
        { header: "Neighborhood", width: 22, value: (p) => str(p, "neighborhood") },
        { header: "Latitude", width: 11, value: lat },
        { header: "Longitude", width: 11, value: lon },
      ],
    },
  },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type EventFilterHandle = {
  layer: POIId;
  /** Hash params for a shareable link: only the fields that narrow the layer */
  params(): Record<string, string>;
};

/** Per-field filter state: checked values, or a from/to range */
type FieldState =
  | { kind: "choice"; selected: Set<string> }
  | { kind: "range"; lo: string; hi: string }; // dates as YYYY-MM-DD, numbers as text; "" = open

export function mountEventFilter(
  map: MlMap,
  root: HTMLElement,
  config: FilterConfig,
  opts: { initial: Record<string, string>; onChange: () => void },
): EventFilterHandle {
  const def = POIS.find((p) => p.id === config.layer);
  if (!def) return { layer: config.layer, params: () => ({}) };

  // Starting state from a shared link; bad values are dropped
  const states: FieldState[] = config.fields.map((f) => {
    const raw = opts.initial[f.key] ?? "";
    if (f.kind === "choice") {
      return { kind: "choice", selected: new Set(raw.split(",").map((v) => v.trim()).filter(Boolean)) };
    }
    const [lo = "", hi = ""] = raw.split("..");
    const ok = f.kind === "date"
      ? (v: string) => ISO_DATE.test(v)
      : (v: string) => v !== "" && Number.isFinite(Number(v));
    return { kind: "range", lo: ok(lo) ? lo : "", hi: ok(hi) ? hi : "" };
  });

  let features: GeoJSON.Feature[] | null = null;
  let loading: Promise<void> | null = null;

  // ── DOM ───────────────────────────────────────────────────────────────────

  const bar = document.createElement("div");
  bar.className = "event-filter";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", `Filter ${def.label}`);
  bar.hidden = true;

  const title = document.createElement("span");
  title.className = "ef-title";
  title.textContent = config.title;

  const controls = document.createElement("div");
  controls.className = "ef-controls";

  const count = document.createElement("span");
  count.className = "ef-count";
  count.setAttribute("aria-live", "polite");

  const clearAll = document.createElement("button");
  clearAll.type = "button";
  clearAll.className = "ef-clear";
  clearAll.textContent = "Clear";
  clearAll.hidden = true;
  clearAll.addEventListener("click", () => {
    states.forEach(reset);
    rebuildPopovers();
    apply();
  });

  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "ef-export";
  // Icon only, so the bar still fits on one line between the menu and the search box
  exportBtn.innerHTML =
    `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11"/></svg>`;
  exportBtn.title = `Export to Excel: download the ${config.noun} shown on the map`;
  exportBtn.setAttribute("aria-label", "Export to Excel");
  exportBtn.disabled = true;
  exportBtn.addEventListener("click", () => void exportXlsx());

  bar.append(title, controls, count, clearAll, exportBtn);
  root.appendChild(bar);

  const ctls = config.fields.map((f) => {
    const c = control(f.label);
    if ((f.kind === "choice" && f.narrow) || f.kind === "number") c.pop.classList.add("ef-pop-narrow");
    controls.appendChild(c.el);
    return c;
  });

  /** A button with a popover under it; only one popover is open at a time. */
  function control(label: string) {
    const el = document.createElement("div");
    el.className = "ef-control";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ef-button";
    button.setAttribute("aria-expanded", "false");
    button.textContent = label;
    const pop = document.createElement("div");
    pop.className = "ef-pop";
    pop.hidden = true;
    button.addEventListener("click", () => {
      const open = pop.hidden;
      closeAll();
      pop.hidden = !open;
      button.setAttribute("aria-expanded", String(open));
    });
    el.append(button, pop);
    return { el, button, pop, label };
  }

  function closeAll(): void {
    for (const c of ctls) {
      c.pop.hidden = true;
      c.button.setAttribute("aria-expanded", "false");
    }
  }

  // composedPath, not target: a preset click rebuilds the popover, detaching its button
  document.addEventListener("click", (e) => {
    if (!e.composedPath().includes(bar)) closeAll();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAll();
  });

  // ── popover contents ──────────────────────────────────────────────────────

  function rebuildPopovers(): void {
    if (!features) return;
    const props = features.map((f) => (f.properties ?? {}) as Props);
    config.fields.forEach((f, i) => {
      const st = states[i];
      const body =
        f.kind === "choice" && st.kind === "choice" ? choiceList(f, st, props)
        : f.kind === "date" && st.kind === "range" ? dateFields(st, props.map((p) => str(p, f.prop)))
        : f.kind === "number" && st.kind === "range" ? numberFields(f.presets, st)
        : null;
      if (body) ctls[i].pop.replaceChildren(body, resetButton(() => reset(st)));
    });
  }

  function choiceList(f: Extract<Field, { kind: "choice" }>, st: { selected: Set<string> }, props: Props[]): HTMLElement {
    const counts = tally(props.flatMap((p) => valuesOf(f, p)));
    const order = f.order?.(def!) ?? [];
    const values = [...counts.keys()].sort((a, b) => rank(order, a) - rank(order, b) || a.localeCompare(b));

    const list = document.createElement("div");
    list.className = "ef-list";
    for (const v of values) {
      const row = document.createElement("label");
      row.className = "ef-option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = st.selected.has(v);
      input.addEventListener("change", () => {
        if (input.checked) st.selected.add(v);
        else st.selected.delete(v);
        apply();
      });
      const text = document.createElement("span");
      text.className = "ef-option-label";
      text.textContent = v;
      const sw = f.swatch?.(v, def!);
      row.append(input, ...(sw ? [sw] : []), text);
      if (f.counts) {
        const n = document.createElement("span");
        n.className = "ef-option-count";
        n.textContent = String(counts.get(v) ?? 0);
        row.append(n);
      }
      list.appendChild(row);
    }
    return list;
  }

  function dateFields(st: { lo: string; hi: string }, values: string[]): HTMLElement {
    const box = document.createElement("div");
    box.className = "ef-fields";
    const dates = values.filter(Boolean).sort();
    const from = dateInput("From", st.lo, dates[0], dates[dates.length - 1], (v) => { st.lo = v; });
    const to = dateInput("To", st.hi, dates[0], dates[dates.length - 1], (v) => { st.hi = v; });

    const today = isoToday();
    const presets = presetRow([
      ["Upcoming", () => { st.lo = today; st.hi = ""; }],
      ["Next 30 days", () => { st.lo = today; st.hi = addDays(today, 30); }],
      ["Past", () => { st.lo = ""; st.hi = addDays(today, -1); }],
    ]);
    box.append(from, to, presets);
    return box;
  }

  function dateInput(
    label: string, value: string, min: string | undefined, max: string | undefined,
    set: (v: string) => void,
  ): HTMLElement {
    const wrap = document.createElement("label");
    wrap.className = "ef-field";
    const input = document.createElement("input");
    input.type = "date";
    input.value = value;
    if (min) input.min = min;
    if (max) input.max = max;
    input.addEventListener("change", () => {
      set(input.value);
      apply();
    });
    wrap.append(document.createTextNode(label), input);
    return wrap;
  }

  function numberFields(presetValues: number[], st: { lo: string; hi: string }): HTMLElement {
    const box = document.createElement("div");
    box.className = "ef-fields ef-fields-compact";
    const min = numberInput("At least", st.lo, (v) => { st.lo = v; });
    const max = numberInput("At most", st.hi, (v) => { st.hi = v; });
    const presets = presetRow(presetValues.map((n) => [
      `${n.toLocaleString()}+`,
      () => { st.lo = String(n); st.hi = ""; },
    ]));
    box.append(min, max, presets);
    return box;
  }

  function numberInput(label: string, value: string, set: (v: string) => void): HTMLElement {
    const wrap = document.createElement("label");
    wrap.className = "ef-field";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "1";
    input.inputMode = "numeric";
    input.placeholder = "Any";
    input.value = value;
    input.addEventListener("input", () => {
      set(input.value !== "" && Number.isFinite(Number(input.value)) ? input.value : "");
      apply();
    });
    wrap.append(document.createTextNode(label), input);
    return wrap;
  }

  /** Quick-pick buttons that set the filter and refresh the popover's fields. */
  function presetRow(presets: [string, () => void][]): HTMLElement {
    const row = document.createElement("div");
    row.className = "ef-presets";
    for (const [label, run] of presets) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ef-preset";
      b.textContent = label;
      b.addEventListener("click", () => {
        run();
        rebuildPopovers();
        apply();
      });
      row.appendChild(b);
    }
    return row;
  }

  function resetButton(run: () => void): HTMLElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ef-reset";
    b.textContent = "Show all";
    b.addEventListener("click", () => {
      run();
      rebuildPopovers();
      apply();
    });
    return b;
  }

  // ── filtering ─────────────────────────────────────────────────────────────

  function matches(p: Props): boolean {
    return config.fields.every((f, i) => {
      const st = states[i];
      if (st.kind === "choice") {
        return !st.selected.size || valuesOf(f as Extract<Field, { kind: "choice" }>, p).some((v) => st.selected.has(v));
      }
      if (f.kind === "date") {
        const d = str(p, f.prop);
        return (!st.lo || (!!d && d >= st.lo)) && (!st.hi || (!!d && d <= st.hi));
      }
      const n = typeof p[f.prop] === "number" ? (p[f.prop] as number) : null;
      return (!st.lo || (n !== null && n >= Number(st.lo))) && (!st.hi || (n !== null && n <= Number(st.hi)));
    });
  }

  const isSet = (st: FieldState) => (st.kind === "choice" ? st.selected.size > 0 : !!(st.lo || st.hi));
  const isActive = () => states.some(isSet);

  function reset(st: FieldState): void {
    if (st.kind === "choice") st.selected.clear();
    else st.lo = st.hi = "";
  }

  function apply(): void {
    if (!features) return;
    const active = isActive();
    const ids: number[] = [];
    features.forEach((f, i) => { if (matches((f.properties ?? {}) as Props)) ids.push(i); });
    const filter = active ? (["in", ["id"], ["literal", ids]] as FilterSpecification) : null;
    setPOIFilter(map, config.layer, filter);

    count.textContent = active
      ? `${ids.length} of ${features.length} ${config.noun}`
      : `${features.length} ${config.noun}`;
    clearAll.hidden = !active;
    exportBtn.disabled = ids.length === 0;

    config.fields.forEach((f, i) => {
      const st = states[i];
      const summary = st.kind === "choice" ? choiceSummary(st.selected)
        : f.kind === "date" ? dateSummary(st.lo, st.hi)
        : numberSummary(st.lo, st.hi);
      const c = ctls[i];
      c.button.textContent = summary ? `${c.label}: ${summary}` : c.label;
      c.button.classList.toggle("active", !!summary);
    });
    opts.onChange();
  }

  // ── export ────────────────────────────────────────────────────────────────

  /** Downloads the features that match the filter (all of them when there is none), by date. */
  async function exportXlsx(): Promise<void> {
    if (!features) return;
    const { buildXlsx } = await import("../util/xlsx.ts");
    const name = (f: GeoJSON.Feature) => str(f.properties ?? {}, "name");
    const date = (f: GeoJSON.Feature) => str(f.properties ?? {}, "date_iso") || "9999";
    const rows = features
      .filter((f) => matches((f.properties ?? {}) as Props))
      .sort((a, b) => date(a).localeCompare(date(b)) || name(a).localeCompare(name(b)))
      .map((f) => config.export.columns.map((c) => c.value((f.properties ?? {}) as Props, f)));
    const blob = buildXlsx(config.export.sheet, config.export.columns, rows);

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${config.export.file}-${isoToday()}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ── data and visibility ───────────────────────────────────────────────────

  function load(): Promise<void> {
    loading ??= fetch(def!.source)
      .then((r) => r.json() as Promise<GeoJSON.FeatureCollection>)
      .then((fc) => {
        features = fc.features;
        // A shared link may name values no longer in the data, which would
        // hide every feature with no checked box to explain it
        config.fields.forEach((f, i) => {
          const st = states[i];
          if (f.kind !== "choice" || st.kind !== "choice") return;
          const present = new Set(fc.features.flatMap((x) => valuesOf(f, (x.properties ?? {}) as Props)));
          for (const v of st.selected) if (!present.has(v)) st.selected.delete(v);
        });
        rebuildPopovers();
        apply();
      })
      .catch((err) => {
        loading = null;
        count.textContent = `Couldn't load ${config.noun}`;
        console.error("[eventFilter] load failed:", err);
      });
    return loading;
  }

  onPOIVisibilityChange((id, visible) => {
    if (id !== config.layer) return;
    bar.hidden = !visible;
    if (!visible) closeAll();
    else void load();
  });

  // A shared link with a filter: start loading now, so the filter is usually
  // in place before the layer is first drawn
  if (isActive()) void load();

  return {
    layer: config.layer,
    params: () => {
      const out: Record<string, string> = {};
      config.fields.forEach((f, i) => {
        const st = states[i];
        if (!isSet(st)) return;
        out[f.key] = st.kind === "choice" ? [...st.selected].sort().join(",") : `${st.lo}..${st.hi}`;
      });
      return out;
    },
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────

function valuesOf(f: Extract<Field, { kind: "choice" }>, p: Props): string[] {
  const v = str(p, f.prop).trim();
  if (!v) return [];
  return f.multi ? v.split(",").map((a) => a.trim()).filter(Boolean) : [v];
}

function tally(values: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

function rank(order: string[], v: string): number {
  const i = order.indexOf(v);
  return i === -1 ? order.length : i;
}

function choiceSummary(selected: Set<string>): string {
  if (selected.size === 0) return "";
  if (selected.size === 1) return [...selected][0];
  return `${selected.size} selected`;
}

function dateSummary(from: string, to: string): string {
  if (from && to) return `${shortDate(from)} – ${shortDate(to)}`;
  if (from) return `from ${shortDate(from)}`;
  if (to) return `until ${shortDate(to)}`;
  return "";
}

function numberSummary(lo: string, hi: string): string {
  const fmt = (v: string) => Number(v).toLocaleString();
  if (lo && hi) return `${fmt(lo)}–${fmt(hi)}`;
  if (lo) return `${fmt(lo)}+`;
  if (hi) return `up to ${fmt(hi)}`;
  return "";
}

/** "2026-11-18" → "Nov 18, 2026" */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}
