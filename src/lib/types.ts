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

// ML prediction types (Sprint 2)

export type DayType = "public_holiday" | "pre_holiday" | "school_break" | "normal";

export interface HourlyPrediction {
  hour: number;
  predicted: number;
  congestion: CongestionLevel;
  confidence: "high" | "medium" | "low";
  label: string; // e.g. "14:00"
}

export interface PredictionResult {
  stationId: string;
  predictions: HourlyPrediction[];
  peakHour: number;
  quietestHour: number;
  summary: string; // e.g. "Mest trafikk kl. 16"
  dayType: DayType;
}

export interface ModelWeights {
  basePatterns: {
    [stationId: string]: {
      [dayOfWeek: number]: {
        [hour: number]: {
          median: number;
          mean: number;
          sampleCount: number;
          p25: number;
          p75: number;
        };
      };
    };
  };
  monthFactors: {
    [month: number]: number; // 0-11, multiplier relative to annual average
  };
  holidayFactors: {
    public_holiday: number;
    pre_holiday: number;
    school_break: number;
  };
  metadata: {
    generatedAt: string;
    weeksOfData: number;
    stationCount: number;
  };
}
