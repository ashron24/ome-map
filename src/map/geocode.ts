/**
 * Addresses, intersections and named places through NYC Geoclient.
 * Ported from CityOfNewYork/nyc-map-kit (app/src/logic/geocode.ts).
 *
 * API key: VITE_GEOCLIENT_KEY build-time env var (GitHub secret).
 * Without it only local places matching (boroughs/neighborhoods/ZIPs) works.
 */
import type { Found } from "./places.ts";

const ENDPOINT = "https://api.nyc.gov/geoclient/v2/search";
const TIMEOUT_MS = 8000;

export interface Suggestion {
  house: string;
  street: string;
  borough: string;
  query: string;
}

export type GeocodeResult =
  | { type: "found"; matches: Found[] }
  | { type: "suggest"; suggestions: Suggestion[] }
  | { type: "none" };

interface GeoclientResult {
  status: string;
  request: string;
  response: Record<string, unknown>;
}

const BOROUGHS: Record<string, string> = {
  MANHATTAN: "Manhattan", BRONX: "Bronx", BROOKLYN: "Brooklyn", QUEENS: "Queens",
  "STATEN IS": "Staten Island", "STATEN ISLAND": "Staten Island",
};

export async function geocode(
  input: string,
  key: string,
  signal?: AbortSignal,
): Promise<GeocodeResult> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("input", input);
  url.searchParams.set("returnPossiblesWithExact", "true");
  url.searchParams.set("returnRejections", "true");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const forward = () => controller.abort();
  signal?.addEventListener("abort", forward);
  try {
    const resp = await fetch(url, {
      headers: { "Ocp-Apim-Subscription-Key": key },
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`Geoclient: HTTP ${resp.status}`);
    return parseGeoclient(await resp.json());
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forward);
  }
}

export function parseGeoclient(body: { results?: GeoclientResult[] }): GeocodeResult {
  const results = body.results || [];
  const matched = results.filter((r) => r.status === "EXACT_MATCH" || r.status === "POSSIBLE_MATCH");
  const clean = matched.filter((r) => r.response.geosupportReturnCode === "00");
  const matches: Found[] = [];
  for (const r of clean.length ? clean : matched) {
    const found = toFound(r);
    if (found && !matches.some((m) => sameSpot(m, found))) matches.push(found);
  }
  if (matches.length) return { type: "found", matches };

  const suggestions: Suggestion[] = [];
  for (const r of results) {
    const s = suggestionFrom(r);
    if (s && !suggestions.some((t) => t.query === s.query)) suggestions.push(s);
  }
  return suggestions.length ? { type: "suggest", suggestions } : { type: "none" };
}

function toFound(r: GeoclientResult): Found | null {
  const p = r.response;
  const lat = Number(p.latitude);
  const lon = Number(p.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  const borough = BOROUGHS[String(p.firstBoroughName)] || null;
  const center: [number, number] = [lon, lat];
  if (r.request.startsWith("intersection")) {
    return {
      kind: "intersection",
      name: streetName(String(p.firstStreetNameNormalized || p.streetName1 || "")),
      cross: streetName(String(p.secondStreetNameNormalized || p.streetName2 || "")),
      borough, center, bbox: null,
    };
  }
  if (r.request.startsWith("address")) {
    const street = streetName(String(p.firstStreetNameNormalized || ""));
    return {
      kind: "address", name: `${p.houseNumber || ""} ${street}`.trim(), cross: null,
      borough, center, bbox: null,
    };
  }
  if (r.request.startsWith("place")) {
    const name = titleCase(String(p.boePreferredStreetName || p.firstStreetNameNormalized || ""));
    return name ? { kind: "landmark", name, cross: null, borough, center, bbox: null } : null;
  }
  return null;
}

function sameSpot(a: Found, b: Found): boolean {
  return Math.abs(a.center[0] - b.center[0]) < 1e-5 && Math.abs(a.center[1] - b.center[1]) < 1e-5;
}

function suggestionFrom(r: GeoclientResult): Suggestion | null {
  if (r.status !== "REJECTED" || !r.request.startsWith("address")) return null;
  const p = r.response;
  const typed = /street=([^,\]]+)/.exec(r.request);
  const house = String(p.houseNumber || p.houseNumberIn || "");
  const borough = BOROUGHS[String(p.firstBoroughName)];
  if (!typed || !house || !borough) return null;
  const want = squash(typed[1]);
  for (let i = 1; i <= 10; i++) {
    const candidate = p[`streetName${i}`];
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    const got = squash(candidate);
    if (editDistance(want, got) <= Math.max(1, Math.floor(want.length / 5))) {
      const street = streetName(candidate);
      return { house, street, borough, query: `${house} ${street}, ${borough}` };
    }
  }
  return null;
}

function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

export function streetName(s: string): string {
  return s.trim().split(/\s+/).filter(Boolean).map((w) => {
    if (/^\d+$/.test(w)) return w + ordinal(Number(w));
    return w.charAt(0) + w.slice(1).toLowerCase();
  }).join(" ");
}

function titleCase(s: string): string {
  return s.trim().split(/\s+/).filter(Boolean)
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] || "th";
}
