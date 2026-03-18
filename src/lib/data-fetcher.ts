import { STATIONS, KANALBRUA_ID } from "./stations";
import { fetchLatestHourForAllStations } from "./vegvesen-client";
import { classifyCongestion, getNormalVolume, getCorridorWorstPoint, findBestCrossingTime, getNorwayTime } from "./traffic-logic";
import { getPredictions, isMay17ModeActive, getMay17Comparison, getModelNormalVolume, predictVolume } from "./prediction-engine";
import { getFerrySignal } from "./ferry-signal";
import averages from "../data/averages.json";
import type { CorridorStatus, BestTimeResult, StationStatus, StationAverages, PredictionResult, HourlyPrediction } from "./types";

const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

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
  may17: {
    showSection: boolean; // Only true May 1-17
    active: boolean;      // Auto-activated May 16 (Fri) and May 17
    normalDay: HourlyPrediction[];
    may17Day: HourlyPrediction[];
  };
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
      const currentNormal = getNormalVolume(averages as StationAverages, station.id, dayOfWeek, hour);

      if (volume === null || isStale) {
        // Use prediction as estimate instead of showing "unknown"
        const pred = predictVolume(station.id, now, hour);
        const estimatedCongestion = pred.predicted > 0
          ? classifyCongestion(pred.predicted, currentNormal, station.id).level
          : "unknown" as const;

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
      const normalVolume = getNormalVolume(averages as StationAverages, station.id, dataDay, dataHour);

      const { level, deviationPercent } = classifyCongestion(volume.total, normalVolume, station.id);

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
    const nonUnknown = stations.filter(s => s.congestion !== "unknown");
    const worstPoint = nonUnknown.length > 0 ? getCorridorWorstPoint(nonUnknown) : null;

    const corridor: CorridorStatus = {
      stations,
      worstPoint,
      updatedAt: latestDataTime?.toISOString() ?? now.toISOString(),
      isStale,
      dataAge: latestDataTime ? formatDataAge(dataAgeMs) : "ukjent",
    };

    const bestTime = findBestCrossingTime(averages as StationAverages, hour, dayOfWeek, "kanalbrua");

    // Ferry boost disabled: baseline already contains normal ferry rhythm.
    // Re-enable only as deviation signal (cancellations, delays, extra departures).
    // See eval data: baseline hit 2.8% error, ferry boost added +25% overshoot.

    // Predictions (pure baseline)
    const predictions = getPredictions(KANALBRUA_ID, now, hour, 4);
    const fullDayPredictions = getPredictions(KANALBRUA_ID, now, hour, 24);
    const chartPredictions = fullDayPredictions.predictions.filter(p => p.hour >= 6 && p.hour <= 22);

    // Normal pattern for chart
    const normalPattern = [];
    for (let h = 6; h <= 22; h++) {
      normalPattern.push({ hour: h, volume: getModelNormalVolume(KANALBRUA_ID, dayOfWeek, h) });
    }

    // May 17 mode: only show section May 1-17
    const nowMonth = now.getMonth(); // 0-indexed, May = 4
    const nowDay = now.getDate();
    const showMay17Section = nowMonth === 4 && nowDay <= 17;
    const may17Active = isMay17ModeActive(now);
    const may17Data = showMay17Section
      ? getMay17Comparison(KANALBRUA_ID, now.getFullYear())
      : { normalDay: [], may17Day: [] };

    return {
      corridor,
      bestTime,
      predictions,
      chartPredictions,
      normalPattern,
      may17: {
        showSection: showMay17Section,
        active: may17Active,
        normalDay: may17Data.normalDay,
        may17Day: may17Data.may17Day,
      },
    };
  } catch (error) {
    console.error("Failed to fetch traffic data:", error);
    const now = new Date();
    const { dayOfWeek, hour } = getNorwayTime();

    const fallbackStations: StationStatus[] = STATIONS.map((station) => {
      const normalVolume = getNormalVolume(averages as StationAverages, station.id, dayOfWeek, hour);
      const pred = predictVolume(station.id, now, hour);
      const estimatedCongestion = pred.predicted > 0
        ? classifyCongestion(pred.predicted, normalVolume, station.id).level
        : "unknown" as const;

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

    const bestTime = findBestCrossingTime(averages as StationAverages, hour, dayOfWeek, "kanalbrua");

    const predictions = getPredictions(KANALBRUA_ID, now, hour, 4);
    const fullDayPredictions = getPredictions(KANALBRUA_ID, now, hour, 24);
    const chartPredictions = fullDayPredictions.predictions.filter(p => p.hour >= 6 && p.hour <= 22);
    const normalPattern = [];
    for (let h = 6; h <= 22; h++) {
      normalPattern.push({ hour: h, volume: getModelNormalVolume(KANALBRUA_ID, dayOfWeek, h) });
    }
    return {
      corridor,
      bestTime,
      predictions,
      chartPredictions,
      normalPattern,
      may17: {
        showSection: false,
        active: false,
        normalDay: [],
        may17Day: [],
      },
    };
  }
}
