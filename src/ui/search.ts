import type { Map as MlMap, LngLatBoundsLike } from "maplibre-gl";
import { Marker } from "maplibre-gl";
import { geocode } from "../map/geocode.ts";
import type { Suggestion } from "../map/geocode.ts";
import { placeMatcher } from "../map/places.ts";
import type { Found, PlacesDoc } from "../map/places.ts";
import { dataUrl } from "../util/url.ts";

const GEOCLIENT_KEY: string = (import.meta.env.VITE_GEOCLIENT_KEY as string) || "";

type Status =
  | "idle" | "searching" | "none" | "error" | "locating" | "no-location"
  | { type: "found"; place: Found }
  | { type: "choices"; matches: Found[]; active: number }
  | { type: "suggest"; suggestions: Suggestion[]; active: number };

export function mountSearch(map: MlMap, root: HTMLElement): void {
  let status: Status = "idle";
  let inflight: AbortController | null = null;
  let placesPromise: Promise<((q: string) => Found | null) | null> | null = null;
  let marker: Marker | null = null;
  let showing = false;

  // ── DOM ───────────────────────────────────────────────────────────────────

  const form = document.createElement("form");
  form.className = "search";
  form.setAttribute("role", "search");

  const bar = document.createElement("div");
  bar.className = "search-bar";

  const input = document.createElement("input");
  input.className = "search-input";
  input.type = "text";
  input.autocomplete = "off";
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("enterkeyhint", "search");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-labelledby", "search-label");
  input.setAttribute("aria-describedby", "search-status");

  const placeholder = document.createElement("label");
  placeholder.className = "search-placeholder";
  placeholder.id = "search-label";
  placeholder.setAttribute("aria-hidden", "true");
  placeholder.textContent = GEOCLIENT_KEY
    ? "Address, neighborhood, or ZIP"
    : "Neighborhood, borough, or ZIP";

  const clearBtn = document.createElement("button");
  clearBtn.className = "search-clear";
  clearBtn.type = "button";
  clearBtn.setAttribute("aria-label", "Clear search");
  clearBtn.innerHTML = `<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  clearBtn.style.display = "none";

  const locateBtn = document.createElement("button");
  locateBtn.className = "search-locate";
  locateBtn.type = "button";
  locateBtn.setAttribute("aria-label", "Use my location");
  locateBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></g></svg>`;

  const submitBtn = document.createElement("button");
  submitBtn.className = "search-submit";
  submitBtn.type = "submit";
  submitBtn.setAttribute("aria-label", "Search");
  submitBtn.innerHTML = `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M13 13l4 4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;

  bar.append(input, placeholder, clearBtn, locateBtn, submitBtn);

  const drop = document.createElement("div");
  drop.className = "search-drop";

  const statusEl = document.createElement("div");
  statusEl.className = "search-status";
  statusEl.id = "search-status";
  statusEl.setAttribute("role", "status");
  statusEl.setAttribute("aria-live", "polite");

  const choicesList = document.createElement("ul");
  choicesList.className = "search-choices";
  choicesList.id = "search-choices";
  choicesList.setAttribute("role", "listbox");

  drop.append(statusEl, choicesList);
  form.append(bar, drop);
  root.appendChild(form);

  // ── helpers ───────────────────────────────────────────────────────────────

  function loadPlaces() {
    placesPromise ??= fetch(dataUrl("places.json"))
      .then((r) => (r.ok ? r.json() as Promise<PlacesDoc> : null))
      .then((doc) => (doc ? placeMatcher(doc) : null))
      .catch(() => null);
    return placesPromise;
  }

  function showPlace(place: Found) {
    showing = true;
    marker?.remove();
    marker = new Marker({ color: "#E53E3E" })
      .setLngLat(place.center)
      .addTo(map);
    if (place.bbox) {
      map.fitBounds(place.bbox as LngLatBoundsLike, { padding: 50, maxZoom: 15 });
    } else {
      map.flyTo({ center: place.center, zoom: 16 });
    }
    setStatus({ type: "found", place });
  }

  function clearResult() {
    if (showing) { marker?.remove(); marker = null; showing = false; }
  }

  function setStatus(next: Status) {
    if (next !== status && showing && next !== "idle" && typeof next !== "object") clearResult();
    status = next;
    render();
  }

  function clearSearch() {
    inflight?.abort();
    input.value = "";
    clearResult();
    setStatus("idle");
    input.focus();
  }

  // ── search logic ──────────────────────────────────────────────────────────

  async function search(query: string) {
    inflight?.abort();
    const controller = new AbortController();
    inflight = controller;
    setStatus("searching");

    const match = await loadPlaces();
    if (controller.signal.aborted) return;
    const localPlace = match?.(query);
    if (localPlace) { showPlace(localPlace); return; }

    if (!GEOCLIENT_KEY) { setStatus("none"); return; }

    try {
      const result = await geocode(query, GEOCLIENT_KEY, controller.signal);
      if (controller.signal.aborted) return;
      if (result.type === "found" && result.matches.length === 1) {
        showPlace(result.matches[0]);
      } else if (result.type === "found") {
        setStatus({ type: "choices", matches: result.matches, active: -1 });
      } else if (result.type === "suggest") {
        setStatus({ type: "suggest", suggestions: result.suggestions, active: -1 });
      } else {
        setStatus("none");
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      console.warn("[search]", err);
      setStatus("error");
    }
  }

  function locate() {
    inflight?.abort();
    if (!navigator.geolocation) { setStatus("no-location"); return; }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        input.value = "";
        showPlace({
          kind: "location", name: "your location", cross: null, borough: null,
          center: [pos.coords.longitude, pos.coords.latitude], bbox: null,
        });
      },
      () => setStatus("no-location"),
      { timeout: 10_000, maximumAge: 60_000 },
    );
  }

  // ── rendering ─────────────────────────────────────────────────────────────

  function render() {
    const hasValue = input.value.length > 0;
    const active = typeof status === "object" && ("active" in status) ? status.active : -1;

    clearBtn.style.display = (hasValue || status !== "idle") ? "" : "none";
    placeholder.style.display = hasValue ? "none" : "";

    // Status message
    let msg = "";
    if (status === "searching") msg = "Searching…";
    else if (status === "none") msg = GEOCLIENT_KEY ? "No match in New York City." : "Try a neighborhood, borough, or ZIP code.";
    else if (status === "error") msg = "Search unavailable right now.";
    else if (status === "locating") msg = "Finding your location…";
    else if (status === "no-location") msg = "Couldn't get your location.";
    else if (typeof status === "object" && status.type === "found") msg = `Found: ${placeName(status.place)}`;
    else if (typeof status === "object" && status.type === "choices") msg = "Which one do you mean?";
    else if (typeof status === "object" && status.type === "suggest") msg = "Did you mean:";
    statusEl.textContent = msg;

    // Choices dropdown
    choicesList.innerHTML = "";
    let choices: { label: string; pick: () => void }[] = [];
    if (typeof status === "object" && status.type === "choices") {
      choices = status.matches.map((m) => ({
        label: placeName(m) + (m.borough ? `, ${m.borough}` : ""),
        pick: () => { input.value = placeName(m); showPlace(m); },
      }));
    } else if (typeof status === "object" && status.type === "suggest") {
      choices = status.suggestions.map((s) => ({
        label: `${s.house} ${s.street}, ${s.borough}`,
        pick: () => { input.value = s.query; search(s.query); },
      }));
    }

    input.setAttribute("aria-expanded", choices.length > 0 ? "true" : "false");
    input.setAttribute("aria-controls", choices.length > 0 ? "search-choices" : "");
    input.setAttribute("aria-activedescendant", active >= 0 ? `sc-${active}` : "");

    choices.forEach((c, i) => {
      const li = document.createElement("li");
      li.className = "search-choice" + (i === active ? " search-choice-active" : "");
      li.id = `sc-${i}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", i === active ? "true" : "false");
      li.textContent = c.label;
      li.addEventListener("mousedown", (e) => { e.preventDefault(); c.pick(); });
      choicesList.appendChild(li);
    });
  }

  function placeName(place: Found): string {
    if (place.kind === "intersection") return `${place.name} & ${place.cross}`;
    return place.name;
  }

  // ── events ────────────────────────────────────────────────────────────────

  input.addEventListener("input", () => render());
  input.addEventListener("focus", () => loadPlaces());

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (q) void search(q);
  });

  clearBtn.addEventListener("click", clearSearch);
  locateBtn.addEventListener("click", locate);

  input.addEventListener("keydown", (e) => {
    const s = status;
    const isChoices = typeof s === "object" && (s.type === "choices" || s.type === "suggest");
    const n = isChoices ? choicesList.children.length : 0;
    const active = isChoices ? (s as { active: number }).active : -1;

    if (isChoices && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next = active < 0 ? (step > 0 ? 0 : n - 1) : (active + step + n) % n;
      status = { ...(s as Record<string, unknown>), active: next } as unknown as Status;
      render();
      return;
    }
    if (isChoices && e.key === "Enter" && active >= 0) {
      e.preventDefault();
      (choicesList.children[active] as HTMLElement).dispatchEvent(new MouseEvent("mousedown"));
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (isChoices) { setStatus("idle"); } else { clearSearch(); }
    }
  });

  render();
}
