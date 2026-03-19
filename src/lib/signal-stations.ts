/**
 * Signal stations: external traffic registration points used as
 * leading indicators for Moss-area predictions.
 *
 * These are NOT displayed in UI. They exist purely as ML features
 * (lagged volumes from upstream corridors).
 *
 * Each station belongs to a corridor group with an expected lag
 * (time it takes traffic from that point to reach Moss stations).
 */

export interface SignalStation {
  id: string;
  name: string;
  corridor: "horten_rv19" | "e6_nord" | "e6_sor" | "larkollen";
  expectedLagMinutes: number; // approximate travel time to Moss core
}

export const SIGNAL_STATIONS: SignalStation[] = [
  // Horten/RV19 corridor - ferry traffic heading toward Moss
  {
    id: "48148V1175464",
    name: "Horten RV19 nord",
    corridor: "horten_rv19",
    expectedLagMinutes: 60,
  },
  {
    id: "37692V1827282",
    name: "Horten RV19 sor",
    corridor: "horten_rv19",
    expectedLagMinutes: 45,
  },

  // E6 north corridor - southbound traffic from Vestby
  {
    id: "65271V443150",
    name: "Vestby syd (E6)",
    corridor: "e6_nord",
    expectedLagMinutes: 30,
  },

  // E6 south corridor - northbound traffic from Sarpsborg/Fredrikstad
  {
    id: "12554V971778",
    name: "Jonsten (E6 sor)",
    corridor: "e6_sor",
    expectedLagMinutes: 40,
  },
  {
    id: "65179V1209937",
    name: "Solli (E6 sor)",
    corridor: "e6_sor",
    expectedLagMinutes: 25,
  },

  // Larkollen corridor - local/recreational traffic
  {
    id: "37187V971514",
    name: "Halmstad sor (Larkollen)",
    corridor: "larkollen",
    expectedLagMinutes: 20,
  },
];

export const SIGNAL_STATION_IDS = SIGNAL_STATIONS.map((s) => s.id);

export const SIGNAL_STATION_NAMES: Record<string, string> = Object.fromEntries(
  SIGNAL_STATIONS.map((s) => [s.id, s.name])
);

/** Group signal stations by corridor for feature aggregation */
export function getStationsByGroup(): Record<string, SignalStation[]> {
  const groups: Record<string, SignalStation[]> = {};
  for (const s of SIGNAL_STATIONS) {
    if (!groups[s.corridor]) groups[s.corridor] = [];
    groups[s.corridor].push(s);
  }
  return groups;
}
