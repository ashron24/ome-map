#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Feature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: unknown;
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: Feature[];
};

const TARGET = join(process.cwd(), "public/data/census");
const TRACTS_URL =
  "https://data.cityofnewyork.us/resource/63ge-mke6.geojson?$limit=5000";

// ACS 5-Year endpoint — update ACS_YEAR when a newer release becomes available
const ACS_YEAR = 2023;
const ACS_BASE = `https://api.census.gov/data/${ACS_YEAR}/acs/acs5`;

// Census variable codes → internal short names used to compute the output properties
const ACS_VARS = {
  B01003_001E: "totalpop",         // Total population
  B03002_012E: "hispanic",         // Hispanic or Latino (any race)
  B03002_003E: "nh_white",         // Non-Hispanic White alone
  B03002_004E: "black_alone",      // Non-Hispanic Black or African American alone
  B03002_006E: "asian_alone",      // Non-Hispanic Asian alone
  B05002_013E: "foreign_born",     // Foreign born
  B05001_006E: "non_citizen",      // Not a US citizen
  B19013_001E: "median_hh_income", // Median household income (past 12 months)
} as const;

type ShortName = (typeof ACS_VARS)[keyof typeof ACS_VARS];
type ACSData = Partial<Record<ShortName, number>>;

// Census Bureau uses large negative sentinels for suppressed/unavailable cells
const SUPPRESSED = new Set([-666666666, -999999999, -888888888, -222222222]);

const NYC_COUNTIES = ["005", "047", "061", "081", "085"]; // Bronx, Kings, NY, Queens, Richmond
const NY_STATE = "36";

function parseCensusValue(raw: string | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || SUPPRESSED.has(n) || n < 0) return null;
  return n;
}

function pctOrNull(num: number | null, denom: number | null): number | null {
  if (num === null || denom === null || denom <= 0) return null;
  return Math.round((num / denom) * 1000) / 10; // one decimal place
}

async function fetchTractsGeometry(): Promise<FeatureCollection> {
  console.log("fetching NYC tract polygons from NYC Open Data...");
  const res = await fetch(TRACTS_URL);
  if (!res.ok) throw new Error(`tracts HTTP ${res.status}`);
  const fc = (await res.json()) as FeatureCollection;
  console.log(`  got ${fc.features.length} tracts`);
  return fc;
}

async function fetchACSByCounty(county: string, apiKey: string): Promise<Map<string, ACSData>> {
  const varList = Object.keys(ACS_VARS).join(",");
  const url =
    `${ACS_BASE}?get=${varList}` +
    `&for=tract:*&in=state:${NY_STATE}%20county:${county}` +
    `&key=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Census API ${res.status} (county ${county}): ${body.slice(0, 200)}`);
  }

  const rows = (await res.json()) as string[][];
  const [headers, ...data] = rows;

  const result = new Map<string, ACSData>();
  for (const row of data) {
    const record: Record<string, string | null> = {};
    headers.forEach((h, i) => { record[h] = row[i] ?? null; });

    // Build 11-digit GEOID matching the geometry's `geoid` property
    const geoid = `${record["state"]}${record["county"]}${record["tract"]}`;
    const d: ACSData = {};
    for (const [code, short] of Object.entries(ACS_VARS) as [string, ShortName][]) {
      const v = parseCensusValue(record[code]);
      if (v !== null) d[short] = v;
    }
    result.set(geoid, d);
  }
  return result;
}

async function fetchAllACSData(apiKey: string): Promise<Map<string, ACSData>> {
  console.log(
    `fetching ACS ${ACS_YEAR} 5-Year for ${NYC_COUNTIES.length} NYC counties...`,
  );
  const combined = new Map<string, ACSData>();
  await Promise.all(
    NYC_COUNTIES.map(async (county) => {
      const data = await fetchACSByCounty(county, apiKey);
      for (const [geoid, d] of data) combined.set(geoid, d);
      console.log(`  county ${county}: ${data.size} tracts`);
    }),
  );
  console.log(`  total: ${combined.size} tracts with ACS data`);
  return combined;
}

async function main() {
  const apiKey = process.env.CENSUS_API_KEY;
  if (!apiKey) {
    console.error(
      "Error: CENSUS_API_KEY environment variable is required.\n" +
      "Get a free key at https://api.census.gov/data/key_signup.html\n" +
      "Then run: CENSUS_API_KEY=your_key npm run data:census\n" +
      "For GitHub Actions, add CENSUS_API_KEY as a repository secret.",
    );
    process.exit(1);
  }

  mkdirSync(TARGET, { recursive: true });

  const [tracts, acsData] = await Promise.all([
    fetchTractsGeometry(),
    fetchAllACSData(apiKey),
  ]);

  let matched = 0;
  for (const f of tracts.features) {
    const geoid = String(f.properties.geoid ?? "");
    const d = acsData.get(geoid);
    if (!d) continue;
    matched++;

    const totalpop = d.totalpop ?? null;
    f.properties.totalpop = totalpop;
    f.properties.median_hh_income = d.median_hh_income ?? null;
    f.properties.pct_hispanic = pctOrNull(d.hispanic ?? null, totalpop);
    f.properties.pct_nh_white = pctOrNull(d.nh_white ?? null, totalpop);
    f.properties.pct_black = pctOrNull(d.black_alone ?? null, totalpop);
    f.properties.pct_asian = pctOrNull(d.asian_alone ?? null, totalpop);
    f.properties.pct_foreign_born = pctOrNull(d.foreign_born ?? null, totalpop);
    f.properties.pct_non_citizen = pctOrNull(d.non_citizen ?? null, totalpop);
  }

  const outPath = join(TARGET, "tracts.geojson");
  const text = JSON.stringify(tracts);
  writeFileSync(outPath, text);
  console.log(
    `\nwrote ${outPath}: ${tracts.features.length} tracts, ${matched} matched, ${(text.length / 1024 / 1024).toFixed(2)} MiB`,
  );

  const meta = {
    generated_at: new Date().toISOString(),
    acs_year: ACS_YEAR,
    source: ACS_BASE,
    tract_source: TRACTS_URL,
    tract_total: tracts.features.length,
    tract_with_data: matched,
    variables: Object.entries(ACS_VARS).map(([code, short]) => ({
      census_var: code,
      output_key: short,
    })),
    attribution: `U.S. Census Bureau, American Community Survey ${ACS_YEAR} 5-Year Estimates`,
  };
  writeFileSync(join(TARGET, "_meta.json"), JSON.stringify(meta, null, 2));
  console.log(`metadata: ${join(TARGET, "_meta.json")}`);
}

main();
