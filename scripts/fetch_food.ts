#!/usr/bin/env tsx
/**
 * Fetches soup kitchens and food pantries from NYC DCP FacDB and saves as GeoJSON.
 * Output: public/data/pois/food-sites.geojson
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TARGET = join(process.cwd(), "public/data/pois");
const URL =
  "https://data.cityofnewyork.us/resource/ji82-xba5.json" +
  "?$where=facsubgrp=%27SOUP%20KITCHENS%20AND%20FOOD%20PANTRIES%27" +
  "&$limit=1000" +
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

async function main() {
  mkdirSync(TARGET, { recursive: true });
  console.log("Fetching soup kitchens and food pantries from FacDB...");
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
    const rawType = (r.factype ?? "").toUpperCase();
    const type = rawType.includes("SOUP KITCHEN") ? "Soup Kitchen" : "Food Pantry";
    return [{
      type: "Feature" as const,
      properties: {
        name: r.facname ?? "",
        type,
        address: addr,
        borough: r.boro ?? "",
        operator: r.opname ?? "",
      },
      geometry: { type: "Point" as const, coordinates: [lng, lat] },
    }];
  });

  const fc = { type: "FeatureCollection", features };
  const text = JSON.stringify(fc);
  writeFileSync(join(TARGET, "food-sites.geojson"), text);
  console.log(`  OK: ${features.length} features (${skipped} skipped), ${(text.length / 1024).toFixed(1)} KiB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
