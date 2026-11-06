/**
 * Filter bar for the Events & Outreach layer, shown at the top of the map
 * while the layer is on. Filters by event type, date range, agency and
 * audience size: any checked value within one attribute, all attributes
 * together.
 *
 * Matching is decided here, once, and the layer is told which features to
 * draw by their generated ids (their index in the GeoJSON), so the count in
 * the bar always agrees with the map.
 */
import type { Map as MlMap, FilterSpecification } from "maplibre-gl";
import { POIS, onPOIVisibilityChange, setPOIFilter } from "../map/pois.ts";
import type { POIId } from "../map/pois.ts";
import { dataUrl } from "../util/url.ts";
import type { EventFilterParams } from "../state/urlState.ts";

const LAYER_ID: POIId = "outreach-events";

type EventProps = {
  name?: string;
  date_iso?: string;
  event_type?: string;
  agency?: string;
  location?: string;
  address?: string;
  audience?: number | null;
  details?: string;
  link?: string;
};

type Event = {
  type: string;
  agencies: string[];
  date: string; // YYYY-MM-DD, or "" when unknown
  audience: number | null;
  props: EventProps; // for the spreadsheet export
  coords: [number, number] | null;
};

type FilterState = {
  types: Set<string>;
  agencies: Set<string>;
  from: string;
  to: string;
  minAudience: number | null;
  maxAudience: number | null;
};

const AUDIENCE_PRESETS = [50, 100, 500, 1000];

export type EventFilterHandle = {
  /** The current filter for a shareable link, or undefined when it shows every event */
  params(): EventFilterParams | undefined;
};

