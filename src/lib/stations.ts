import { Station } from "./types";

export const STATIONS: Station[] = [
  {
    id: "26266V443149",
    name: "E6 Nye Moss Nord",
    road: "E6",
    role: "E6 nord mot Våler",
    lat: 59.4724,
    lon: 10.6892,
    corridorOrder: 0,
    directions: { from: "Mot Våler", to: "Mot Moss" },
  },
  {
    id: "15322V971307",
    name: "Storebaug",
    road: "E6",
    role: "E6 sør",
    lat: 59.4445,
    lon: 10.6802,
    corridorOrder: 1,
    directions: { from: "Mot Vestby", to: "Mot Moss" },
  },
  {
    id: "40488V971307",
    name: "Patterød sør",
    road: "E6",
    role: "E6 ved Mosseporten",
    lat: 59.4365,
    lon: 10.6745,
    corridorOrder: 2,
    directions: { from: "Mot Vestby", to: "Mot Moss" },
  },
  {
    id: "28495V971383",
    name: "Patterød vest",
    road: "RV19",
    role: "Mosseporten",
    lat: 59.4342,
    lon: 10.6698,
    corridorOrder: 3,
    directions: { from: "Mot E6", to: "Mot Moss sentrum" },
  },
  {
    id: "76208V971383",
    name: "Mosseelva",
    road: "RV19",
    role: "RV19/E6-kryss",
    lat: 59.4358,
    lon: 10.6625,
    corridorOrder: 4,
    directions: { from: "Mot Patterød", to: "Mot sentrum" },
  },
  {
    id: "69994V971384",
    name: "Vogts gate",
    road: "RV19",
    role: "RV19 midt",
    lat: 59.4368,
    lon: 10.6598,
    corridorOrder: 5,
    directions: { from: "Mot Patterød", to: "Mot fergekaia" },
  },
  {
    id: "72867V971385",
    name: "Rådhusbrua",
    road: "RV19",
    role: "RV19 midt",
    lat: 59.4375,
    lon: 10.6565,
    corridorOrder: 6,
    directions: { from: "Mot Patterød", to: "Mot fergekaia" },
  },
  {
    id: "39666V971386",
    name: "Østre Kanalgate",
    road: "RV19",
    role: "Nær fergekaia",
    lat: 59.4382,
    lon: 10.6548,
    corridorOrder: 7,
    directions: { from: "Mot sentrum", to: "Mot fergekaia" },
  },
  {
    id: "40641V971605",
    name: "Kanalbrua",
    road: "FV317",
    role: "Hovedflaskehals",
    lat: 59.4405,
    lon: 10.6535,
    corridorOrder: 8,
    directions: { from: "Mot Jeløya", to: "Mot Moss" },
  },
  {
    id: "59044V971518",
    name: "Fjordveien",
    road: "FV118",
    role: "Alternativ rute",
    lat: 59.4285,
    lon: 10.6420,
    corridorOrder: 9,
    directions: { from: "Mot sør", to: "Mot Moss" },
  },
];

export const KANALBRUA_ID = "40641V971605";
export const KANALBRUA_ABSOLUTE_GUARDRAIL = 1800;

export const RV19_STATION_IDS = [
  "39666V971386",
  "72867V971385",
  "69994V971384",
  "76208V971383",
];

export const E6_STATION_IDS = [
  "40488V971307",
  "15322V971307",
  "26266V443149",
];

// Corridor stepper nodes (simplified view)
export const CORRIDOR_NODES = [
  { label: "Våler/E6", stationIds: ["26266V443149", "15322V971307"] },
  { label: "Mosseporten", stationIds: ["40488V971307", "28495V971383"] },
  { label: "Rv19", stationIds: ["76208V971383", "69994V971384", "72867V971385", "39666V971386"] },
  { label: "Kanalbrua", stationIds: ["40641V971605"] },
  { label: "Jeløya", stationIds: ["59044V971518"] },
] as const;

export function getStation(id: string): Station | undefined {
  return STATIONS.find((s) => s.id === id);
}
