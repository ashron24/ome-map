#!/usr/bin/env tsx
/**
 * Converts an OME event sessions export (dim_st_event_sessions CSV) to GeoJSON.
 * Usage: npm run data:ome-events -- /path/to/dim_st_event_sessions.csv
 * Output: public/ome-events.geojson (committed — the export isn't available
 * to the deploy build)
 *
 * Keeps in-person canvassing, event and NYC 101 sessions, and drops text banks
 * (any session titled with "text") and virtual sessions. Only public fields are
 * kept: staff names, RSVP counts, reminder templates, internal ids and the
 * RSVP dashboard link stay out. Sessions without coordinates get them from
 * another session at the same address, from INTERSECTIONS below, or from NYC
 * Planning's GeoSearch (which finds addresses but not intersections).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { clean, parseCsv, stripBom } from "./lib/csv.ts";

const TARGET = join(process.cwd(), "public/ome-events.geojson");

// Generous NYC bounding box: [west, south, east, north]
const NYC_BBOX = [-74.3, 40.45, -73.65, 40.95];

// EVENT_TYPE (lowercased, spaces removed) → shown type and icon group
const TYPES: Record<string, { type: string; group: "canvass" | "event" }> = {
  canvassing: { type: "Canvass", group: "canvass" },
  event: { type: "Event", group: "event" },
  nyc101: { type: "NYC 101", group: "event" },
};

type Point = [number, number];

// Street corners in the export without coordinates, by addressKey(); looked up
// once where the two streets meet in OpenStreetMap
const INTERSECTIONS: Record<string, Point> = {
  "w 124th st & mt morris park w, new york, ny": [-73.9443406, 40.8064044],
  "rivington st & attorney st, new york, ny": [-73.9842294, 40.7188259],
  "wadsworth terrace & w 190th st, new york, ny": [-73.931655, 40.855755],
};

function inNyc([lon, lat]: Point): boolean {
  const [w, s, e, n] = NYC_BBOX;
  return lon >= w && lon <= e && lat >= s && lat <= n;
}

/** Address text with the export's stray ", USA" and "&," removed. */
function tidyAddress(s: string): string {
  return s.replace(/\s*&\s*,\s*/g, " & ").replace(/,?\s*USA$/, "").replace(/\s+/g, " ").trim();
}

/** Address for matching: lowercase, no ZIP or periods, so "Ocean Ave & Parkside Ave, Brooklyn, NY" matches the same corner with its ZIP. */
function addressKey(address: string): string {
  return address.toLowerCase().replace(/\./g, "").replace(/\s*\b\d{5}\b/g, "").replace(/\s+/g, " ").replace(/[ ,]+$/, "").trim();
}

/** "2026-05-05 22:00:00 +00" (UTC) → a Date */
function utc(s: string): Date | null {
  const m = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/);
  return m ? new Date(`${m[1]}T${m[2]}Z`) : null;
}

/** "6:00 – 9:00 PM" in New York time; "" if unknown */
function timeRange(start: Date | null, end: Date | null): string {
  const fmt = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  if (!start) return "";
  const a = fmt(start);
  if (!end) return a;
  const b = fmt(end);
  // Drop the first AM/PM when both ends share it: "6:00 – 9:00 PM"
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`;
}

/** "2026-11-18" → "Wed, Nov 18, 2026" */
function displayDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

async function geosearch(address: string): Promise<Point | null> {
  const url = `https://geosearch.planninglabs.nyc/v2/search?size=1&text=${encodeURIComponent(address)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as { features?: { geometry: { coordinates: Point } }[] };
    const pt = json.features?.[0]?.geometry.coordinates;
    return pt && inNyc(pt) ? pt : null;
  } catch {
    return null;
  }
}

async function main() {
  const csv = process.argv[2];
  if (!csv) throw new Error("Usage: npm run data:ome-events -- /path/to/file.csv");
  const all = parseCsv(stripBom(readFileSync(csv, "utf8")));

  const rows = all.filter((r) =>
    TYPES[clean(r["EVENT_TYPE"]).toLowerCase().replace(/\s+/g, "")] &&
    !clean(r["SESSION_TITLE"]).toLowerCase().includes("text") &&
    clean(r["ST_EVENT_TYPE"]).toLowerCase() !== "virtual",
  );

  const coordsOf = (r: Record<string, string>): Point | null => {
    const pt: Point = [Number(r["LONGITUDE"]), Number(r["LATITUDE"])];
    return clean(r["LATITUDE"]) && clean(r["LONGITUDE"]) && inNyc(pt) ? pt : null;
  };

  // Known coordinates by address, for sessions at the same place without them
  const byAddress = new Map<string, Point>();
  for (const r of rows) {
    const pt = coordsOf(r);
    const addr = addressKey(tidyAddress(clean(r["LOCATION_ADDRESS"])));
    if (pt && addr && !byAddress.has(addr)) byAddress.set(addr, pt);
  }

  let skipped = 0;
  let geocoded = 0;
  const features = [];
  for (const r of rows) {
    const address = tidyAddress(clean(r["LOCATION_ADDRESS"]));
    const key = addressKey(address);
    let pt = coordsOf(r) ?? byAddress.get(key) ?? INTERSECTIONS[key] ?? null;
    if (!pt && address) {
      pt = await geosearch(address);
      if (pt) {
        geocoded++;
        byAddress.set(key, pt);
      }
    }
    const title = clean(r["SESSION_TITLE"]) || clean(r["EVENT_TITLE"]);
    if (!pt) {
      console.warn(`  skipped (no location): ${title} — "${address}"`);
      skipped++;
      continue;
    }
    const kind = TYPES[clean(r["EVENT_TYPE"]).toLowerCase().replace(/\s+/g, "")];
    const date = clean(r["SESSION_DATE"]);
    features.push({
      type: "Feature" as const,
      properties: {
        name: title,
        date: date ? displayDate(date) : "",
        date_iso: date,
        time: timeRange(utc(clean(r["SESSION_START_TIME"])), utc(clean(r["SESSION_END_TIME"]))),
        event_type: kind.type,
        icon_group: kind.group,
        campaign: clean(r["CAMPAIGN"]),
        location: clean(r["LOCATION_NAME"]),
        address,
        neighborhood: clean(r["NEIGHBORHOOD"]),
      },
      geometry: { type: "Point" as const, coordinates: pt },
    });
  }

  const text = JSON.stringify({ type: "FeatureCollection", features });
  writeFileSync(TARGET, text);
  console.log(
    `  OK: ${features.length} sessions (${rows.length} matched filters of ${all.length}; ` +
    `${geocoded} geocoded, ${skipped} skipped), ${(text.length / 1024).toFixed(1)} KiB`,
  );
}

main();
