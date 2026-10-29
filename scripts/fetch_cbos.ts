#!/usr/bin/env tsx
/**
 * Fetches NYC Community-Based Organizations from NYC Open Data and saves as GeoJSON.
 * Output: public/data/pois/cbo-sites.geojson
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TARGET = join(process.cwd(), "public/data/pois");
const URL = "https://data.cityofnewyork.us/resource/i4kb-6ab6.json?$limit=500";

type Row = {
  organization_name?: string;
  mission?: string;
  street_address?: string;
  city?: string;
  state?: string;
  postcode?: string;
  borough?: string;
  nta?: string;
  community_board?: string;
  council_district?: string;
  website?: { url?: string };
  latitude?: string;
  longitude?: string;
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function main() {
  mkdirSync(TARGET, { recursive: true });
  console.log("Fetching NYC CBO locations...");
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
    const addr = [r.street_address, r.city].filter(Boolean).join(", ");
    const mission = r.mission ? stripHtml(r.mission) : "";
    const website = r.website?.url ?? "";
    return [{
      type: "Feature" as const,
      properties: {
        name: r.organization_name ?? "",
        mission: mission.length > 300 ? mission.slice(0, 297) + "…" : mission,
        address: addr,
        borough: r.borough ?? "",
        nta: r.nta ?? "",
        community_board: r.community_board ?? "",
        council_district: r.council_district ?? "",
        website,
      },
      geometry: { type: "Point" as const, coordinates: [lng, lat] },
    }];
  });

  const fc = { type: "FeatureCollection", features };
  const text = JSON.stringify(fc);
  writeFileSync(join(TARGET, "cbo-sites.geojson"), text);
  console.log(`  OK: ${features.length} features (${skipped} skipped), ${(text.length / 1024).toFixed(1)} KiB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
