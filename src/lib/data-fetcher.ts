import { STATIONS, KANALBRUA_ID } from "./stations";
import {
  fetchLatestHourForAllStations,
  fetchHourlyVolume,
  getRecentHoursRange,
} from "./vegvesen-client";
import {
  classifyCongestion,
  getNormalVolume,
  getCorridorWorstPoint,
  findBestCrossingTime,
  getNorwayTime,
} from "./traffic-logic";
import {
  getPredictions,
  isMay17ModeActive,
  getMay17Comparison,
  getModelNormalVolume,
  predictVolume,
  classifyPredictedCongestion,
} from "./prediction-engine";
import { isV2Enabled, getV2Predictions } from "./prediction-engine-v2";
import { makeDecision } from "./decision-engine";
import { SIGNAL_STATION_IDS, type StationLiveData, type SignalHourlyData } from "./feature-builder";
import { fetchFerryDepartures, type FerryDeparture } from "./entur-client";
import averages from "../data/averages.json";
import type {
  CorridorStatus,
  BestTimeResult,
  StationStatus,
  StationAverages,
  PredictionResult,
  HourlyPrediction,
  HourlyPredictionV2,
  TravelDecision,
} from "./types";

import { STALE_THRESHOLD_MS } from "./constants";


async function fetchSignalHourlyData(): Promise<{
  data: SignalHourlyData;
  stats: SignalFetchStats;
}> {
  const { from, to } = getRecentHoursRange();
  const hourlyData: SignalHourlyData = new Map();
  const t0 = Date.now();
  let fetched = 0;
  let failed = 0;

  await Promise.all(
    SIGNAL_STATION_IDS.map(async (stationId) => {
      try {
        const volumes = await fetchHourlyVolume(stationId, from, to);
        fetched++;
        for (const v of volumes) {
          if (v.coverage <= 50) continue;
          const hourKey = new Date(v.from).getTime();
          if (!hourlyData.has(hourKey)) {
            hourlyData.set(hourKey, []);
          }
          hourlyData.get(hourKey)!.push({ stationId, volume: v.total });
        }
      } catch {
        failed++;
      }
    })
  );

  const durationMs = Date.now() - t0;
  const stats: SignalFetchStats = {
    fetched,
    failed,
    totalStations: SIGNAL_STATION_IDS.length,
    durationMs,
    hourlyKeys: hourlyData.size,
  };

  return { data: hourlyData, stats };
}

interface SignalFetchStats {
  fetched: number;
  failed: number;
  totalStations: number;
  durationMs: number;
  hourlyKeys: number;
}

