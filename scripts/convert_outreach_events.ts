#!/usr/bin/env tsx
/**
 * Converts an outreach & events point shapefile (WGS84) to GeoJSON.
 * Usage: npm run data:outreach -- /path/to/Events.shp
 * Output: public/outreach-events.geojson (committed — the shapefile isn't
 * available to the deploy build)
 *
 * Only public event fields are kept. Contact names and emails, attachment
 * links, internal follow-up fields and geocoder metadata are dropped, and
 * points outside NYC (failed geocodes) are skipped.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TARGET = join(process.cwd(), "public/outreach-events.geojson");

// Generous NYC bounding box: [west, south, east, north]
const NYC_BBOX = [-74.3, 40.45, -73.65, 40.95];

type Row = Record<string, string>;

/** Point geometries from a .shp file, in record order (null for empty shapes). */
function readPoints(buf: Buffer): ([number, number] | null)[] {
  const shapeType = buf.readInt32LE(32);
  if (shapeType !== 1) throw new Error(`Expected a point shapefile, got shape type ${shapeType}`);
  const points: ([number, number] | null)[] = [];
  for (let o = 100; o < buf.length; ) {
    const len = buf.readInt32BE(o + 4) * 2;
    const type = buf.readInt32LE(o + 8);
    points.push(type === 1 ? [buf.readDoubleLE(o + 12), buf.readDoubleLE(o + 20)] : null);
    o += 8 + len;
  }
  return points;
}

/** Records from a .dbf file. Field names are truncated to 10 characters by the format. */
function readDbf(buf: Buffer): Row[] {
  const count = buf.readUInt32LE(4);
  const headerLen = buf.readUInt16LE(8);
  const recordLen = buf.readUInt16LE(10);
  const fields: { name: string; len: number }[] = [];
  for (let p = 32; buf[p] !== 0x0d; p += 32) {
    fields.push({ name: buf.toString("latin1", p, p + 11).replace(/\0.*$/, ""), len: buf[p + 16] });
  }
  const rows: Row[] = [];
  for (let i = 0; i < count; i++) {
    let p = headerLen + i * recordLen;
    if (buf[p] === 0x2a) continue; // deleted record
    p += 1;
    const row: Row = {};
    for (const f of fields) {
      row[f.name] = buf.toString("utf8", p, p + f.len).trim();
      p += f.len;
    }
    rows.push(row);
  }
  return rows;
}

/** "11/18/26" → "2026-11-18"; empty if unparseable. */
function isoDate(s: string): string {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return "";
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/** "2026-11-18" → "Wed, Nov 18, 2026" */
function displayDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

/** First http(s) URL in a field like "RSVP link: https://…", or empty. */
function firstUrl(s: string): string {
  return s.match(/https?:\/\/\S+/)?.[0] ?? "";
}

function main() {
  const shp = process.argv[2];
  if (!shp) throw new Error("Usage: npm run data:outreach -- /path/to/Events.shp");
  const base = shp.replace(/\.shp$/i, "");
  const points = readPoints(readFileSync(`${base}.shp`));
  const rows = readDbf(readFileSync(`${base}.dbf`));
  if (points.length !== rows.length) throw new Error(`${points.length} shapes but ${rows.length} records`);

  let skipped = 0;
  const features = rows.flatMap((r, i) => {
    const pt = points[i];
    const [w, s, e, n] = NYC_BBOX;
    if (!pt || pt[0] < w || pt[0] > e || pt[1] < s || pt[1] > n) {
      console.warn(`  skipped (no location in NYC): ${r["Submission"]} — "${r["Event Loca"]}"`);
      skipped++;
      return [];
    }
    const date = isoDate(r["Event Date"]);
    const audience = Number(r["Approx Aud"]);
    return [{
      type: "Feature" as const,
      properties: {
        name: r["Submission"],
        date: date ? displayDate(date) : r["Event Date"],
        date_iso: date,
        event_type: r["Event Type"],
        agency: r["Agency/Off"].split(",").map((a) => a.trim()).filter(Boolean).join(", "),
        location: r["Event Loca"].replace(/\s*\n\s*/g, ", "),
        address: (r["formatted_"] || r["AddressRaw"]).replace(/, USA$/, ""),
        audience: Number.isFinite(audience) && audience > 0 ? audience : null,
        details: r["Details"],
        link: firstUrl(r["Relevant L"]),
      },
      geometry: { type: "Point" as const, coordinates: pt },
    }];
  });

  const text = JSON.stringify({ type: "FeatureCollection", features });
  writeFileSync(TARGET, text);
  console.log(`  OK: ${features.length} events (${skipped} skipped), ${(text.length / 1024).toFixed(1)} KiB`);
}

main();
