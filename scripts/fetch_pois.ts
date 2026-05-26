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

type LatLonSpec = { lat: string; lon: string };

type Dataset = {
  id: string;
  label: string;
  url: string;
  geometry: "native" | LatLonSpec;
  keepProps?: string[];
  renameProps?: Record<string, string>;
  source: { name: string; href: string };
};

const TARGET = join(process.cwd(), "public/data/pois");

const NYC_BASE = "https://data.cityofnewyork.us/resource";
const NYC_OPEN_DATA = { name: "NYC Open Data", href: "https://opendata.cityofnewyork.us/" };
const NYC_DCP = { name: "NYC DCP FacDB", href: "https://data.cityofnewyork.us/City-Government/Facilities-Database-Active-Facilities/ji82-xba5" };

function facdb(facgroup: string): Dataset["url"] {
  const where = encodeURIComponent(`facgroup='${facgroup}'`);
  return `${NYC_BASE}/ji82-xba5.json?$limit=50000&$where=${where}`;
}

const DATASETS: Dataset[] = [
  {
    id: "schools-public",
    label: "Public Schools (K-12)",
    url: facdb("SCHOOLS (K-12)"),
    geometry: { lat: "latitude", lon: "longitude" },
    keepProps: ["facname", "address", "city", "zipcode", "boro", "optype", "opname", "capacity", "captype"],
    renameProps: { facname: "name", address: "addr" },
    source: NYC_DCP,
  },
  {
    id: "libraries",
    label: "Libraries",
    url: facdb("LIBRARIES"),
    geometry: { lat: "latitude", lon: "longitude" },
    keepProps: ["facname", "address", "city", "zipcode", "boro", "opname"],
    renameProps: { facname: "name", address: "addr" },
    source: NYC_DCP,
  },
  {
    id: "hospitals",
    label: "Hospitals & Clinics",
    url: facdb("HEALTH CARE"),
    geometry: { lat: "latitude", lon: "longitude" },
    keepProps: ["facname", "facsubgrp", "address", "city", "zipcode", "boro", "opname", "capacity", "captype"],
    renameProps: { facname: "name", address: "addr", facsubgrp: "type" },
    source: NYC_DCP,
  },
  {
    id: "cultural",
    label: "Cultural Institutions",
    url: facdb("CULTURAL INSTITUTIONS"),
    geometry: { lat: "latitude", lon: "longitude" },
    keepProps: ["facname", "facsubgrp", "address", "city", "boro", "opname"],
    renameProps: { facname: "name", address: "addr", facsubgrp: "type" },
    source: NYC_DCP,
  },
  {
    id: "daycare-prek",
    label: "Day Care & Pre-K",
    url: facdb("DAY CARE AND PRE-KINDERGARTEN"),
    geometry: { lat: "latitude", lon: "longitude" },
    keepProps: ["facname", "facsubgrp", "address", "boro", "opname", "capacity"],
    renameProps: { facname: "name", address: "addr", facsubgrp: "type" },
    source: NYC_DCP,
  },
  {
    id: "parks",
    label: "Parks",
    url: `${NYC_BASE}/enfh-gkve.geojson?$limit=50000&$select=signname,name311,acres,typecategory,location,multipolygon`,
    geometry: "native",
    renameProps: { signname: "name", name311: "alt", typecategory: "type" },
    keepProps: ["signname", "name311", "acres", "typecategory", "location"],
    source: NYC_OPEN_DATA,
  },
  {
    id: "community-gardens",
    label: "Community Gardens",
    url: `${NYC_BASE}/p78i-pat6.geojson?$limit=10000`,
    geometry: "native",
    keepProps: ["gardenname", "address", "neighborhoodname", "boro", "jurisdiction"],
    renameProps: { gardenname: "name", address: "addr" },
    source: NYC_OPEN_DATA,
  },
  {
    id: "bike-routes",
    label: "Bike Routes",
    url: `${NYC_BASE}/mzxg-pwib.geojson?$limit=50000&$select=street,fromstreet,tostreet,facilitycl,lanecount,the_geom`,
    geometry: "native",
    keepProps: ["street", "fromstreet", "tostreet", "facilitycl", "lanecount"],
    source: NYC_OPEN_DATA,
  },
  {
    id: "bus-shelters",
    label: "Bus Shelters",
    url: `${NYC_BASE}/t4f2-8md7.geojson?$limit=10000&$select=shelter_id,on_street,cross_stre,corner,boro_name,the_geom`,
    geometry: "native",
    keepProps: ["shelter_id", "on_street", "cross_stre", "corner", "boro_name"],
    renameProps: { on_street: "street", cross_stre: "cross_street", boro_name: "boro" },
    source: NYC_OPEN_DATA,
  },
  {
    id: "linknyc",
    label: "LinkNYC Kiosks",
    url: `${NYC_BASE}/n6c5-95xh.geojson?$limit=10000`,
    geometry: "native",
    keepProps: ["site_id", "address", "nta", "zip", "kiosk_type", "wifi_status"],
    renameProps: { address: "addr" },
    source: NYC_OPEN_DATA,
  },
  {
    id: "restrooms",
    label: "Public Restrooms",
    url: `${NYC_BASE}/i7jb-7jku.geojson?$limit=10000`,
    geometry: "native",
    keepProps: ["facility_name", "location_type", "hours_of_operation", "operator", "accessibility"],
    renameProps: { facility_name: "name", location_type: "type", hours_of_operation: "hours" },
    source: NYC_OPEN_DATA,
  },
];

