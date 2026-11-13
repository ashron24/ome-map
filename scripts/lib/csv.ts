/** Shared helpers for the data scripts that read CSV exports. */

/** Rows of a CSV file as objects keyed by header; handles quoted fields. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);

  const [header, ...data] = rows;
  const keys = header.map((h) => h.trim());
  return data.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

/** Empty for blanks and the "<Null>" that ArcGIS exports write for missing values. */
export function clean(s: string | undefined): string {
  return !s || s === "<Null>" ? "" : s.trim();
}

/** File text without the byte-order mark that Excel adds to CSVs. */
export function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}
