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
import { clean, parseCsv, stripBom } from "./lib/csv.ts";

const TARGET = join(process.cwd(), "public/nhac-sites.geojson");

// Generous NYC bounding box: [west, south, east, north]
const NYC_BBOX = [-74.3, 40.45, -73.65, 40.95];

// Typos in the source CSV (as of Nov 2026), by center name; applied on every run
const CORRECTIONS: Record<string, Record<string, string>> = {
  "East Harlem Asthma Center of Excellence": { Zip: "10029" }, // was 11029
  "Tremont Neighborhood Health Action Center": { Address: "1826 Arthur Avenue" }, // was "Arthure"
};

function main() {
  const csv = process.argv[2];
  if (!csv) throw new Error("Usage: npm run data:nhac -- /path/to/file.csv");
  const rows = parseCsv(stripBom(readFileSync(csv, "utf8")));

  let skipped = 0;
  const features = rows.flatMap((raw) => {
    const r = { ...raw, ...CORRECTIONS[raw["Name"]] };
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
