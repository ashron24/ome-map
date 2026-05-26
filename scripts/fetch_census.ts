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
  B01003_001E: "totalpop",           // Total population
  B03002_012E: "hispanic",           // Hispanic or Latino (any race)
  B03002_003E: "nh_white",           // Non-Hispanic White alone
  B03002_004E: "black_alone",        // Non-Hispanic Black or African American alone
  B03002_006E: "asian_alone",        // Non-Hispanic Asian alone
  B05002_013E: "foreign_born",       // Foreign born
  B05001_006E: "non_citizen",        // Not a US citizen
  B19013_001E: "median_hh_income",   // Median household income (past 12 months)
  // Hispanic subgroups (B03001 — Hispanic or Latino by Specific Origin)
  B03001_004E: "cnt_mexican",
  B03001_005E: "cnt_puerto_rican",
  B03001_006E: "cnt_cuban",
  B03001_007E: "cnt_dominican",
  B03001_008E: "cnt_central_american",
  B03001_016E: "cnt_south_american",
  B03001_020E: "cnt_colombian",
  B03001_021E: "cnt_ecuadorian",
  // Asian subgroups (B02015 — Asian Alone by Detailed Group, 2023 structure)
  B02015_002E: "cnt_chinese",
  B02015_005E: "cnt_korean",
  B02015_012E: "cnt_filipino",
  B02015_021E: "cnt_asian_indian",
  B02015_022E: "cnt_bangladeshi",
  B02015_025E: "cnt_pakistani",
  // Ancestry table (B04006 — People Reporting Ancestry; race-independent, 5-yr tract-level)
  B04006_006E: "cnt_arab",
  B04006_091E: "cnt_turkish",
  B04006_003E: "cnt_albanian",
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

type Coord = [number, number];

function ringCentroid(ring: Coord[]): Coord {
  let cx = 0, cy = 0, area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const cross = xj * yi - xi * yj;
    area += cross;
    cx += (xi + xj) * cross;
    cy += (yi + yj) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-12) {
    const n = ring.length;
    return [
      ring.reduce((s, p) => s + p[0], 0) / n,
      ring.reduce((s, p) => s + p[1], 0) / n,
    ];
  }
  return [cx / (6 * area), cy / (6 * area)];
}

function computeCentroid(geometry: unknown): Coord | null {
  const g = geometry as { type: string; coordinates: unknown[] } | null;
  if (!g?.type) return null;
  if (g.type === "Polygon") {
    const outerRing = g.coordinates[0] as Coord[];
    if (!outerRing?.length) return null;
    return ringCentroid(outerRing);
  }
  if (g.type === "MultiPolygon") {
    const parts = g.coordinates as Coord[][][];
    if (!parts.length) return null;
    const outerRings = parts.map((p) => p[0]).filter(Boolean);
    const largest = outerRings.reduce((a, b) => b.length > a.length ? b : a);
    return ringCentroid(largest);
  }
  return null;
}

const ETHNICITY_PROPS: ShortName[] = [
  "cnt_mexican", "cnt_puerto_rican", "cnt_cuban", "cnt_dominican",
  "cnt_central_american", "cnt_south_american", "cnt_colombian", "cnt_ecuadorian",
  "cnt_chinese", "cnt_korean", "cnt_filipino", "cnt_asian_indian", "cnt_bangladeshi",
  "cnt_pakistani",
  "cnt_arab", "cnt_turkish", "cnt_albanian",
];

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

  const centroidFeatures: Feature[] = [];
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

    // ethnicity counts
    for (const prop of ETHNICITY_PROPS) {
      f.properties[prop] = d[prop] ?? null;
    }

    // centroid point for graduated symbol layers
    const pt = computeCentroid(f.geometry);
    if (pt) {
      const centroidProps: Record<string, unknown> = { geoid, totalpop };
      for (const prop of ETHNICITY_PROPS) {
        centroidProps[prop] = d[prop] ?? null;
      }
      centroidFeatures.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: pt },
        properties: centroidProps,
      });
    }
  }

  const outPath = join(TARGET, "tracts.geojson");
  const text = JSON.stringify(tracts);
  writeFileSync(outPath, text);
  console.log(
    `\nwrote ${outPath}: ${tracts.features.length} tracts, ${matched} matched, ${(text.length / 1024 / 1024).toFixed(2)} MiB`,
  );

  const centroidsPath = join(TARGET, "tract-centroids.geojson");
  const centroidsText = JSON.stringify({ type: "FeatureCollection", features: centroidFeatures });
  writeFileSync(centroidsPath, centroidsText);
  console.log(`wrote ${centroidsPath}: ${centroidFeatures.length} points, ${(centroidsText.length / 1024).toFixed(1)} KiB`);

  const meta = {
    generated_at: new Date().toISOString(),
    acs_year: ACS_YEAR,
    source: ACS_BASE,
    tract_source: TRACTS_URL,
    tract_total: tracts.features.length,
    tract_with_data: matched,
    centroid_features: centroidFeatures.length,
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
