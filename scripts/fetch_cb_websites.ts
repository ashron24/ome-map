#!/usr/bin/env tsx
/**
 * Fetches NYC Community Board website URLs and saves a nameCol→url lookup.
 * Output: public/data/cd-websites.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TARGET = join(process.cwd(), "public/data");
const URL = "https://data.cityofnewyork.us/resource/ruf7-3wgc.json?$limit=100&$select=community_board_1,cb_website";

const BORO_ABBR = ["", "MN", "BX", "BK", "QN", "SI"];

function borocdToNameCol(raw: string): string | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 100) return null;
  const boro = Math.floor(n / 100);
  const num = n % 100;
  const abbr = BORO_ABBR[boro];
  if (!abbr) return null;
  return `${abbr} ${num}`;
}

async function main() {
  mkdirSync(TARGET, { recursive: true });
  console.log("Fetching community board websites...");
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = (await res.json()) as { community_board_1?: string; cb_website?: { url?: string } }[];

  const map: Record<string, string> = {};
  let ok = 0;
  for (const r of rows) {
    const nameCol = borocdToNameCol(r.community_board_1 ?? "");
    const url = r.cb_website?.url ?? "";
    if (nameCol && url) {
      map[nameCol] = url;
      ok++;
    }
  }

  writeFileSync(join(TARGET, "cd-websites.json"), JSON.stringify(map));
  console.log(`  OK: ${ok} websites out of ${rows.length} boards`);
}

main().catch((e) => { console.error(e); process.exit(1); });
