#!/usr/bin/env tsx
/**
 * Fetches DSNY Sanitation District boundaries from NYC Open Data and saves as GeoJSON.
 * Runs independently so dsny.geojson is always generated regardless of which
 * boundaries path (build_boundaries or fetch_boundaries) ran first.
 * Output: public/data/boundaries/dsny.geojson
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TARGET = join(process.cwd(), "public/data/boundaries");
const URL = "https://data.cityofnewyork.us/resource/i6mn-amj2.geojson?$limit=100";

async function main() {
  mkdirSync(TARGET, { recursive: true });
  console.log("Fetching DSNY sanitation districts...");
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const fc = (await res.json()) as GeoJSON.FeatureCollection;

  let skipped = 0;
  const features = fc.features.flatMap((f) => {
    if (!f.geometry) { skipped++; return []; }
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const nameCol = props["district"];
    if (!nameCol) { skipped++; return []; }
    return [{ type: "Feature" as const, properties: { nameCol: String(nameCol) }, geometry: f.geometry }];
  });

  const out = { type: "FeatureCollection", features };
  const text = JSON.stringify(out);
  writeFileSync(join(TARGET, "dsny.geojson"), text);
  console.log(`  OK: ${features.length} features (${skipped} skipped), ${(text.length / 1024).toFixed(1)} KiB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
