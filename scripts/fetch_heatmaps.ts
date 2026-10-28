#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TARGET = join(process.cwd(), "public/data/heatmaps");
const FETCH_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 3;

// MapPLUTO (NYC Planning, 64uk-42ks) — authoritative BBL → centroid lookup
const PLUTO_ID = "64uk-42ks";
const PLUTO_PAGE = 50_000;

// DEP ECB borough text → boroid digit (matches MapPLUTO BBL prefix)
const BORO_CODE: Record<string, string> = {
  MANHATTAN: "1", BRONX: "2", BROOKLYN: "3",
  QUEENS: "4", "STATEN IS": "5", "STATEN ISLAND": "5",
};

// Construct a 10-digit BBL string: boroid(1) + block(5) + lot(4)
function makeBBL(boro: string, block: string, lot: string): string | null {
  if (!boro || !block || !lot) return null;
  return boro + block.padStart(5, "0") + lot.padStart(4, "0");
}

// MapPLUTO stores BBL as a decimal float string ("1008000020.00000000"); strip it.
function normBBL(raw: string): string {
  return raw.split(".")[0];
}

type Dataset = {
  id: string;
  label: string;
  url: string;
  bblFromRow: (row: Record<string, string>) => string | null;
  propsFromRow: (row: Record<string, string>) => Record<string, unknown>;
};

