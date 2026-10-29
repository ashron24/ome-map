type Ring = number[][];
type PolygonCoords = Ring[];
type MultiPolygonCoords = PolygonCoords[];

function bboxArea(ring: Ring): number {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return (maxX - minX) * (maxY - minY);
}

/**
 * Fetch polygon GeoJSON and return one Polygon feature per unique `nameKey`
 * value — the largest part across all of that name's features — so symbol
 * layers place exactly one label per area.
 */
export async function deriveLabelSource(
  url: string,
  nameKey = "nameCol",
): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch(url);
  const fc = await res.json() as GeoJSON.FeatureCollection;

  // Group by name so we emit exactly one label per area, placed on
  // the largest polygon part — handles both MultiPolygon features and
  // datasets where each polygon part is a separate Feature.
  const best = new Map<string, { area: number; poly: PolygonCoords; props: GeoJSON.GeoJsonProperties }>();

  for (const f of fc.features) {
    const geom = f.geometry as GeoJSON.Geometry | null;
    if (!geom) continue;
    const nameCol = (f.properties?.[nameKey] as string | null | undefined) ?? null;
    if (!nameCol) continue;

    let candidates: PolygonCoords[] = [];
    if (geom.type === "Polygon") {
      candidates = [geom.coordinates as PolygonCoords];
    } else if (geom.type === "MultiPolygon") {
      candidates = geom.coordinates as MultiPolygonCoords;
    }

    for (const poly of candidates) {
      if (!poly[0]) continue;
      const area = bboxArea(poly[0]);
      const existing = best.get(nameCol);
      if (!existing || area > existing.area) {
        best.set(nameCol, { area, poly, props: f.properties });
      }
    }
  }

  const features: GeoJSON.Feature[] = [];
  for (const { poly, props } of best.values()) {
    features.push({
      type: "Feature",
      properties: props,
      geometry: { type: "Polygon", coordinates: poly },
    });
  }
  return { type: "FeatureCollection", features };
}
