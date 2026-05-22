# mome-map

An open-source rebuild of the legacy **CAU Outreach Map** (NYC Mayor's Community Affairs Unit, 2015–2018) using only **public** data and **open-source** tools — no authentication, no internal-only layers.

The original map ran on Leaflet + CartoDB. CartoDB has been sunset and the original layers (clergy contacts, internal program targeting, staff geographies) were intentionally never republished. This project recreates the **public-data subset** of that map on a modern stack so the spatial-analysis value of the original is preserved without exposing anything that was private.

## What's included

| Group | Layers | Source |
|---|---|---|
| Basemaps (5) | Gray (Carto Positron), Voyager, OSM Streets, Satellite (Esri), Dark | OpenStreetMap, CARTO, Esri (CDN) |
| Districts (14) | NTAs · Community Districts · City Council · NY State Senate / Assembly · US Congressional · Police Precincts · ZIP Codes (MODZCTA) · School Districts · Sanitation · Fire Battalions · Health Centers · BIDs · Historic Districts | [`MODA-NYC/nyc-geography-crosswalks`](https://github.com/MODA-NYC/nyc-geography-crosswalks) (NYC DCP "Bytes of the Big Apple") |
| Facilities & Infrastructure (7) | Public Schools (K-12) · Libraries · Hospitals & Clinics · Cultural Institutions · Parks · Bike Routes · Bus Shelters | NYC DCP FacDB, NYC Open Data |
| Outreach & Services (4) | Day Care & Pre-K · Community Gardens · LinkNYC Kiosks · Public Restrooms | NYC DCP FacDB, NYC Open Data |
| Demographics (7 choropleths) | % Hispanic · % White (non-Hispanic) · % Black · % Asian · % Foreign-Born · % Non-Citizen · Median HH Income | US Census Bureau ACS 5-Year **2020-2024**, via Google Data Commons |

## What's intentionally NOT included

Per the project scope, none of the following are in this repo or in any data file it ships:

- **Religious organization point layers** (the original "clergy" contact database)
- **CAU Borough Director Turfs** (internal staff geography)
- **Internal program targeting layers** — PEU targets, Benefits Access hot spots, IDNYC outreach events, OCDV / DCA outreach, SCRIE targets, paid-sick walks, nail-salon targets, mayoral / FLONYC events
- Anything requiring credentialed data sources

If you need the private-layer functionality from the legacy map, that work belongs in a separate, access-controlled deployment — not this public repo.

## Stack

- **MapLibre GL JS** — vector/raster renderer (open-source fork of Mapbox GL)
- **Vite + TypeScript** — vanilla, no framework
- **Static deploy** to GitHub Pages
- **Build-time ETL** in TypeScript fetches data from NYC Open Data + Data Commons and writes static GeoJSON to `public/data/` (gitignored — reproducible from the ETL)

## Quickstart

```bash
git clone <your-fork>.git
cd mome-map
npm install

# Get an API key for Google Data Commons (free): https://apikeys.datacommons.org/
export DC_API_KEY=<your-key>

# Fetch all data (~30 sec, ~80 MB total in public/data/)
npm run data:all

# Run the dev server
npm run dev
# → http://localhost:5173/
```

## Data refresh

Each ETL is idempotent — running it overwrites the corresponding files under `public/data/`.

| Command | What it does | Time |
|---|---|---|
| `npm run data:boundaries` | Split the latest `all_boundaries.geojson` from `nyc-geography-crosswalks` into per-geography files | <1 s |
| `npm run data:pois` | Fetch 11 POI datasets from NYC Open Data | ~5 s |
| `npm run data:census` | Fetch ACS 5-year for 2,325 NYC tracts via Data Commons | ~30 s (10 batches × 250 tracts) |
| `npm run data:all` | All three, sequentially | ~35 s |

The Census ETL writes provenance to `public/data/census/_meta.json` — per-variable selected vintage, coverage counts, and the source / date combination it actually picked for each variable. As of the most recent run, 7 of 8 demographic variables are 100% **ACS 5-Year 2020-2024**; Median HH Income is 94.6% from the same release with a long tail of older fallbacks for tracts where DC didn't have the latest published value.

Caveats worth knowing:

- The "Public Schools" layer is FacDB's `SCHOOLS (K-12)` facgroup, which includes private K-12 schools (e.g., Chapin) alongside public DOE schools. The original map filtered more aggressively; this version is broader.
- The "% Black" and "% Asian" choropleths use `Count_Person_BlackOrAfricanAmericanAlone` / `Count_Person_AsianAlone` (race alone), not the stricter "non-Hispanic alone" cross-tab. Data Commons exposes non-Hispanic white at tract level but not non-Hispanic Black/Asian. For NYC, this is a close approximation but slightly diverges from the old map's strict "% NH Black".
- The legacy map's **Median Income-to-Rent ratio** choropleth is **not** reproduced — Data Commons doesn't expose tract-level `Median_GrossRent`. Adding a US Census Bureau API key (free) would unlock B25071 directly.
- The legacy map's **proportional-symbol ethnicity layers** (Dominican, Puerto Rican, Mexican, Chinese, Korean, Bangladeshi, Pakistani, Indian, Arab, Turkish, Albanian, FB-Russian, Ecuadorian) are also **not** included. Those rely on ACS detailed origin/ancestry tables (B03001, B02015, B04006), which the Census Bureau API exposes cleanly but Data Commons does not at tract granularity.

## Deploy to GitHub Pages

A workflow at `.github/workflows/deploy.yml` builds and publishes the site on push to `main`. It runs all three ETLs in CI, then `vite build`, then deploys `dist/` to GitHub Pages.

Two prerequisites before the first deploy:

1. In **Settings → Secrets and variables → Actions**, add a repository secret named `DC_API_KEY` with your Data Commons key.
2. In **Settings → Pages**, set **Source: GitHub Actions**.

After that, every push to `main` rebuilds and publishes automatically. Open-data source URLs are stable but can move — if an ETL starts failing, check that dataset still exists at the same Socrata 4×4 ID.

## Repository layout

```
mome-map/
├── index.html                     # Vite entry
├── package.json
├── tsconfig.json
├── public/
│   ├── data/                      # gitignored — populated by ETL
│   │   ├── boundaries/{id}.geojson
│   │   ├── pois/{id}.geojson
│   │   └── census/tracts.geojson + _meta.json
│   └── favicon.svg
├── scripts/
│   ├── build_boundaries.ts        # ETL: districts
│   ├── fetch_pois.ts              # ETL: POIs (NYC Open Data + FacDB)
│   └── fetch_census.ts            # ETL: ACS via Data Commons
└── src/
    ├── main.ts                    # entry, map init, URL state
    ├── style.css
    ├── map/
    │   ├── basemaps.ts            # 5 raster basemaps
    │   ├── districts.ts           # 14 district overlay defs
    │   ├── layers.ts              # district layer add/show/popup
    │   ├── pois.ts                # POI defs + render (points/lines/polys, clustering)
    │   └── demographics.ts        # 7 choropleth metric defs + render
    ├── ui/
    │   └── layerPanel.ts          # left-side layer control panel
    └── state/
        └── urlState.ts            # permalink (#-fragment) encoding/decoding
```

## Acknowledgments

- Built on top of the boundary data assembled by [`MODA-NYC/nyc-geography-crosswalks`](https://github.com/MODA-NYC/nyc-geography-crosswalks) (Nathan Storey, MODA), which itself extends [`BetaNYC/nyc-boundaries`](https://github.com/BetaNYC/nyc-boundaries).
- POI data from [NYC Open Data](https://opendata.cityofnewyork.us/) and the NYC Department of City Planning [Facilities Database (FacDB)](https://data.cityofnewyork.us/City-Government/Facilities-Database-Active-Facilities/ji82-xba5).
- Demographic data from the [US Census Bureau ACS 5-Year](https://www.census.gov/programs-surveys/acs) served via [Google Data Commons](https://datacommons.org). Patterns for direct API access cribbed from [`civic-ai-tools`](https://github.com/npstorey/civic-ai-tools).
- The legacy CAU Outreach Map (the spiritual ancestor of this project) was originally built on Leaflet + CartoDB by Asher Ross, Andrew Martini, et al. between 2015 and 2018.

## License

Code: MIT.
Data: each dataset is governed by its upstream license — most are NYC Open Data ([Terms of Use](https://opendata.cityofnewyork.us/overview/)) or US Census Bureau public-domain. See `public/data/*/...meta.json` and each layer's popup attribution for provenance.
