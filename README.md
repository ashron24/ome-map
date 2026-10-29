# mome-map

An open-source rebuild of the legacy **CAU Outreach Map** (NYC Mayor's Community Affairs Unit, 2015–2018) using only **public** data and **open-source** tools — no authentication, no internal-only layers.

**Live:** https://ashron24.github.io/mome-map/

The original map ran on Leaflet + CartoDB. CartoDB has been sunset and the original layers (clergy contacts, internal program targeting, staff geographies) were intentionally never republished. This project recreates the **public-data subset** of that map on a modern stack so the spatial-analysis value of the original is preserved without exposing anything that was private.

## What's included

| Panel section | Layers | Source |
|---|---|---|
| **Basemap** (4) | NYC Basemap (OTI v3) · Light (NYC Labels Only) · OSM Streets · Satellite | NYC OTI / Esri vector tiles, OpenFreeMap, OpenStreetMap, Esri |
| **Districts** (14) | Community Board · City Council · NY State Senate · NY State Assembly · US Congress · Police Precinct · School District · Sanitation District · Fire Battalion · Health Center District · BIDs · Historic District · Zipcode · Neighborhood (NTA) | [`MODA-NYC/nyc-geography-crosswalks`](https://github.com/MODA-NYC/nyc-geography-crosswalks) (fallback: NYC Planning ArcGIS); DSNY districts from NYC Open Data |
| **Facilities & Infrastructure** (14) | Public Schools (K-12) · Colleges & Universities · Day Care & Pre-K · Libraries · Hospitals & Clinics · Cultural Institutions · Parks · Community Gardens · Bike Routes · Subways (stations + lines) · Bus Routes · Bus Shelters · LinkNYC Kiosks · Public Restrooms | NYC DCP FacDB, NYC Open Data |
| **Outreach & Services** (4) | DYCD Program Sites · SBS Program Sites · NYC Service CBOs · Soup Kitchens & Food Pantries | NYC Open Data, NYC DCP FacDB |
| **Agency Enforcement** (3 heatmaps) | HPD Open Violations · DOB Active Safety Violations · DEP ECB Open Violations | NYC Open Data, geocoded via MapPLUTO BBL centroids |
| **Demographics — choropleths** (7) | % Hispanic · % White (non-Hispanic) · % Black (non-Hispanic) · % Asian (non-Hispanic) · % Foreign-Born · % Non-Citizen · Median HH Income | US Census Bureau API, ACS 5-Year (2019–2023), census tracts |
| **Demographics — ethnicity** (15 graduated symbols) | *Hispanic / Latino:* Puerto Rican, Dominican, Mexican, Central American, South American, Colombian, Ecuadorian · *Asian:* Chinese, Korean, Filipino, Asian Indian, Bangladeshi, Pakistani · *Arab / Turkish / Albanian:* Arab, Turkish, Albanian | ACS tables B03001, B02015, B04006 via the Census Bureau API |

Other features:

- **District popups** show elected officials for council / state / congressional districts, and Community Board contact info, meeting details and website links (from `scripts/data/officials.csv` plus NYC Open Data).
- **Search** (top right) matches neighborhoods, boroughs and ZIP codes locally; full address search uses NYC Geoclient when a key is configured.
- **Permalinks** — the URL hash encodes the view (center, zoom, basemap, and every active layer), so any map state can be shared by copying the URL.
- **Multi-layer legend** for active POI layers, and a legend for the active choropleth.

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
- **Build-time ETL** in TypeScript fetches data from NYC Open Data and the Census Bureau and writes static GeoJSON/JSON to `public/data/` (gitignored — reproducible from the ETL)

## Quickstart

```bash
git clone https://github.com/ashron24/mome-map.git
cd mome-map
npm install

# Census Bureau API key (free) — required for the Demographics layers
# https://api.census.gov/data/key_signup.html
export CENSUS_API_KEY=<your-key>

# Optional: NYC Geoclient key for full address search (https://api-portal.nyc.gov/)
# Put it in .env.local so Vite picks it up:
#   VITE_GEOCLIENT_KEY=<your-key>

# Fetch all data (see "Data refresh" below)
npm run data:all

# Run the dev server
npm run dev
# → http://localhost:5173/
```

The boundaries ETL (`data:boundaries`) reads from a local checkout of `nyc-geography-crosswalks` at `./nyc-geography-crosswalks/outputs/` (or `$CROSSWALKS_OUTPUTS`). If you don't have one, use `npm run data:all:direct`, which pulls boundaries from NYC Planning's ArcGIS REST API instead.

## Data refresh

Each ETL is idempotent — running it overwrites the corresponding files under `public/data/`.

| Command | What it writes |
|---|---|
| `npm run data:boundaries` | `boundaries/{id}.geojson`, split from `nyc-geography-crosswalks`' `all_boundaries.geojson` |
| `npm run data:boundaries:direct` | Same, fetched from NYC Planning ArcGIS (no crosswalks repo needed) |
| `npm run data:dsny` | `boundaries/dsny.geojson` — Sanitation Districts (NYC Open Data `i6mn-amj2`) |
| `npm run data:pois` | `pois/*.geojson` — schools, day care, libraries, hospitals, cultural, parks, gardens, bike routes, subways, buses, LinkNYC, restrooms |
| `npm run data:dycd` | `pois/dycd-sites.geojson` (`ebkm-iyma`) |
| `npm run data:sbs` | `pois/sbs-sites.geojson` (`6smc-7mk6`) |
| `npm run data:cbos` | `pois/cbo-sites.geojson` (`i4kb-6ab6`) |
| `npm run data:food` | `pois/food-sites.geojson` (FacDB `ji82-xba5`) |
| `npm run data:universities` | `pois/universities.geojson` (FacDB `ji82-xba5`) |
| `npm run data:heatmaps` | `heatmaps/*.geojson` — HPD, DOB, DEP ECB violations, geocoded with MapPLUTO |
| `npm run data:census` | `census/` — ACS tract choropleth values and tract-centroid ethnicity counts (needs `CENSUS_API_KEY`) |
| `npm run data:cb-websites` | `cd-websites.json` — Community Board website lookup (`ruf7-3wgc`) |
| `npm run data:officials` | `district-officials.json` — built from `scripts/data/officials.csv` |
| `npm run data:all` | All of the above, sequentially (`data:all:direct` uses the ArcGIS boundaries path) |

To move to a newer ACS release, bump `ACS_YEAR` in `scripts/fetch_census.ts`.

Caveats worth knowing:

- The "Public Schools" layer is FacDB's `SCHOOLS (K-12)` facgroup, which includes private K-12 schools alongside public DOE schools. The original map filtered more aggressively; this version is broader.
- The legacy map's **Median Income-to-Rent ratio** choropleth is not yet reproduced (it would come from ACS B25071).
- Elected officials and CB info come from a hand-maintained CSV (`scripts/data/officials.csv`) — update it after elections or board changes.

## Deploy to GitHub Pages

`.github/workflows/deploy.yml` builds and publishes the site on every push to `main`. It clones `nyc-geography-crosswalks` (and downloads its latest `all_boundaries.geojson` release asset), runs every ETL — each one is allowed to fail without blocking the deploy — then `vite build`, then deploys `dist/` to GitHub Pages.

Setup:

1. In **Settings → Secrets and variables → Actions**, add a repository secret `CENSUS_API_KEY`. Without it the census step is skipped and the Demographics panel has no data.
2. Optional: add a repository secret `VITE_GEOCLIENT_KEY` to enable full address search. Without it, search still matches boroughs, neighborhoods and ZIP codes.
3. In **Settings → Pages**, set **Source: GitHub Actions**.
4. Optional: set the repo variable `VITE_BASE_PATH=/` if deploying to a user/org site or custom domain at root (defaults to `/<repo>/`).

Open-data source URLs are stable but can move — if an ETL starts failing, check that the dataset still exists at the same Socrata 4×4 ID. Because ETL failures don't fail the build, check the workflow logs for `[deploy] … skipped` lines if a layer goes blank.

## Repository layout

```
mome-map/
├── index.html                     # Vite entry
├── package.json
├── public/
│   ├── data/                      # gitignored — populated by ETL
│   ├── neighborhoods.geojson      # custom neighborhood labels
│   ├── places.json                # local search index
│   ├── subway-stations.geojson    # basemap station overlay
│   ├── cemeteries.geojson
│   ├── fonts/  logo.jpeg  favicon.svg
├── scripts/
│   ├── data/officials.csv         # elected officials + CB contacts (hand-maintained)
│   ├── build_boundaries.ts        # districts from nyc-geography-crosswalks
│   ├── fetch_boundaries.ts        # districts from NYC Planning ArcGIS (fallback)
│   ├── fetch_dsny.ts              # sanitation districts
│   ├── fetch_pois.ts              # core POI layers
│   ├── fetch_{dycd,sbs,cbos,food,universities}.ts
│   ├── fetch_heatmaps.ts          # agency violation heatmaps
│   ├── fetch_census.ts            # ACS via Census Bureau API
│   ├── fetch_cb_websites.ts       # Community Board websites
│   └── process_officials.ts       # officials.csv → district-officials.json
└── src/
    ├── main.ts                    # entry, map init, URL state
    ├── style.css
    ├── map/
    │   ├── basemaps.ts            # basemap defs
    │   ├── nyc-basemap.ts         # OTI NYC Basemap v3 loader
    │   ├── basemap-style.ts       # shared basemap styling (labels, tint, city line)
    │   ├── districts.ts           # district overlay defs
    │   ├── layers.ts              # district layer add/show/popup
    │   ├── pois.ts                # POI defs + render
    │   ├── heatmaps.ts            # enforcement heatmap defs + render
    │   ├── demographics.ts        # choropleth metric defs + render
    │   ├── ethnicityLayers.ts     # graduated-symbol ethnicity layers
    │   ├── geocode.ts             # NYC Geoclient client
    │   └── places.ts              # local place matcher for search
    ├── ui/
    │   ├── layerPanel.ts          # left-side layer control panel
    │   └── search.ts              # search box
    ├── state/
    │   └── urlState.ts            # permalink (#-fragment) encoding/decoding
    └── util/
        └── url.ts                 # base-path-aware data URLs
```

## Acknowledgments

- Boundary data assembled by [`MODA-NYC/nyc-geography-crosswalks`](https://github.com/MODA-NYC/nyc-geography-crosswalks) (Nathan Storey, MODA), which itself extends [`BetaNYC/nyc-boundaries`](https://github.com/BetaNYC/nyc-boundaries).
- NYC Basemap loader and styling ported from [`CityOfNewYork/nyc-map-kit`](https://github.com/CityOfNewYork/nyc-map-kit).
- POI and enforcement data from [NYC Open Data](https://opendata.cityofnewyork.us/) and the NYC Department of City Planning [Facilities Database (FacDB)](https://data.cityofnewyork.us/City-Government/Facilities-Database-Active-Facilities/ji82-xba5).
- Demographic data from the [US Census Bureau ACS 5-Year](https://www.census.gov/programs-surveys/acs) via the [Census Bureau API](https://www.census.gov/data/developers.html).
- The legacy CAU Outreach Map (the spiritual ancestor of this project) was originally built on Leaflet + CartoDB by Asher Ross, Andrew Martini, et al. between 2015 and 2018.

## License

Code: MIT.
Data: each dataset is governed by its upstream license — most are NYC Open Data ([Terms of Use](https://opendata.cityofnewyork.us/overview/)) or US Census Bureau public-domain. See each layer's popup attribution for provenance.
