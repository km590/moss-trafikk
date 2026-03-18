/**
 * Build feature vectors for residual model inference.
 * Converts live traffic data into the feature format expected by tree-walker.
 */

import type { ResidualModel } from "./tree-walker";
import { classifyDate } from "./norwegian-calendar";

// Station groupings (must match Python training config)
const RV19_IDS = ["39666V971386", "72867V971385", "69994V971384", "76208V971383"];
const E6_IDS = ["40488V971307", "15322V971307", "26266V443149"];
const CENTRUM_IDS = ["69994V971384", "72867V971385"];

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

export function buildFeatures(
  stationId: string,
  baselinePrediction: number,
  date: Date,
  hour: number,
  latestVolumes: Map<string, StationLiveData>,
  model: ResidualModel
): Record<string, number> {
  const dayOfWeek = date.getDay();
  const month = date.getMonth();
  const dayType = classifyDate(date);

  // Station encoding from model
  const stationEncoding = model.categoricalFeatures.station_id?.[stationId] ?? -1;

  // Current station data
  const stationData = latestVolumes.get(stationId);
  const freshness = stationData?.ageHours ?? 8; // default to very stale

  // Lag features: -1 when stale (freshness > 3) or unavailable
  const maskLags = freshness > 3;
  const lag1h = maskLags ? -1 : (stationData?.lag1h ?? -1);
  const lag2h = maskLags ? -1 : (stationData?.lag2h ?? -1);
  const lag3h = maskLags ? -1 : (stationData?.lag3h ?? -1);

  // Latest measured volume: -1 when very stale
  const maskLatest = freshness > 6;
  const latestMeasured = maskLatest ? -1 : (stationData?.volume ?? -1);

  // Cross-station features
  const sumRv19 = sumStationVolumes(RV19_IDS, latestVolumes);
  const sumE6 = sumStationVolumes(E6_IDS, latestVolumes);
  const centrumPressure = avgStationVolumes(CENTRUM_IDS, latestVolumes);
  const neighborAvg = avgStationVolumes([...latestVolumes.keys()], latestVolumes);

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
    if (data && data.ageHours < 4 && data.volume > 0) {
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
    if (data && data.ageHours < 4 && data.volume > 0) {
      sum += data.volume;
      count++;
    }
  }
  return count > 0 ? Math.round(sum / count) : -1;
}
