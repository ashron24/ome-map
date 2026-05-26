#!/usr/bin/env tsx
/**
 * Fetches NYC district boundary GeoJSON from NYC Planning's ArcGIS REST API.
 * Alternative to build_boundaries.ts (which requires the nyc-geography-crosswalks repo).
 *
 * Output: public/data/boundaries/{id}.geojson
 * Each feature has a `nameCol` property (used by layers.ts for labels + promoteId)
 * and optionally a `nameAlt` property.
 */
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

type BoundaryDef = {
  id: string;
  label: string;
  url: string;
  nameField: string | ((props: Record<string, unknown>) => string | null);
  nameAltField?: string;
};

const TARGET = join(process.cwd(), "public/data/boundaries");
const ARCGIS =
  "https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services";
const Q = (svc: string, fields = "*", limit = 5000) =>
  `${ARCGIS}/${svc}/FeatureServer/0/query?where=1%3D1&outFields=${fields}&f=geojson&resultRecordCount=${limit}`;

// MODZCTA zip codes come from NYC Open Data (Socrata) — ArcGIS doesn't have them
const SOCRATA = "https://data.cityofnewyork.us/resource";

const BOUNDARIES: BoundaryDef[] = [
  // ── Core ──────────────────────────────────────────────────────────────────
  {
    id: "nta",
    label: "Neighborhood Tabulation Areas (2020 NTAs)",
    url: Q("NYC_2020_NTA"),
    nameField: "NTAName",
    nameAltField: "NTACode",
  },
  {
    id: "cd",
    label: "Community Districts",
    url: Q("NYC_Community_Districts"),
    // BoroCD is a 3-digit boro-prefixed code (e.g. 101 = Manhattan CD1, 410 = Queens CD10).
    // Strip the leading boro digit so the "CD " label prefix produces "CD 1", "CD 10", etc.
    nameField: (props) => {
      const raw = Number(props["BoroCD"]);
      if (!Number.isFinite(raw)) return null;
      return String(raw % 100);
    },
  },
  {
    id: "cc",
    label: "City Council Districts",
    url: Q("NYC_City_Council_Districts"),
    nameField: "CounDist",
  },
  {
    id: "ss",
    label: "NY State Senate Districts",
    url: Q("NYC_State_Senate_Districts"),
    nameField: "StSenDist",
  },
  {
    id: "sa",
    label: "NY State Assembly Districts",
    url: Q("NYC_State_Assembly_Districts"),
    nameField: "AssemDist",
  },
  {
    id: "nycongress",
    label: "US Congressional Districts",
    url: Q("NYC_Congressional_Districts"),
    nameField: "CongDist",
  },
  {
    id: "pp",
    label: "Police Precincts",
    url: Q("NYC_Police_Precincts"),
    nameField: "Precinct",
  },
  {
    id: "zipcode",
    label: "ZIP Codes (MODZCTA)",
    url: `${SOCRATA}/pri4-ifjk.geojson?$limit=300`,
    nameField: "modzcta",
  },
  {
    id: "sd",
    label: "School Districts",
    url: Q("NYC_School_Districts"),
    nameField: "SchoolDist",
  },
  // ── Extra ─────────────────────────────────────────────────────────────────
  {
    id: "fb",
    label: "Fire Battalions",
    url: Q("NYC_Fire_Battalions"),
    nameField: "FireBN",
  },
  {
    id: "hc",
    label: "Health Center Districts",
    url: Q("NYC_Health_Areas"),
    // Combine borough abbreviation + zero-padded area number, e.g. "BK-01"
    nameField: (props) => {
      const boro = props["BoroName"];
      const area = props["HealthArea"];
      if (!boro || !area) return null;
      const abbr: Record<string, string> = {
        Manhattan: "MN",
        Brooklyn: "BK",
        Bronx: "BX",
        Queens: "QN",
        "Staten Island": "SI",
      };
      const b = abbr[String(boro)] ?? String(boro).slice(0, 2).toUpperCase();
      return `${b}-${String(area).padStart(2, "0")}`;
    },
  },
  {
    id: "bid",
    label: "Business Improvement Districts",
    url: Q("BIDs"),
    nameField: "BID",
  },
  {
    id: "hd",
    label: "Historic Districts (LPC)",
    url: Q("v_GFT_Historic_Districts"),
    // variable_id format: "code-District Name" — extract everything after first "-"
    nameField: (props) => {
      const raw = String(props["variable_id"] ?? "");
      const dash = raw.indexOf("-");
      return dash > -1 ? raw.slice(dash + 1).trim() : raw || null;
    },
  },
];

// DSNY sanitation districts are not currently available via the Planning ArcGIS
// service or NYC Open Data GeoJSON API; skipped until a working source is found.

async function fetchBoundary(
  def: BoundaryDef,
): Promise<{ id: string; count: number; bytes: number } | { id: string; error: string }> {
  const t0 = Date.now();
  try {
    const res = await fetch(def.url);
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${def.url}`);
    const fc = (await res.json()) as FeatureCollection;

    if (!Array.isArray(fc.features))
      throw new Error("response missing features array");

    const remapped: Feature[] = fc.features.flatMap((f) => {
      if (!f.geometry) return [];
      const props = f.properties ?? {};

      let nameCol: string | null;
      if (typeof def.nameField === "function") {
        nameCol = def.nameField(props);
      } else {
        const raw = props[def.nameField];
        nameCol =
          raw !== undefined && raw !== null && raw !== "" ? String(raw) : null;
      }
      if (!nameCol) return [];

      const out: Record<string, unknown> = { nameCol };
      if (def.nameAltField) {
        const alt = props[def.nameAltField];
        if (alt !== undefined && alt !== null && alt !== "")
          out.nameAlt = String(alt);
      }
      return [{ type: "Feature" as const, properties: out, geometry: f.geometry }];
    });

    const outFc: FeatureCollection = { type: "FeatureCollection", features: remapped };
    const text = JSON.stringify(outFc);
    writeFileSync(join(TARGET, `${def.id}.geojson`), text);
    const ms = Date.now() - t0;
    console.log(
      `  OK   ${def.id.padEnd(12)} ${String(remapped.length).padStart(4)} features, ${(text.length / 1024).toFixed(1)} KiB, ${ms}ms`,
    );
    return { id: def.id, count: remapped.length, bytes: text.length };
  } catch (err) {
    const ms = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  FAIL ${def.id.padEnd(12)} ${msg} (${ms}ms)`);
    return { id: def.id, error: msg };
  }
}

async function main() {
  mkdirSync(TARGET, { recursive: true });
  console.log(`fetching ${BOUNDARIES.length} boundary datasets → ${TARGET}\n`);

  const results = await Promise.all(BOUNDARIES.map(fetchBoundary));
  const ok = results.filter((r) => "count" in r);
  const failed = results.filter((r) => "error" in r);

  console.log(`\n${ok.length}/${BOUNDARIES.length} OK, ${failed.length} failed`);
  if (failed.length > 0) {
    console.log("Failed (needs manual fix):");
    for (const f of failed)
      console.log(`  - ${f.id}: ${(f as { error: string }).error}`);
  }

  writeFileSync(
    join(TARGET, "_manifest.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        datasets: BOUNDARIES.map((d) => ({ id: d.id, label: d.label, source: d.url })),
        results,
      },
      null,
      2,
    ),
  );
}

main();
