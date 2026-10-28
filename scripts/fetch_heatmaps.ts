#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TARGET = join(process.cwd(), "public/data/heatmaps");

type Dataset = {
  id: string;
  label: string;
  url: string;
  renameProps?: Record<string, string>;
};

// HPD Housing Maintenance Code Complaints & Problems (ygpa-z7cr).
// The violations dataset (csn4-vhvf) has no geocoords; this complaints dataset
// is the upstream source — every violation originates from a complaint — and
// does have latitude/longitude. We fetch open complaints only (~60k records).
//
// DOB Safety Violations (855j-jady). Active violations only (~685k total);
// we take the 150k most recent to keep the file size manageable.
// DEP ECB Violations (skr7-cxt3) has no coordinate data — skipped.
const DATASETS: Dataset[] = [
  {
    id: "hpd-violations",
    label: "HPD Open Housing Complaints",
    url: `https://data.cityofnewyork.us/resource/ygpa-z7cr.json?$limit=100000&$select=latitude,longitude,type,major_category&$where=complaint_status='OPEN'`,
    renameProps: { type: "urgency", major_category: "category" },
  },
  {
    id: "dob-violations",
    label: "DOB Active Safety Violations",
    url: `https://data.cityofnewyork.us/resource/855j-jady.json?$limit=150000&$select=latitude,longitude,device_type,violation_type&$where=violation_status='Active' AND latitude IS NOT NULL&$order=violation_issue_date DESC`,
  },
];

const FETCH_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 3;

async function fetchWithRetry(url: string): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      return res;
    } catch (err) {
      clearTimeout(t);
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        const delay = attempt * 3000;
        process.stdout.write(`    retry ${attempt}/${MAX_RETRIES - 1} in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

async function main() {
  mkdirSync(TARGET, { recursive: true });
  console.log(`writing heatmaps to ${TARGET}\n`);

  for (const ds of DATASETS) {
    const t0 = Date.now();
    try {
      const res = await fetchWithRetry(ds.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`);
      const rows = (await res.json()) as Array<Record<string, string>>;

      const features = rows.flatMap((row) => {
        const lat = Number(row["latitude"]);
        const lon = Number(row["longitude"]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0 || lon === 0) return [];
        const props: Record<string, string> = {};
        for (const [k, v] of Object.entries(row)) {
          if (k === "latitude" || k === "longitude") continue;
          const outKey = ds.renameProps?.[k] ?? k;
          props[outKey] = v;
        }
        return [{
          type: "Feature" as const,
          properties: props,
          geometry: { type: "Point" as const, coordinates: [lon, lat] },
        }];
      });

      const fc = { type: "FeatureCollection", features };
      const text = JSON.stringify(fc);
      writeFileSync(join(TARGET, `${ds.id}.geojson`), text);
      const ms = Date.now() - t0;
      console.log(`  OK   ${ds.id.padEnd(20)} ${String(features.length).padStart(6)} features, ${(text.length / 1024 / 1024).toFixed(1)} MiB, ${ms}ms`);
    } catch (err) {
      const ms = Date.now() - t0;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  FAIL ${ds.id.padEnd(20)} ${msg} (${ms}ms)`);
      process.exit(1);
    }
  }
}

main();