export function mountEventFilter(
  map: MlMap,
  root: HTMLElement,
  opts: { initial?: EventFilterParams; onChange: () => void },
): EventFilterHandle {
  const def = POIS.find((p) => p.id === LAYER_ID);
  if (!def) return { params: () => undefined };

  const init = opts.initial;
  const state: FilterState = {
    types: new Set(init?.types),
    agencies: new Set(init?.agencies),
    from: init?.from ?? "",
    to: init?.to ?? "",
    minAudience: init?.minAudience ?? null,
    maxAudience: init?.maxAudience ?? null,
  };
  let events: Event[] | null = null;
  let loading: Promise<void> | null = null;

  // ── DOM ───────────────────────────────────────────────────────────────────

  const bar = document.createElement("div");
  bar.className = "event-filter";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Filter Events & Outreach");
  bar.hidden = true;

  const title = document.createElement("span");
  title.className = "ef-title";
  title.textContent = "Filter events";

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
    state.types.clear();
    state.agencies.clear();
    state.from = state.to = "";
    state.minAudience = state.maxAudience = null;
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
  exportBtn.title = "Export to Excel: download the events shown on the map";
  exportBtn.setAttribute("aria-label", "Export to Excel");
  exportBtn.disabled = true;
  exportBtn.addEventListener("click", () => void exportXlsx());

  bar.append(title, controls, count, clearAll, exportBtn);
  root.appendChild(bar);

  const typeCtl = control("Event type");
  const dateCtl = control("Date");
  const agencyCtl = control("Agency");
  agencyCtl.pop.classList.add("ef-pop-narrow");
  const audienceCtl = control("Audience");
  controls.append(typeCtl.el, dateCtl.el, agencyCtl.el, audienceCtl.el);

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
    for (const c of [typeCtl, dateCtl, agencyCtl, audienceCtl]) {
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
    if (!events) return;
    const evs = events;

    // Event types in legend order, then any others; only types present in the data
    const legendOrder = (def!.legend ?? []).map((l) => l.label);
    const colorOf = new Map((def!.legend ?? []).map((l) => [l.label, l.color]));
    const typeCounts = tally(evs.map((e) => e.type));
    const types = [...typeCounts.keys()].sort(
      (a, b) => rank(legendOrder, a) - rank(legendOrder, b) || a.localeCompare(b),
    );
    typeCtl.pop.replaceChildren(
      checklist(types, typeCounts, state.types, (t) => swatch(colorOf.get(t) ?? def!.color)),
      resetButton(() => state.types.clear()),
    );

    const agencyCounts = tally(evs.flatMap((e) => e.agencies));
    const agencies = [...agencyCounts.keys()].sort((a, b) => a.localeCompare(b));
    agencyCtl.pop.replaceChildren(
      checklist(agencies, null, state.agencies),
      resetButton(() => state.agencies.clear()),
    );

    dateCtl.pop.replaceChildren(dateFields(evs), resetButton(() => { state.from = state.to = ""; }));
    audienceCtl.pop.replaceChildren(audienceFields(), resetButton(() => {
      state.minAudience = state.maxAudience = null;
    }));
  }

  function checklist(
    values: string[],
    counts: Map<string, number> | null, // null: no count column
    selected: Set<string>,
    decorate?: (value: string) => HTMLElement,
  ): HTMLElement {
    const list = document.createElement("div");
    list.className = "ef-list";
    for (const v of values) {
      const row = document.createElement("label");
      row.className = "ef-option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = selected.has(v);
      input.addEventListener("change", () => {
        if (input.checked) selected.add(v);
        else selected.delete(v);
        apply();
      });
      const text = document.createElement("span");
      text.className = "ef-option-label";
      text.textContent = v;
      row.append(input, ...(decorate ? [decorate(v)] : []), text);
      if (counts) {
        const n = document.createElement("span");
        n.className = "ef-option-count";
        n.textContent = String(counts.get(v) ?? 0);
        row.append(n);
      }
      list.appendChild(row);
    }
    return list;
  }

  /** The layer's star icon in a category color. */
  function swatch(color: string): HTMLElement {
    const s = document.createElement("span");
    s.className = "ef-swatch";
    s.style.backgroundColor = color;
    if (def!.icon) {
      const url = `url("${dataUrl(def!.icon)}")`;
      s.style.maskImage = url;
      s.style.webkitMaskImage = url;
    }
    return s;
  }

  function dateFields(evs: Event[]): HTMLElement {
    const box = document.createElement("div");
    box.className = "ef-fields";
    const dates = evs.map((e) => e.date).filter(Boolean).sort();
    const from = dateInput("From", state.from, dates[0], dates[dates.length - 1], (v) => { state.from = v; });
    const to = dateInput("To", state.to, dates[0], dates[dates.length - 1], (v) => { state.to = v; });

    const today = isoToday();
    const presets = presetRow([
      ["Upcoming", () => { state.from = today; state.to = ""; }],
      ["Next 30 days", () => { state.from = today; state.to = addDays(today, 30); }],
      ["Past", () => { state.from = ""; state.to = addDays(today, -1); }],
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

  function audienceFields(): HTMLElement {
    const box = document.createElement("div");
    box.className = "ef-fields";
    const min = numberInput("At least", state.minAudience, (v) => { state.minAudience = v; });
    const max = numberInput("At most", state.maxAudience, (v) => { state.maxAudience = v; });
    const presets = presetRow(AUDIENCE_PRESETS.map((n) => [
      `${n.toLocaleString()}+`,
      () => { state.minAudience = n; state.maxAudience = null; },
    ]));
    box.append(min, max, presets);
    return box;
  }

  function numberInput(label: string, value: number | null, set: (v: number | null) => void): HTMLElement {
    const wrap = document.createElement("label");
    wrap.className = "ef-field";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "1";
    input.inputMode = "numeric";
    input.placeholder = "Any";
    input.value = value === null ? "" : String(value);
    input.addEventListener("input", () => {
      const n = input.value === "" ? null : Number(input.value);
      set(n !== null && Number.isFinite(n) ? n : null);
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

  function resetButton(reset: () => void): HTMLElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ef-reset";
    b.textContent = "Show all";
    b.addEventListener("click", () => {
      reset();
      rebuildPopovers();
      apply();
    });
    return b;
  }

  // ── filtering ─────────────────────────────────────────────────────────────

  function matches(e: Event): boolean {
    if (state.types.size && !state.types.has(e.type)) return false;
    if (state.agencies.size && !e.agencies.some((a) => state.agencies.has(a))) return false;
    if (state.from && !(e.date && e.date >= state.from)) return false;
    if (state.to && !(e.date && e.date <= state.to)) return false;
    if (state.minAudience !== null && !(e.audience !== null && e.audience >= state.minAudience)) return false;
    if (state.maxAudience !== null && !(e.audience !== null && e.audience <= state.maxAudience)) return false;
    return true;
  }

  function isActive(): boolean {
    return state.types.size > 0 || state.agencies.size > 0 || !!state.from || !!state.to ||
      state.minAudience !== null || state.maxAudience !== null;
  }

  function apply(): void {
    if (!events) return;
    const active = isActive();
    const ids: number[] = [];
    events.forEach((e, i) => { if (matches(e)) ids.push(i); });
    const filter = active ? (["in", ["id"], ["literal", ids]] as FilterSpecification) : null;
    setPOIFilter(map, LAYER_ID, filter);

    count.textContent = active
      ? `${ids.length} of ${events.length} events`
      : `${events.length} events`;
    clearAll.hidden = !active;
    exportBtn.disabled = ids.length === 0;

    setButton(typeCtl, choiceSummary(state.types));
    setButton(agencyCtl, choiceSummary(state.agencies));
    setButton(dateCtl, dateSummary(state.from, state.to));
    setButton(audienceCtl, audienceSummary(state.minAudience, state.maxAudience));
    opts.onChange();
  }

  function setButton(c: ReturnType<typeof control>, summary: string): void {
    c.button.textContent = summary ? `${c.label}: ${summary}` : c.label;
    c.button.classList.toggle("active", !!summary);
  }

  // ── export ────────────────────────────────────────────────────────────────

  /** Downloads the events that match the filter (all of them when there is none), by date. */
  async function exportXlsx(): Promise<void> {
    if (!events) return;
    const { buildXlsx } = await import("../util/xlsx.ts");
    const rows = events
      .filter(matches)
      .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") ||
        (a.props.name ?? "").localeCompare(b.props.name ?? ""))
      .map((e) => [
        e.props.name ?? "",
        e.date ? { date: e.date } : null,
        e.type,
        e.agencies.join(", "),
        e.props.location ?? "",
        e.props.address ?? "",
        e.audience,
        e.props.details ?? "",
        e.props.link ? { link: e.props.link } : null,
        e.coords ? round6(e.coords[1]) : null,
        e.coords ? round6(e.coords[0]) : null,
      ]);
    const blob = buildXlsx("Events & Outreach", [
      { header: "Event", width: 40 },
      { header: "Date", width: 17 },
      { header: "Event Type", width: 26 },
      { header: "Agency", width: 18 },
      { header: "Location", width: 36 },
      { header: "Address", width: 36 },
      { header: "Approx. Audience", width: 16 },
      { header: "Details", width: 60 },
      { header: "Link", width: 36 },
      { header: "Latitude", width: 11 },
      { header: "Longitude", width: 11 },
    ], rows);

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `events-outreach-${isoToday()}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ── data and visibility ───────────────────────────────────────────────────

  function load(): Promise<void> {
    loading ??= fetch(def!.source)
      .then((r) => r.json() as Promise<GeoJSON.FeatureCollection>)
      .then((fc) => {
        events = fc.features.map((f) => {
          const p = (f.properties ?? {}) as EventProps;
          return {
            type: p.event_type ?? "",
            agencies: (p.agency ?? "").split(",").map((a) => a.trim()).filter(Boolean),
            date: p.date_iso ?? "",
            audience: typeof p.audience === "number" ? p.audience : null,
            props: p,
            coords: f.geometry?.type === "Point" ? (f.geometry.coordinates as [number, number]) : null,
          };
        });
        // A shared link may name types or agencies no longer in the data, which
        // would hide every event with no checked box to explain it
        const known = (vals: Set<string>, present: Set<string>) => {
          for (const v of vals) if (!present.has(v)) vals.delete(v);
        };
        known(state.types, new Set(events.map((e) => e.type)));
        known(state.agencies, new Set(events.flatMap((e) => e.agencies)));
        rebuildPopovers();
        apply();
      })
      .catch((err) => {
        loading = null;
        count.textContent = "Couldn't load events";
        console.error("[eventFilter] load failed:", err);
      });
    return loading;
  }

  onPOIVisibilityChange((id, visible) => {
    if (id !== LAYER_ID) return;
    bar.hidden = !visible;
    if (!visible) closeAll();
    else void load();
  });

  // A shared link with a filter: start loading now, so the filter is usually
  // in place before the layer is first drawn
  if (isActive()) void load();

  return {
    params: () => isActive()
      ? {
        types: [...state.types],
        agencies: [...state.agencies],
        from: state.from,
        to: state.to,
        minAudience: state.minAudience,
        maxAudience: state.maxAudience,
      }
      : undefined,
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────

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

function audienceSummary(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${min.toLocaleString()}–${max.toLocaleString()}`;
  if (min !== null) return `${min.toLocaleString()}+`;
  if (max !== null) return `up to ${max.toLocaleString()}`;
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
