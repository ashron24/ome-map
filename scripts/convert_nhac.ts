#!/usr/bin/env tsx
/**
 * Converts the DOHMH Neighborhood Health Action Centers CSV to GeoJSON.
 * Usage: npm run data:nhac -- /path/to/DOHMH_Neighborhood_Health_Action_Centers.csv
 * Expected columns: Name, Address, City, State, Zip, Website, Lat, Long
 * Output: public/nhac-sites.geojson (committed — the CSV isn't available to
 * the deploy build)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TARGET = join(process.cwd(), "public/nhac-sites.geojson");

// Generous NYC bounding box: [west, south, east, north]
const NYC_BBOX = [-74.3, 40.45, -73.65, 40.95];

/** Rows of a CSV file as objects keyed by header; handles quoted fields. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);

  const [header, ...data] = rows;
  const keys = header.map((h) => h.trim());
  return data.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

/** Empty for blanks and the "<Null>" that ArcGIS exports write for missing values. */
function clean(s: string | undefined): string {
  return !s || s === "<Null>" ? "" : s;
}

function main() {
  const csv = process.argv[2];
  if (!csv) throw new Error("Usage: npm run data:nhac -- /path/to/file.csv");
  // Strip a byte-order mark, which Excel adds to CSVs
  const rows = parseCsv(readFileSync(csv, "utf8").replace(/^﻿/, ""));

  let skipped = 0;
  const features = rows.flatMap((r) => {
    const lat = Number(r["Lat"]);
    const lon = Number(r["Long"]);
    const [w, s, e, n] = NYC_BBOX;
    if (!(lon >= w && lon <= e && lat >= s && lat <= n)) {
      console.warn(`  skipped (no location in NYC): ${r["Name"]}`);
      skipped++;
      return [];
    }
    const city = clean(r["City"]);
    const street = clean(r["Address"]);
    const stateZip = [clean(r["State"]), clean(r["Zip"])].filter(Boolean).join(" ");
    return [{
      type: "Feature" as const,
      properties: {
        name: clean(r["Name"]),
        address: [street, city, stateZip].filter(Boolean).join(", "),
        borough: city,
        website: clean(r["Website"]),
      },
      geometry: { type: "Point" as const, coordinates: [lon, lat] },
    }];
  });

  const text = JSON.stringify({ type: "FeatureCollection", features });
  writeFileSync(TARGET, text);
  console.log(`  OK: ${features.length} centers (${skipped} skipped), ${(text.length / 1024).toFixed(1)} KiB`);
}

main();