function formatDataAge(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min siden`;
  const hours = Math.round(minutes / 60);
  return `${hours} ${hours === 1 ? "time" : "timer"} siden`;
}

export interface TrafficDataResult {
  corridor: CorridorStatus;
  bestTime: BestTimeResult;
  predictions: PredictionResult;
  chartPredictions: HourlyPrediction[];
  normalPattern: { hour: number; volume: number }[];
  ferryDepartures: FerryDeparture[];
  may17: {
    showSection: boolean; // Only true May 1-17
    active: boolean; // Auto-activated May 16 (Fri) and May 17
    normalDay: HourlyPrediction[];
    may17Day: HourlyPrediction[];
  };
  // V2: decision layer + residual predictions
  travelDecision: TravelDecision;
  v2Predictions: HourlyPredictionV2[] | null;
}

export async function getTrafficData(): Promise<TrafficDataResult> {
  try {
    const now = new Date();
    const { dayOfWeek, hour } = getNorwayTime();

    const stationIds = STATIONS.map((s) => s.id);
    const volumes = await fetchLatestHourForAllStations(stationIds);

    // Find the most recent data timestamp
    const latestDataTime = volumes.reduce<Date | null>((latest, v) => {
      if (!v) return latest;
      const t = new Date(v.to);
      return !latest || t > latest ? t : latest;
    }, null);

    const dataAgeMs = latestDataTime ? now.getTime() - latestDataTime.getTime() : Infinity;
    const isStale = dataAgeMs > STALE_THRESHOLD_MS;

    // When data is stale, use current hour's historical averages for status
    // instead of showing old rush-hour data as "current"
    const stations: StationStatus[] = STATIONS.map((station, i) => {
      const volume = volumes[i];
      const currentNormal = getNormalVolume(
        averages as StationAverages,
        station.id,
        dayOfWeek,
        hour
      );

      if (volume === null || isStale) {
        // Use prediction as estimate with percentile classification
        const pred = predictVolume(station.id, now, hour);
        const estimatedCongestion =
          pred.predicted > 0
            ? classifyPredictedCongestion(pred.predicted, station.id, dayOfWeek, hour)
            : ("unknown" as const);

        return {
          station,
          currentVolume: isStale && volume ? volume.total : null,
          normalVolume: currentNormal,
          congestion: estimatedCongestion,
          deviationPercent: 100,
          coverage: 0,
          updatedAt: isStale && latestDataTime ? latestDataTime.toISOString() : now.toISOString(),
          isEstimate: true,
        };
      }

      // Fresh data: use the data's actual hour for normal comparison
      const dataHour = new Date(volume.to).getHours();
      const dataDay = new Date(volume.to).getDay();
      const normalVolume = getNormalVolume(
        averages as StationAverages,
        station.id,
        dataDay,
        dataHour
      );

      const { level, deviationPercent } = classifyCongestion(
        volume.total,
        normalVolume,
        station.id,
        dataHour
      );

      return {
        station,
        currentVolume: volume.total,
        normalVolume,
        congestion: level,
        deviationPercent,
        coverage: volume.coverage,
        updatedAt: volume.to,
        isEstimate: false,
      };
    });

    // Find worst point even when stale (using estimates)
    const nonUnknown = stations.filter((s) => s.congestion !== "unknown");
    const worstPoint = nonUnknown.length > 0 ? getCorridorWorstPoint(nonUnknown) : null;

    const corridor: CorridorStatus = {
      stations,
      worstPoint,
      updatedAt: latestDataTime?.toISOString() ?? now.toISOString(),
      isStale,
      dataAge: latestDataTime ? formatDataAge(dataAgeMs) : "ukjent",
    };

    const bestTime = findBestCrossingTime(
      averages as StationAverages,
      hour,
      dayOfWeek,
      "kanalbrua"
    );

    // Ferry boost disabled: baseline already contains normal ferry rhythm.
    // Re-enable only as deviation signal (cancellations, delays, extra departures).
    // See eval data: baseline hit 2.8% error, ferry boost added +25% overshoot.

    // Predictions (pure baseline)
    const predictions = getPredictions(KANALBRUA_ID, now, hour, 4);
    const fullDayPredictions = getPredictions(KANALBRUA_ID, now, hour, 24);
    const chartPredictions = fullDayPredictions.predictions.filter(
      (p) => p.hour >= 6 && p.hour <= 22
    );

    // Normal pattern for chart
    const normalPattern = [];
    for (let h = 6; h <= 22; h++) {
      normalPattern.push({ hour: h, volume: getModelNormalVolume(KANALBRUA_ID, dayOfWeek, h) });
    }

    // Ferry departures (info only, no prediction boost)
    let ferryDepartures: FerryDeparture[] = [];
    try {
      ferryDepartures = await fetchFerryDepartures(3);
    } catch {
      // Ferry info is optional
    }

    // May 17 mode: only show section May 1-17
    const nowMonth = now.getMonth(); // 0-indexed, May = 4
    const nowDay = now.getDate();
    const showMay17Section = nowMonth === 4 && nowDay <= 17;
    const may17Active = isMay17ModeActive(now);
    const may17Data = showMay17Section
      ? getMay17Comparison(KANALBRUA_ID, now.getFullYear())
      : { normalDay: [], may17Day: [] };

    // V2: Build latestVolumes map for residual model features
    let v2Predictions: HourlyPredictionV2[] | null = null;
    let travelDecision: TravelDecision;

    if (isV2Enabled()) {
      const latestVolumes = new Map<string, StationLiveData>();
      for (const st of stations) {
        const vol = st.currentVolume;
        if (vol !== null) {
          const ageMs = now.getTime() - new Date(st.updatedAt).getTime();
          const ageHours = ageMs / (1000 * 60 * 60);
          latestVolumes.set(st.station.id, {
            volume: vol,
            ageHours,
            coverage: st.coverage,
          });
        }
      }

      // Fetch signal station hourly data for corridor lag features
      let signalHourly: SignalHourlyData | undefined;
      try {
        const signalResult = await fetchSignalHourlyData();
        signalHourly = signalResult.data;
        const s = signalResult.stats;
        console.log(
          `[v2.1] signal fetch: ${s.fetched}/${s.totalStations} ok, ${s.failed} failed, ${s.hourlyKeys} hours, ${s.durationMs}ms`
        );
      } catch {
        console.log("[v2.1] signal fetch: complete failure, using fallback (-1)");
      }

      v2Predictions = getV2Predictions(KANALBRUA_ID, now, hour, 5, latestVolumes, signalHourly);

      // Decision engine: current + next 4 hours
      const currentV2 = v2Predictions[0];
      const futureV2 = v2Predictions.slice(1);
      const kanalbruaStation = stations.find((s) => s.station.id === KANALBRUA_ID);
      const currentCongestion = kanalbruaStation?.congestion ?? currentV2.congestion;
      travelDecision = makeDecision(currentV2, futureV2, currentCongestion);
    } else {
      // V1 fallback: build decision from v1 predictions
      const v1Current = predictions.predictions[0];
      const v1Future = predictions.predictions.slice(1);
      const kanalbruaStationV1 = stations.find((s) => s.station.id === KANALBRUA_ID);
      const kanalbruaCongestion = kanalbruaStationV1?.congestion ?? "unknown";

      // Convert v1 predictions to v2 format for decision engine
      const toV2 = (p: HourlyPrediction): HourlyPredictionV2 => ({
        ...p,
        predictedLow: p.predicted,
        predictedHigh: p.predicted,
        residual: 0,
        modelVersion: "v1",
        confidenceBucket: p.confidence,
      });

      travelDecision = makeDecision(toV2(v1Current), v1Future.map(toV2), kanalbruaCongestion);
    }

    return {
      corridor,
      bestTime,
      predictions,
      chartPredictions,
      normalPattern,
      ferryDepartures,
      may17: {
        showSection: showMay17Section,
        active: may17Active,
        normalDay: may17Data.normalDay,
        may17Day: may17Data.may17Day,
      },
      travelDecision,
      v2Predictions,
    };
  } catch (error) {
    console.error("Failed to fetch traffic data:", error);
    const now = new Date();
    const { dayOfWeek, hour } = getNorwayTime();

    const fallbackStations: StationStatus[] = STATIONS.map((station) => {
      const normalVolume = getNormalVolume(
        averages as StationAverages,
        station.id,
        dayOfWeek,
        hour
      );
      const pred = predictVolume(station.id, now, hour);
      const estimatedCongestion =
        pred.predicted > 0
          ? classifyPredictedCongestion(pred.predicted, station.id, dayOfWeek, hour)
          : ("unknown" as const);

      return {
        station,
        currentVolume: null,
        normalVolume,
        congestion: estimatedCongestion,
        deviationPercent: 100,
        coverage: 0,
        updatedAt: now.toISOString(),
        isEstimate: true,
      };
    });

    const corridor: CorridorStatus = {
      stations: fallbackStations,
      worstPoint: null,
      updatedAt: now.toISOString(),
      isStale: true,
      dataAge: "ukjent",
    };

    const bestTime = findBestCrossingTime(
      averages as StationAverages,
      hour,
      dayOfWeek,
      "kanalbrua"
    );

    const predictions = getPredictions(KANALBRUA_ID, now, hour, 4);
    const fullDayPredictions = getPredictions(KANALBRUA_ID, now, hour, 24);
    const chartPredictions = fullDayPredictions.predictions.filter(
      (p) => p.hour >= 6 && p.hour <= 22
    );
    const normalPattern = [];
    for (let h = 6; h <= 22; h++) {
      normalPattern.push({ hour: h, volume: getModelNormalVolume(KANALBRUA_ID, dayOfWeek, h) });
    }

    // V1 fallback decision
    const toV2Fallback = (p: HourlyPrediction): HourlyPredictionV2 => ({
      ...p,
      predictedLow: p.predicted,
      predictedHigh: p.predicted,
      residual: 0,
      modelVersion: "v1",
      confidenceBucket: p.confidence,
    });
    const fallbackDecision = makeDecision(
      toV2Fallback(predictions.predictions[0]),
      predictions.predictions.slice(1).map(toV2Fallback),
      "unknown"
    );

    return {
      corridor,
      bestTime,
      predictions,
      chartPredictions,
      normalPattern,
      ferryDepartures: [],
      may17: {
        showSection: false,
        active: false,
        normalDay: [],
        may17Day: [],
      },
      travelDecision: fallbackDecision,
      v2Predictions: null,
    };
  }
}
