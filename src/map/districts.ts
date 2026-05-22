import { dataUrl } from "../util/url.ts";

export type DistrictId =
  | "nta"
  | "cd"
  | "cc"
  | "ss"
  | "sa"
  | "nycongress"
  | "pp"
  | "zipcode"
  | "sd"
  | "dsny"
  | "fb"
  | "hc"
  | "bid"
  | "hd";

export type DistrictDef = {
  id: DistrictId;
  label: string;
  color: string;
  lineWidth: number;
  dash?: [number, number];
  labelPrefix?: string;
  group: "core" | "extra";
  source: string;
  attribution: { name: string; href: string };
};

const NYC_DCP_BBL = {
  name: "NYC DCP, Bytes of the Big Apple",
  href: "https://www.nyc.gov/site/planning/data-maps/open-data.page",
};
const NYC_OPEN_DATA = {
  name: "NYC Open Data",
  href: "https://opendata.cityofnewyork.us/",
};

export const DISTRICTS: DistrictDef[] = [
  {
    id: "nta",
    label: "Neighborhoods (NTAs)",
    color: "#928d8d",
    lineWidth: 1.5,
    group: "core",
    source: dataUrl("data/boundaries/nta.geojson"),
    attribution: NYC_DCP_BBL,
  },
  {
    id: "cd",
    label: "Community Districts",
    color: "#000000",
    lineWidth: 2,
    labelPrefix: "CD ",
    group: "core",
    source: dataUrl("data/boundaries/cd.geojson"),
    attribution: NYC_DCP_BBL,
  },
  {
    id: "cc",
    label: "City Council",
    color: "#FF2900",
    lineWidth: 2,
    labelPrefix: "CC ",
    group: "core",
    source: dataUrl("data/boundaries/cc.geojson"),
    attribution: NYC_DCP_BBL,
  },
  {
    id: "ss",
    label: "NY State Senate",
    color: "#800080",
    lineWidth: 2,
    labelPrefix: "SS ",
    group: "core",
    source: dataUrl("data/boundaries/ss.geojson"),
    attribution: NYC_DCP_BBL,
  },
  {
    id: "sa",
    label: "NY State Assembly",
    color: "#191970",
    lineWidth: 2,
    labelPrefix: "AD ",
    group: "core",
    source: dataUrl("data/boundaries/sa.geojson"),
    attribution: NYC_DCP_BBL,
  },
  {
    id: "nycongress",
    label: "US Congressional",
    color: "#B22222",
    lineWidth: 2,
    labelPrefix: "CG ",
    group: "core",
    source: dataUrl("data/boundaries/nycongress.geojson"),
    attribution: NYC_DCP_BBL,
  },
  {
    id: "pp",
    label: "Police Precincts",
    color: "#1f3b8b",
    lineWidth: 2,
    labelPrefix: "PP ",
    group: "core",
    source: dataUrl("data/boundaries/pp.geojson"),
    attribution: NYC_DCP_BBL,
  },
  {
    id: "zipcode",
    label: "ZIP Codes (MODZCTA)",
    color: "#636363",
    lineWidth: 1.5,
    dash: [4, 3],
    group: "core",
    source: dataUrl("data/boundaries/zipcode.geojson"),
    attribution: NYC_OPEN_DATA,
  },
  {
    id: "sd",
    label: "School Districts",
    color: "#d95f0e",
    lineWidth: 2.5,
    labelPrefix: "SD ",
    group: "core",
    source: dataUrl("data/boundaries/sd.geojson"),
    attribution: NYC_DCP_BBL,
  },
  {
    id: "dsny",
    label: "Sanitation Districts",
    color: "#2ca02c",
    lineWidth: 1.5,
    group: "extra",
    source: dataUrl("data/boundaries/dsny.geojson"),
    attribution: NYC_OPEN_DATA,
  },
  {
    id: "fb",
    label: "Fire Battalions",
    color: "#e6550d",
    lineWidth: 1.5,
    group: "extra",
    source: dataUrl("data/boundaries/fb.geojson"),
    attribution: NYC_DCP_BBL,
  },
  {
    id: "hc",
    label: "Health Center Districts",
    color: "#17a2b8",
    lineWidth: 1.5,
    group: "extra",
    source: dataUrl("data/boundaries/hc.geojson"),
    attribution: NYC_DCP_BBL,
  },
  {
    id: "bid",
    label: "BIDs",
    color: "#9467bd",
    lineWidth: 1.5,
    group: "extra",
    source: dataUrl("data/boundaries/bid.geojson"),
    attribution: NYC_OPEN_DATA,
  },
  {
    id: "hd",
    label: "Historic Districts",
    color: "#bcbd22",
    lineWidth: 1.5,
    group: "extra",
    source: dataUrl("data/boundaries/hd.geojson"),
    attribution: NYC_OPEN_DATA,
  },
];