function pickProps(props: Record<string, unknown>, keep: string[] | undefined, rename: Record<string, string> | undefined): Record<string, unknown> {
  if (!keep) return props;
  const out: Record<string, unknown> = {};
  for (const k of keep) {
    if (props[k] === undefined || props[k] === null || props[k] === "") continue;
    const outKey = rename?.[k] ?? k;
    out[outKey] = props[k];
  }
  return out;
}

function buildPoint(lon: number, lat: number): Feature["geometry"] {
  return { type: "Point", coordinates: [lon, lat] };
}

const FETCH_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 3;

async function fetchWithRetry(url: string): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        const delay = attempt * 2000;
        process.stdout.write(`    retry ${attempt}/${MAX_RETRIES - 1} in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

async function fetchDataset(ds: Dataset): Promise<{ id: string; count: number; bytes: number } | { id: string; error: string }> {
  const t0 = Date.now();
  try {
    const res = await fetchWithRetry(ds.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();

    let features: Feature[];
    if (ds.geometry === "native") {
      const fc = raw as FeatureCollection;
      features = (fc.features ?? []).flatMap((f) => {
        if (!f.geometry) return [];
        return [{
          type: "Feature" as const,
          properties: pickProps(f.properties ?? {}, ds.keepProps, ds.renameProps),
          geometry: f.geometry,
        }];
      });
    } else {
      const rows = raw as Record<string, unknown>[];
      const latKey = ds.geometry.lat;
      const lonKey = ds.geometry.lon;
      features = rows.flatMap((row) => {
        const lat = Number(row[latKey]);
        const lon = Number(row[lonKey]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0 || lon === 0) return [];
        return [{
          type: "Feature" as const,
          properties: pickProps(row, ds.keepProps, ds.renameProps),
          geometry: buildPoint(lon, lat),
        }];
      });
    }

    const fc: FeatureCollection = { type: "FeatureCollection", features };
    const outPath = join(TARGET, `${ds.id}.geojson`);
    const text = JSON.stringify(fc);
    writeFileSync(outPath, text);
    const ms = Date.now() - t0;
    console.log(`  OK   ${ds.id.padEnd(20)} ${String(features.length).padStart(5)} features, ${(text.length / 1024).toFixed(1)} KiB, ${ms}ms`);
    return { id: ds.id, count: features.length, bytes: text.length };
  } catch (err) {
    const ms = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  FAIL ${ds.id.padEnd(20)} ${msg} (${ms}ms)`);
    return { id: ds.id, error: msg };
  }
}

async function main() {
  mkdirSync(TARGET, { recursive: true });
  console.log(`writing POIs to ${TARGET}\n`);

  const results = await Promise.all(DATASETS.map(fetchDataset));

  const ok = results.filter((r) => "count" in r);
  const failed = results.filter((r) => "error" in r);
  const totalBytes = ok.reduce((acc, r) => acc + (r as { bytes: number }).bytes, 0);

  console.log(`\n${ok.length}/${DATASETS.length} OK, ${failed.length} failed`);
  console.log(`total: ${(totalBytes / 1024 / 1024).toFixed(2)} MiB`);

  const manifest = {
    generated_at: new Date().toISOString(),
    datasets: DATASETS.map((d) => ({
      id: d.id,
      label: d.label,
      source_url: d.url,
      attribution: d.source,
    })),
    results,
  };
  writeFileSync(join(TARGET, "_manifest.json"), JSON.stringify(manifest, null, 2));
}

main();
