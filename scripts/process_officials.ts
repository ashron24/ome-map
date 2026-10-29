#!/usr/bin/env tsx
/**
 * Reads scripts/data/officials.csv and outputs public/data/district-officials.json —
 * a lookup of elected officials and CB info keyed by layer id → nameCol.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "scripts/data/officials.csv");
const TARGET = join(process.cwd(), "public/data/district-officials.json");

// --- CSV parser that handles quoted fields with embedded newlines ---
function parseCsv(text: string): Record<string, string>[] {
  // Normalize line endings
  const input = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < input.length) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ",") { row.push(field); field = ""; i++; continue; }
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += ch; i++;
  }
  // Last field/row
  row.push(field);
  if (row.some(c => c !== "")) rows.push(row);

  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(cols => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = (cols[idx] ?? "").trim(); });
    return obj;
  });
}

// --- District ID → nameCol converters ---
const BORO_PREFIX: Record<string, string> = {
  MAN: "MN", BK: "BK", BX: "BX", QN: "QN", SI: "SI",
};

function districtToNameCol(dist: string, layer: string): string | null {
  dist = dist.trim();
  if (layer === "sa") {
    const m = dist.match(/^AD-(\d+)$/i);
    if (!m) return null;
    return String(parseInt(m[1], 10));
  }
  if (layer === "ss") {
    const m = dist.match(/^SD-(\d+)$/i);
    if (!m) return null;
    return String(parseInt(m[1], 10));
  }
  if (layer === "cc") {
    const m = dist.match(/^District\s+(\d+)$/i);
    if (!m) return null;
    return String(parseInt(m[1], 10));
  }
  if (layer === "nycongress") {
    const m = dist.match(/^NY-(\d+)$/i);
    if (!m) return null;
    return String(parseInt(m[1], 10));
  }
  if (layer === "cd") {
    const m = dist.match(/^([A-Z]+)-CB(\d+)$/i);
    if (!m) return null;
    const abbr = BORO_PREFIX[m[1].toUpperCase()];
    if (!abbr) return null;
    return `${abbr} ${parseInt(m[2], 10)}`;
  }
  return null;
}

function layerForTitle(title: string): string | null {
  switch (title) {
    case "Assembly Member":
    case "Assembly Member (Speaker)":
      return "sa";
    case "State Senator":
      return "ss";
    case "City Council Member":
    case "City Council Speaker":
      return "cc";
    case "U.S. Representative":
      return "nycongress";
    case "CB Chair":
    case "CB District Manager":
      return "cd";
    default:
      return null;
  }
}

type ElectedOfficial = {
  name: string;
  title: string;
  party: string;
  website: string;
};

type CbEntry = {
  chair_name?: string;
  chair_website?: string;
  manager_name?: string;
  manager_website?: string;
  meeting?: string;
  contact?: string;
};

type DistrictOfficialsJson = {
  sa: Record<string, ElectedOfficial>;
  ss: Record<string, ElectedOfficial>;
  cc: Record<string, ElectedOfficial>;
  nycongress: Record<string, ElectedOfficial>;
  cd: Record<string, CbEntry>;
};

async function main() {
  mkdirSync(join(process.cwd(), "public/data"), { recursive: true });

  const csv = readFileSync(SRC, "utf-8");
  const rows = parseCsv(csv);
  console.log(`Parsed ${rows.length} rows from officials.csv`);

  const out: DistrictOfficialsJson = { sa: {}, ss: {}, cc: {}, nycongress: {}, cd: {} };

  let matched = 0;
  let skipped = 0;

  for (const row of rows) {
    const title = row["Office Title"]?.trim() ?? "";
    const layer = layerForTitle(title);
    if (!layer) { skipped++; continue; }

    const dist = row["District/Jurisdiction"]?.trim() ?? "";
    const nameCol = districtToNameCol(dist, layer);
    if (!nameCol) {
      console.warn(`  Could not parse district "${dist}" for title "${title}"`);
      skipped++;
      continue;
    }

    const name = row["Name"]?.trim() ?? "";
    const website = row["Official Website"]?.trim() ?? "";

    if (layer === "cd") {
      const entry: CbEntry = out.cd[nameCol] ?? {};
      if (title === "CB Chair") {
        entry.chair_name = name;
        entry.chair_website = website;
      } else {
        entry.manager_name = name;
        entry.manager_website = website;
        const meeting = row["CB Meeting Info"]?.trim() ?? "";
        const contact = row["CB Contact Info"]?.trim() ?? "";
        if (meeting) entry.meeting = meeting;
        if (contact) entry.contact = contact;
      }
      out.cd[nameCol] = entry;
    } else {
      (out[layer as keyof typeof out] as Record<string, ElectedOfficial>)[nameCol] = {
        name,
        title,
        party: row["Political Party"]?.trim() ?? "",
        website,
      };
    }
    matched++;
  }

  console.log(`Matched: ${matched}, Skipped: ${skipped}`);
  console.log(`sa: ${Object.keys(out.sa).length}, ss: ${Object.keys(out.ss).length}, cc: ${Object.keys(out.cc).length}, nycongress: ${Object.keys(out.nycongress).length}, cd: ${Object.keys(out.cd).length}`);

  writeFileSync(TARGET, JSON.stringify(out, null, 2));
  console.log(`Wrote ${TARGET}`);
}

main().catch(err => { console.error(err); process.exit(1); });
