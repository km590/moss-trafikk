export type CongestionLevel = "green" | "yellow" | "orange" | "red" | "unknown";

export type Direction = "from" | "to"; // from = away from Moss center, to = toward Moss center

export interface Station {
  id: string;
  name: string;
  road: string;
  role: string;
  lat: number;
  lon: number;
  corridorOrder: number; // 0 = northernmost (Våler), 9 = southernmost/Jeløya side
  directions: { from: string; to: string };
}

export interface HourlyVolume {
  stationId: string;
  from: string; // ISO timestamp
  to: string;
  total: number;
  coverage: number; // 0-100
  validLength: boolean;
}

export interface StationStatus {
  station: Station;
  currentVolume: number | null;
  normalVolume: number;
  congestion: CongestionLevel;
  deviationPercent: number; // e.g. 132 means 132% of normal
  coverage: number;
  updatedAt: string;
}

export interface CorridorStatus {
  stations: StationStatus[];
  worstPoint: StationStatus | null;
  updatedAt: string;
  isStale: boolean; // true if data is >2 hours old
  dataAge: string; // human-readable, e.g. "3 timer siden"
}

export interface BestTimeWindow {
  startHour: number;
  endHour: number;
  expectedDeviation: number; // percent of normal
  label: string; // e.g. "14:00 - 15:00"
  reason: string;
}

export interface BestTimeResult {
  primary: BestTimeWindow;
  backup: BestTimeWindow | null;
  mode: "kanalbrua" | "corridor";
}

// Averages JSON structure
export interface StationAverages {
  [stationId: string]: {
    [dayOfWeek: number]: {
      // 0 = Sunday, 6 = Saturday
      [hour: number]: {
        mean: number;
        median: number;
        sampleCount: number;
      };
    };
  };
}
