#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TARGET = join(process.cwd(), "public/data/heatmaps");

const DATASETS = [
  {
    id: "hpd-violations",
    label: "HPD Open Violations",
    // class DESC puts C (immediately hazardous) first so they're kept if we hit the limit
    url: "https://data.cityofnewyork.us/resource/csn4-vhvf.json?$limit=150000&$select=latitude,longitude,class&$where=latitude%20IS%20NOT%20NULL%20AND%20longitude%20IS%20NOT%20NULL&$order=class%20DESC",
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = (await res.json()) as Array<Record<string, string>>;

      const features = rows.flatMap((row) => {
        const lat = Number(row["latitude"]);
        const lon = Number(row["longitude"]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0 || lon === 0) return [];
        return [{
          type: "Feature" as const,
          properties: { severity: row["class"] ?? "A" },
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
