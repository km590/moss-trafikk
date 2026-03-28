/**
 * Build feature vectors for residual model inference.
 * Converts live traffic data into the feature format expected by tree-walker.
 */

import type { ResidualModel } from "./tree-walker";
import { classifyDate } from "./norwegian-calendar";
import { LAG_MASK_HOURS, LATEST_MASK_HOURS, CROSS_STATION_MAX_AGE_HOURS } from "./constants";

// Station groupings (must match Python training config)
const RV19_IDS = ["39666V971386", "72867V971385", "69994V971384", "76208V971383"];
const E6_IDS = ["40488V971307", "15322V971307", "26266V443149"];
const CENTRUM_IDS = ["69994V971384", "72867V971385"];

// Signal corridor groupings (external leading indicators)
const HORTEN_IDS = ["48148V1175464", "37692V1827282"];
const E6_NORD_IDS = ["65271V443150"];
const E6_SOR_IDS = ["12554V971778", "65179V1209937"];
const LARKOLLEN_IDS = ["37187V971514"];

export const SIGNAL_STATION_IDS = [...HORTEN_IDS, ...E6_NORD_IDS, ...E6_SOR_IDS, ...LARKOLLEN_IDS];

const RUSH_HOURS = [7, 8, 15, 16, 17];
const EVENING_HOURS = [19, 20, 21, 22];

const DAY_TYPE_ENCODING: Record<string, number> = {
  normal: 0,
  school_break: 1,
  pre_holiday: 2,
  public_holiday: 3,
};

export interface StationLiveData {
  volume: number;
  ageHours: number; // hours since measurement
  coverage: number;
  // Historical lags (if available)
  lag1h?: number;
  lag2h?: number;
  lag3h?: number;
}

/** Hourly volume records for signal stations, keyed by epoch-ms (avoids timezone string mismatch) */
export type SignalHourlyData = Map<number, { stationId: string; volume: number }[]>;

export function buildFeatures(
  stationId: string,
  baselinePrediction: number,
  date: Date,
  hour: number,
  latestVolumes: Map<string, StationLiveData>,
  model: ResidualModel,
  signalHourly?: SignalHourlyData
): Record<string, number> {
  const dayOfWeek = date.getDay();
  const month = date.getMonth();
  const dayType = classifyDate(date);

  // Station encoding from model
  const stationEncoding = model.categoricalFeatures.station_id?.[stationId] ?? -1;

  // Current station data
  const stationData = latestVolumes.get(stationId);
  const freshness = stationData?.ageHours ?? 8; // default to very stale

  // Lag features: -1 when stale or unavailable
  const maskLags = freshness > LAG_MASK_HOURS;
  const lag1h = maskLags ? -1 : (stationData?.lag1h ?? -1);
  const lag2h = maskLags ? -1 : (stationData?.lag2h ?? -1);
  const lag3h = maskLags ? -1 : (stationData?.lag3h ?? -1);

  // Latest measured volume: -1 when very stale
  const maskLatest = freshness > LATEST_MASK_HOURS;
  const latestMeasured = maskLatest ? -1 : (stationData?.volume ?? -1);

  // Cross-station features
  const sumRv19 = sumStationVolumes(RV19_IDS, latestVolumes);
  const sumE6 = sumStationVolumes(E6_IDS, latestVolumes);
  const centrumPressure = avgStationVolumes(CENTRUM_IDS, latestVolumes);
  const neighborAvg = avgStationVolumes([...latestVolumes.keys()], latestVolumes);

  // Signal corridor lag features
  const signalFeatures = computeSignalFeatures(date, hour, maskLags, signalHourly);
  const signalAvailable = Object.values(signalFeatures).filter((v) => v !== -1).length;
  if (signalAvailable < 8) {
    console.log(`[v2.1] signal coverage: ${signalAvailable}/8 features for h=${hour}`);
  }

  return {
    baseline_prediction: baselinePrediction,
    station_id: stationEncoding,
    weekday: dayOfWeek,
    hour,
    month,
    day_type: DAY_TYPE_ENCODING[dayType] ?? 0,
    is_rush: RUSH_HOURS.includes(hour) ? 1 : 0,
    is_evening: EVENING_HOURS.includes(hour) ? 1 : 0,
    latest_measured_volume: latestMeasured,
    freshness,
    coverage: stationData?.coverage ?? 0,
    lag_1h: lag1h,
    lag_2h: lag2h,
    lag_3h: lag3h,
    sum_rv19: sumRv19,
    sum_e6: sumE6,
    centrum_pressure: centrumPressure,
    neighbor_avg: neighborAvg,
    ...signalFeatures,
  };
}

