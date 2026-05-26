import type { BasemapId } from "../map/basemaps.ts";

export type AppState = {
  zoom?: number;
  center?: [number, number];
  basemap?: BasemapId;
  districts: Set<string>;
  pois: Set<string>;
  metric?: string;
  ethnicities: Set<string>;
};

export function emptyState(): AppState {
  return { districts: new Set(), pois: new Set(), ethnicities: new Set() };
}

export function parseHash(hash: string): AppState {
  const state = emptyState();
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return state;

  const params = new URLSearchParams(raw);

  const z = params.get("z");
  if (z !== null) {
    const zoom = Number(z);
    if (Number.isFinite(zoom)) state.zoom = zoom;
  }

  const c = params.get("c");
  if (c) {
    const [lng, lat] = c.split(",").map(Number);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      state.center = [lng, lat];
    }
  }

  const b = params.get("b");
  if (b) state.basemap = b as BasemapId;

  const d = params.get("d");
  if (d) for (const id of d.split(",").filter(Boolean)) state.districts.add(id);

  const p = params.get("p");
  if (p) for (const id of p.split(",").filter(Boolean)) state.pois.add(id);

  const m = params.get("m");
  if (m) state.metric = m;

  const e = params.get("e");
  if (e) for (const id of e.split(",").filter(Boolean)) state.ethnicities.add(id);

  return state;
}

export function buildHash(state: AppState): string {
  const params = new URLSearchParams();

  if (state.zoom !== undefined) params.set("z", state.zoom.toFixed(2));
  if (state.center)
    params.set(
      "c",
      `${state.center[0].toFixed(4)},${state.center[1].toFixed(4)}`,
    );
  if (state.basemap && state.basemap !== "carto-positron") {
    params.set("b", state.basemap);
  }
  if (state.districts.size > 0) {
    params.set("d", [...state.districts].sort().join(","));
  }
  if (state.pois.size > 0) {
    params.set("p", [...state.pois].sort().join(","));
  }
  if (state.metric) params.set("m", state.metric);
  if (state.ethnicities.size > 0) {
    params.set("e", [...state.ethnicities].sort().join(","));
  }

  return params.toString();
}

export function writeHash(state: AppState): void {
  const next = buildHash(state);
  const current = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : "";
  if (next === current) return;
  // Use replaceState so we don't pollute history on every move
  const url = `${window.location.pathname}${window.location.search}${next ? "#" + next : ""}`;
  window.history.replaceState(null, "", url);
}

export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  ms: number,
): T {
  let t: ReturnType<typeof setTimeout> | null = null;
  return ((...args: never[]) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  }) as T;
}
