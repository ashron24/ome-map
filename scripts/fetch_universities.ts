#!/usr/bin/env tsx
/**
 * Fetches colleges and universities from NYC DCP FacDB and saves as GeoJSON.
 * Output: public/data/pois/universities.geojson
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TARGET = join(process.cwd(), "public/data/pois");
const URL =
  "https://data.cityofnewyork.us/resource/ji82-xba5.json" +
  "?$where=facsubgrp=%27COLLEGES%20OR%20UNIVERSITIES%27" +
  "&$limit=500" +
  "&$select=facname,factype,address,city,boro,zipcode,opname,latitude,longitude";

type Row = {
  facname?: string;
  factype?: string;
  address?: string;
  city?: string;
  boro?: string;
  zipcode?: string;
  opname?: string;
  latitude?: string;
  longitude?: string;
};

function institutionKind(factype: string): string {
  const t = factype.toUpperCase();
  if (t.startsWith("CUNY") || t.startsWith("SUNY")) return "CUNY/SUNY";
  if (t.includes("COMMUNITY COLLEGE") || t.includes("2 YEAR") || t.includes("2-YEAR")) return "Community College";
  return "Private / Other";
}

async function main() {
  mkdirSync(TARGET, { recursive: true });
  console.log("Fetching colleges and universities from FacDB...");
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
    const addr = [r.address, r.city ?? r.boro, r.zipcode].filter(Boolean).join(", ");
    return [{
      type: "Feature" as const,
      properties: {
        name: r.facname ?? "",
        type: r.factype ?? "",
        kind: institutionKind(r.factype ?? ""),
        address: addr,
        borough: r.boro ?? "",
        operator: r.opname ?? "",
      },
      geometry: { type: "Point" as const, coordinates: [lng, lat] },
    }];
  });

  const fc = { type: "FeatureCollection", features };
  const text = JSON.stringify(fc);
  writeFileSync(join(TARGET, "universities.geojson"), text);
  console.log(`  OK: ${features.length} features (${skipped} skipped), ${(text.length / 1024).toFixed(1)} KiB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
