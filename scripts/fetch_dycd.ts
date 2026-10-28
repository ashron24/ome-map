#!/usr/bin/env tsx
/**
 * Fetches DYCD Program Sites from NYC Open Data and saves as GeoJSON.
 * Output: public/data/pois/dycd-sites.geojson
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TARGET = join(process.cwd(), "public/data/pois");
const BASE = "https://data.cityofnewyork.us/resource/ebkm-iyma.json";
const FIELDS = [
  "program_area",
  "program_type",
  "program_site_name",
  "provider",
  "street_address",
  "borough",
  "age_range",
  "latitude",
  "longitude",
].join(",");

type Row = {
  program_area?: string;
  program_type?: string;
  program_site_name?: string;
  provider?: string;
  street_address?: string;
  borough?: string;
  age_range?: string;
  latitude?: string;
  longitude?: string;
};

async function fetchAll(): Promise<Row[]> {
  const limit = 10000;
  let offset = 0;
  const rows: Row[] = [];
  while (true) {
    const url = `${BASE}?$select=${FIELDS}&$limit=${limit}&$offset=${offset}&$order=:id`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching offset ${offset}`);
    const page = (await res.json()) as Row[];
    rows.push(...page);
    if (page.length < limit) break;
    offset += limit;
  }
  return rows;
}

async function main() {
  mkdirSync(TARGET, { recursive: true });
  console.log("Fetching DYCD program sites...");
  const rows = await fetchAll();
  console.log(`  ${rows.length} total rows`);

  let skipped = 0;
  const features = rows.flatMap((r) => {
    const lat = parseFloat(r.latitude ?? "");
    const lng = parseFloat(r.longitude ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
      skipped++;
      return [];
    }
    return [{
      type: "Feature" as const,
      properties: {
        program_area: r.program_area ?? "",
        program_type: r.program_type ?? "",
        name: r.program_site_name ?? "",
        provider: r.provider ?? "",
        address: r.street_address ?? "",
        borough: r.borough ?? "",
        age_range: r.age_range ?? "",
      },
      geometry: { type: "Point" as const, coordinates: [lng, lat] },
    }];
  });

  const fc = { type: "FeatureCollection", features };
  const text = JSON.stringify(fc);
  writeFileSync(join(TARGET, "dycd-sites.geojson"), text);
  console.log(
    `  OK: ${features.length} features (${skipped} skipped, no coords), ${(text.length / 1024).toFixed(1)} KiB`,
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
