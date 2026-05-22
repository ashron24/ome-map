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

type DCObservationResponse = {
  byVariable?: Record<
    string,
    {
      byEntity?: Record<
        string,
        {
          orderedFacets?: Array<{
            facetId?: string;
            observations?: Array<{ date?: string; value?: number }>;
          }>;
        }
      >;
    }
  >;
};

const TARGET = join(process.cwd(), "public/data/census");
const TRACTS_URL =
  "https://data.cityofnewyork.us/resource/63ge-mke6.geojson?$limit=5000";
const DC_URL = "https://api.datacommons.org/v2/observation";

// Variables to fetch from Data Commons (tract-level ACS5)
const DC_VARS = [
  "Count_Person",
  "Count_Person_HispanicOrLatino",
  "Count_Person_WhiteAloneNotHispanicOrLatino",
  "Count_Person_BlackOrAfricanAmericanAlone",
  "Count_Person_AsianAlone",
  "Count_Person_ForeignBorn",
  "Count_Person_NotAUSCitizen",
  "Median_Income_Household",
] as const;

const SHORT: Record<(typeof DC_VARS)[number], string> = {
  Count_Person: "totalpop",
  Count_Person_HispanicOrLatino: "hispanic",
  Count_Person_WhiteAloneNotHispanicOrLatino: "nh_white",
  Count_Person_BlackOrAfricanAmericanAlone: "black_alone",
  Count_Person_AsianAlone: "asian_alone",
  Count_Person_ForeignBorn: "foreign_born",
  Count_Person_NotAUSCitizen: "non_citizen",
  Median_Income_Household: "median_hh_income",
};

// Prefer ACS 5yr survey facets
const ACS5_FACET_KEYWORDS = ["CensusACS5YearSurvey", "CensusACS5yrSurvey"];

const BATCH_SIZE = 250;

async function fetchTractsGeometry(): Promise<FeatureCollection> {
  console.log("fetching NYC tract polygons from NYC Open Data...");
  const res = await fetch(TRACTS_URL);
  if (!res.ok) throw new Error(`tracts HTTP ${res.status}`);
  const fc = (await res.json()) as FeatureCollection;
  console.log(`  got ${fc.features.length} tracts`);
  return fc;
}


type PickedObs = { value: number; date: string; importName: string };

