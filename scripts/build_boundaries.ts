#!/usr/bin/env tsx
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Feature = {
  type: "Feature";
  properties: Record<string, unknown> & { id?: string };
  geometry: unknown;
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: Feature[];
};

// Resolve order: $CROSSWALKS_OUTPUTS env override, then ./nyc-geography-crosswalks/outputs
// (which works for the local symlink and for the CI clone in deploy.yml).
const CROSSWALKS_OUTPUTS =
  process.env.CROSSWALKS_OUTPUTS ??
  join(process.cwd(), "nyc-geography-crosswalks", "outputs");
const TARGET = join(process.cwd(), "public/data/boundaries");

function findLatestRun(base: string): string {
  const runs = readdirSync(base).filter((name) => {
    try {
      return statSync(join(base, name)).isDirectory();
    } catch {
      return false;
    }
  });
  if (runs.length === 0) {
    throw new Error(`No runs found under ${base}`);
  }
  runs.sort();
  return join(base, runs[runs.length - 1]);
}

function main() {
  const runDir = findLatestRun(CROSSWALKS_OUTPUTS);
  const allPath = join(runDir, "all_boundaries.geojson");
  const metaPath = join(runDir, "run_meta.json");
  console.log(`source: ${allPath}`);

  const raw = readFileSync(allPath, "utf8");
  const fc: FeatureCollection = JSON.parse(raw);

  const groups = new Map<string, Feature[]>();
  for (const feat of fc.features) {
    const id = feat.properties.id;
    if (typeof id !== "string") continue;
    let bucket = groups.get(id);
    if (!bucket) {
      bucket = [];
      groups.set(id, bucket);
    }
    bucket.push(feat);
  }

  mkdirSync(TARGET, { recursive: true });

  let totalBytes = 0;
  for (const [id, feats] of groups) {
    const out: FeatureCollection = {
      type: "FeatureCollection",
      features: feats,
    };
    const outPath = join(TARGET, `${id}.geojson`);
    const text = JSON.stringify(out);
    writeFileSync(outPath, text);
    totalBytes += text.length;
    console.log(`  ${id}: ${feats.length} features -> ${outPath} (${(text.length / 1024).toFixed(1)} KiB)`);
  }

  // Stash provenance so the app can attribute correctly
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  writeFileSync(join(TARGET, "_run_meta.json"), JSON.stringify(meta, null, 2));

  console.log(`total: ${(totalBytes / 1024 / 1024).toFixed(2)} MiB across ${groups.size} files`);
}

main();
