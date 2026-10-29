#!/usr/bin/env tsx
/**
 * Fetches SBS Service Locations from NYC Open Data and saves as GeoJSON.
 * Output: public/data/pois/sbs-sites.geojson
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TARGET = join(process.cwd(), "public/data/pois");
const URL = "https://data.cityofnewyork.us/resource/6smc-7mk6.json?$limit=500";

type Row = {
  name?: string;
  location_type?: string;
  hours?: string;
  number?: string;
  street?: string;
  city?: string;
  borough?: string;
  postcode?: string;
  details?: string;
  latitude?: string;
  longitude?: string;
};

async function main() {
  mkdirSync(TARGET, { recursive: true });
  console.log("Fetching SBS service locations...");
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = (await res.json()) as Row[];
  console.log(`  ${rows.length} total rows`);

  let skipped = 0;
  const features = rows.flatMap((r) => {
    const lat = parseFloat(r.latitude ?? "");
    const lng = parseFloat(r.longitude ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
      skipped++;
      return [];
    }
    const addr = [r.number, r.street].filter(Boolean).join(" ");
    return [{
      type: "Feature" as const,
      properties: {
        name: r.name ?? "",
        location_type: r.location_type ?? "",
        hours: r.hours ?? "",
        address: addr,
        city: r.city ?? "",
        borough: r.borough ?? "",
        details: r.details ?? "",
      },
      geometry: { type: "Point" as const, coordinates: [lng, lat] },
    }];
  });

  const fc = { type: "FeatureCollection", features };
  const text = JSON.stringify(fc);
  writeFileSync(join(TARGET, "sbs-sites.geojson"), text);
  console.log(`  OK: ${features.length} features (${skipped} skipped), ${(text.length / 1024).toFixed(1)} KiB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