async function fetchBatch(geoIds: string[]): Promise<Record<string, Record<string, PickedObs>>> {
  const apiKey = process.env.DC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "DC_API_KEY env var is required (set via shell or .env from civic-ai-tools)",
    );
  }
  const dcids = geoIds.map((g) => `geoId/${g}`);
  const body = {
    date: "LATEST",
    entity: { dcids },
    variable: { dcids: [...DC_VARS] },
    select: ["entity", "variable", "value", "date"],
  };
  const res = await fetch(DC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DC HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const raw = (await res.json()) as DCObservationResponse & {
    facets?: Record<string, { importName?: string }>;
  };
  const facetMeta = raw.facets ?? {};
  const result: Record<string, Record<string, PickedObs>> = {};
  for (const [varName, vData] of Object.entries(raw.byVariable ?? {})) {
    const short = SHORT[varName as keyof typeof SHORT];
    if (!short) continue;
    for (const [dcid, eData] of Object.entries(vData.byEntity ?? {})) {
      const geoid = dcid.replace(/^geoId\//, "");
      const facets = eData.orderedFacets ?? [];
      const picked = pickObservationWithProvenance(facets, facetMeta);
      if (!picked) continue;
      if (!result[geoid]) result[geoid] = {};
      result[geoid][short] = picked;
    }
  }
  return result;
}

function pickObservationWithProvenance(
  facets: Array<{
    facetId?: string;
    observations?: Array<{ date?: string; value?: number }>;
  }>,
  facetMeta: Record<string, { importName?: string }>,
): PickedObs | null {
  for (const facet of facets) {
    const importName = facet.facetId
      ? facetMeta[facet.facetId]?.importName ?? ""
      : "";
    const isACS5 = ACS5_FACET_KEYWORDS.some((k) => importName.includes(k));
    if (isACS5) {
      const obs = facet.observations?.[0];
      if (obs?.value !== undefined && obs.value !== null) {
        return { value: obs.value, date: obs.date ?? "", importName };
      }
    }
  }
  for (const facet of facets) {
    const importName = facet.facetId
      ? facetMeta[facet.facetId]?.importName ?? ""
      : "";
    const obs = facet.observations?.[0];
    if (obs?.value !== undefined && obs.value !== null) {
      return { value: obs.value, date: obs.date ?? "", importName };
    }
  }
  return null;
}

function pctOrNull(num: number | undefined, denom: number | undefined): number | null {
  if (num === undefined || denom === undefined || denom <= 0) return null;
  return Math.round((num / denom) * 1000) / 10; // one decimal
}

async function main() {
  mkdirSync(TARGET, { recursive: true });
  const tracts = await fetchTractsGeometry();

  const geoIds = tracts.features
    .map((f) => (f.properties.geoid as string) ?? "")
    .filter(Boolean);
  console.log(`querying DC for ${geoIds.length} tracts, ${DC_VARS.length} vars, batches of ${BATCH_SIZE}`);

  const combined: Record<string, Record<string, { value: number; date: string }>> = {};
  for (let i = 0; i < geoIds.length; i += BATCH_SIZE) {
    const batch = geoIds.slice(i, i + BATCH_SIZE);
    process.stdout.write(`  batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} tracts...`);
    const data = await fetchBatch(batch);
    Object.assign(combined, data);
    const populated = Object.keys(data).length;
    console.log(` ${populated} returned`);
  }

  // Per-variable provenance tally
  const provenance: Record<string, { selected_vintage: string; coverage: Record<string, number>; sample_picked: Record<string, number> }> = {};
  for (const short of Object.values(SHORT)) {
    provenance[short] = {
      selected_vintage: "",
      coverage: { acs5_latest: 0, acs5_older: 0, decennial: 0, other: 0, no_data: 0 },
      sample_picked: {},
    };
  }

  let tractsWithData = 0;
  for (const f of tracts.features) {
    const geoid = (f.properties.geoid as string) ?? "";
    const dcData = combined[geoid];
    if (!dcData) {
      for (const short of Object.values(SHORT)) {
        provenance[short].coverage.no_data += 1;
      }
      continue;
    }
    tractsWithData++;

    const totalpop = dcData.totalpop?.value;
    const hispanic = dcData.hispanic?.value;
    const nh_white = dcData.nh_white?.value;
    const black_alone = dcData.black_alone?.value;
    const asian_alone = dcData.asian_alone?.value;
    const foreign_born = dcData.foreign_born?.value;
    const non_citizen = dcData.non_citizen?.value;
    const median_hh_income = dcData.median_hh_income?.value;

    f.properties.totalpop = totalpop ?? null;
    f.properties.median_hh_income = median_hh_income ?? null;
    f.properties.pct_hispanic = pctOrNull(hispanic, totalpop);
    f.properties.pct_nh_white = pctOrNull(nh_white, totalpop);
    f.properties.pct_black = pctOrNull(black_alone, totalpop);
    f.properties.pct_asian = pctOrNull(asian_alone, totalpop);
    f.properties.pct_foreign_born = pctOrNull(foreign_born, totalpop);
    f.properties.pct_non_citizen = pctOrNull(non_citizen, totalpop);

    for (const short of Object.values(SHORT)) {
      const obs = dcData[short];
      const p = provenance[short];
      if (!obs) {
        p.coverage.no_data += 1;
        continue;
      }
      const key = `${obs.importName}@${obs.date}`;
      p.sample_picked[key] = (p.sample_picked[key] ?? 0) + 1;
      const isACS5 = ACS5_FACET_KEYWORDS.some((k) => obs.importName.includes(k));
      if (isACS5 && obs.date === "2024") p.coverage.acs5_latest += 1;
      else if (isACS5) p.coverage.acs5_older += 1;
      else if (obs.importName.includes("Decennial")) p.coverage.decennial += 1;
      else p.coverage.other += 1;
    }
  }

  // Pick the dominant vintage label per variable
  for (const short of Object.keys(provenance)) {
    const picks = provenance[short].sample_picked;
    let topKey = "";
    let topCount = 0;
    for (const [k, n] of Object.entries(picks)) {
      if (n > topCount) {
        topCount = n;
        topKey = k;
      }
    }
    if (topKey) {
      const [importName, date] = topKey.split("@");
      provenance[short].selected_vintage = `${importName} ${date}`;
    } else {
      provenance[short].selected_vintage = "no data";
    }
  }

  const outPath = join(TARGET, "tracts.geojson");
  const text = JSON.stringify(tracts);
  writeFileSync(outPath, text);
  console.log(`\nwrote ${outPath}: ${tracts.features.length} tracts, ${tractsWithData} with DC data, ${(text.length / 1024 / 1024).toFixed(2)} MiB`);

  const meta = {
    generated_at: new Date().toISOString(),
    tract_source: TRACTS_URL,
    dc_endpoint: DC_URL,
    tract_total: tracts.features.length,
    tract_with_data: tractsWithData,
    variables: DC_VARS.map((v) => {
      const short = SHORT[v];
      const p = provenance[short];
      return {
        dc_dcid: v,
        output_key: short,
        selected_vintage: p.selected_vintage,
        coverage: p.coverage,
        sample_picked: p.sample_picked,
      };
    }),
    attribution:
      "U.S. Census Bureau ACS 5-Year, served via Google Data Commons (https://datacommons.org)",
  };
  writeFileSync(join(TARGET, "_meta.json"), JSON.stringify(meta, null, 2));
  console.log(`metadata: ${join(TARGET, "_meta.json")}`);
}

main();