// HPD Open Violations (csn4-vhvf).
//   No lat/lon; geocoded via MapPLUTO BBL centroid.
//   Filter: class B (hazardous) + C (immediately hazardous) only, most recent 150k.
//   Class C weighted 3× in the heatmap via a "weight" property.
//
// DOB Safety Violations (855j-jady).
//   Has bbl directly. Active violations, most recent 150k.
//   Switched from direct lat/lon to MapPLUTO centroid for consistency.
//
// DEP ECB Violations (skr7-cxt3).
//   No lat/lon; block/lot fields available for BBL construction.
//   Open violations (Compliance Due | Both Due | Penalty Due) with location, all ~170k.
const DATASETS: Dataset[] = [
  {
    id: "hpd-violations",
    label: "HPD Open Violations (class B+C)",
    url: `https://data.cityofnewyork.us/resource/csn4-vhvf.json?$limit=150000&$select=boroid,block,lot,class,currentstatus&$where=class IN('B','C')&$order=currentstatusdate DESC`,
    bblFromRow: (row) => makeBBL(row["boroid"] ?? "", row["block"] ?? "", row["lot"] ?? ""),
    propsFromRow: (row) => {
      const cls = row["class"] ?? "";
      return {
        class: cls,
        status: row["currentstatus"] ?? "",
        // Class C (immediately hazardous) weighted 3×; class B weighted 1×
        ...(cls === "C" ? { weight: 3 } : {}),
      };
    },
  },
  {
    id: "dob-violations",
    label: "DOB Active Safety Violations",
    url: `https://data.cityofnewyork.us/resource/855j-jady.json?$limit=150000&$select=bbl,device_type,violation_type&$where=violation_status='Active' AND bbl IS NOT NULL&$order=violation_issue_date DESC`,
    bblFromRow: (row) => {
      const raw = row["bbl"];
      return raw ? normBBL(raw) : null;
    },
    propsFromRow: (row) => ({
      device_type: row["device_type"] ?? "",
      violation_type: row["violation_type"] ?? "",
    }),
  },
  {
    id: "dep-ecb-violations",
    label: "DEP ECB Open Violations",
    url: `https://data.cityofnewyork.us/resource/skr7-cxt3.json?$limit=200000&$select=violation_location_borough,violation_location_block_no,violation_location_lot_no,compliance_status,charge_1_code_description&$where=violation_location_block_no IS NOT NULL AND (compliance_status='Compliance Due' OR compliance_status='Both Due' OR compliance_status='Penalty Due')&$order=violation_date DESC`,
    bblFromRow: (row) => {
      const boro = BORO_CODE[(row["violation_location_borough"] ?? "").trim().toUpperCase()];
      return makeBBL(
        boro ?? "",
        row["violation_location_block_no"] ?? "",
        row["violation_location_lot_no"] ?? "",
      );
    },
    propsFromRow: (row) => ({
      status: row["compliance_status"] ?? "",
      description: (row["charge_1_code_description"] ?? "").slice(0, 100),
    }),
  },
];

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
        process.stdout.write(`    retry ${attempt}/${MAX_RETRIES - 1} in ${delay / 1000}s...\n`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

async function fetchPLUTOCentroids(): Promise<Map<string, [number, number]>> {
  console.log("  fetching MapPLUTO BBL centroids (paginated)...");

  const countRes = await fetchWithRetry(
    `https://data.cityofnewyork.us/resource/${PLUTO_ID}.json?$select=count(*)&$where=latitude IS NOT NULL`,
  );
  if (!countRes.ok) throw new Error(`MapPLUTO count: HTTP ${countRes.status}`);
  const [{ count }] = (await countRes.json()) as [{ count: string }];
  const total = Number(count);
  const pages = Math.ceil(total / PLUTO_PAGE);
  console.log(`    ${total.toLocaleString()} lots across ${pages} pages`);

  const centroids = new Map<string, [number, number]>();

  const CONCURRENCY = 5;
  for (let i = 0; i < pages; i += CONCURRENCY) {
    const batch = Array.from({ length: Math.min(CONCURRENCY, pages - i) }, (_, j) => {
      const offset = (i + j) * PLUTO_PAGE;
      return fetchWithRetry(
        `https://data.cityofnewyork.us/resource/${PLUTO_ID}.json?$limit=${PLUTO_PAGE}&$offset=${offset}&$select=bbl,latitude,longitude&$where=latitude IS NOT NULL`,
      ).then(async (res) => {
        if (!res.ok) throw new Error(`MapPLUTO page offset=${offset}: HTTP ${res.status}`);
        return res.json() as Promise<Array<Record<string, string>>>;
      });
    });

    const results = await Promise.all(batch);
    for (const rows of results) {
      for (const row of rows) {
        const bbl = normBBL(row["bbl"] ?? "");
        const lat = Number(row["latitude"]);
        const lon = Number(row["longitude"]);
        if (bbl && Number.isFinite(lat) && Number.isFinite(lon)) {
          centroids.set(bbl, [lon, lat]);
        }
      }
    }
    const done = Math.min(i + CONCURRENCY, pages);
    process.stdout.write(`    ${done}/${pages} pages — ${centroids.size.toLocaleString()} lots indexed\n`);
  }

  return centroids;
}

async function main() {
  mkdirSync(TARGET, { recursive: true });
  console.log(`writing heatmaps to ${TARGET}\n`);

  const centroids = await fetchPLUTOCentroids();
  console.log(`  MapPLUTO: ${centroids.size.toLocaleString()} BBL centroids ready\n`);

  for (const ds of DATASETS) {
    const t0 = Date.now();
    try {
      const res = await fetchWithRetry(ds.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().then((t) => t.slice(0, 200))}`);
      const rows = (await res.json()) as Array<Record<string, string>>;

      const features = rows.flatMap((row) => {
        const bbl = ds.bblFromRow(row);
        if (!bbl) return [];
        const coords = centroids.get(bbl);
        if (!coords) return [];
        return [{
          type: "Feature" as const,
          properties: ds.propsFromRow(row),
          geometry: { type: "Point" as const, coordinates: coords },
        }];
      });

      const fc = { type: "FeatureCollection", features };
      const text = JSON.stringify(fc);
      writeFileSync(join(TARGET, `${ds.id}.geojson`), text);
      const ms = Date.now() - t0;
      const matchPct = rows.length > 0 ? ((features.length / rows.length) * 100).toFixed(1) : "0.0";
      console.log(
        `  OK   ${ds.id.padEnd(22)} ${String(features.length).padStart(7)} features` +
        ` (${matchPct}% BBL match), ${(text.length / 1024 / 1024).toFixed(1)} MiB, ${ms}ms`,
      );
    } catch (err) {
      const ms = Date.now() - t0;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  FAIL ${ds.id.padEnd(22)} ${msg} (${ms}ms)`);
      process.exit(1);
    }
  }
}

main();