function corridorSumAtOffset(
  corridorIds: string[],
  date: Date,
  currentHour: number,
  offsetHours: number,
  signalHourly?: SignalHourlyData
): number {
  if (!signalHourly) return -1;

  const targetDate = new Date(date);
  targetDate.setHours(currentHour - offsetHours, 0, 0, 0);
  const targetKey = targetDate.getTime();

  const records = signalHourly.get(targetKey);
  if (!records) return -1;

  let sum = 0;
  let count = 0;
  for (const id of corridorIds) {
    const rec = records.find((r) => r.stationId === id);
    if (rec) {
      sum += rec.volume;
      count++;
    }
  }
  return count > 0 ? sum : -1;
}

function computeSignalFeatures(
  date: Date,
  hour: number,
  maskLags: boolean,
  signalHourly?: SignalHourlyData
): Record<string, number> {
  if (maskLags || !signalHourly) {
    return {
      horten_lag1h: -1,
      horten_lag2h: -1,
      e6nord_lag1h: -1,
      e6nord_lag2h: -1,
      e6sor_lag1h: -1,
      e6sor_lag2h: -1,
      larkollen_lag1h: -1,
      larkollen_lag2h: -1,
    };
  }

  return {
    horten_lag1h: corridorSumAtOffset(HORTEN_IDS, date, hour, 1, signalHourly),
    horten_lag2h: corridorSumAtOffset(HORTEN_IDS, date, hour, 2, signalHourly),
    e6nord_lag1h: corridorSumAtOffset(E6_NORD_IDS, date, hour, 1, signalHourly),
    e6nord_lag2h: corridorSumAtOffset(E6_NORD_IDS, date, hour, 2, signalHourly),
    e6sor_lag1h: corridorSumAtOffset(E6_SOR_IDS, date, hour, 1, signalHourly),
    e6sor_lag2h: corridorSumAtOffset(E6_SOR_IDS, date, hour, 2, signalHourly),
    larkollen_lag1h: corridorSumAtOffset(LARKOLLEN_IDS, date, hour, 1, signalHourly),
    larkollen_lag2h: corridorSumAtOffset(LARKOLLEN_IDS, date, hour, 2, signalHourly),
  };
}

function sumStationVolumes(
  stationIds: string[],
  latestVolumes: Map<string, StationLiveData>
): number {
  let sum = 0;
  let count = 0;
  for (const id of stationIds) {
    const data = latestVolumes.get(id);
    if (data && data.ageHours < CROSS_STATION_MAX_AGE_HOURS && data.volume > 0) {
      sum += data.volume;
      count++;
    }
  }
  return count > 0 ? sum : -1;
}

function avgStationVolumes(
  stationIds: string[],
  latestVolumes: Map<string, StationLiveData>
): number {
  let sum = 0;
  let count = 0;
  for (const id of stationIds) {
    const data = latestVolumes.get(id);
    if (data && data.ageHours < CROSS_STATION_MAX_AGE_HOURS && data.volume > 0) {
      sum += data.volume;
      count++;
    }
  }
  return count > 0 ? Math.round(sum / count) : -1;
}
