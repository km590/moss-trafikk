import { STATIONS } from "./stations";
import { fetchLatestHourForAllStations } from "./vegvesen-client";
import { classifyCongestion, getNormalVolume, getCorridorWorstPoint, findBestCrossingTime, getNorwayTime } from "./traffic-logic";
import averages from "../data/averages.json";
import type { CorridorStatus, BestTimeResult, StationStatus, StationAverages } from "./types";

const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

function formatDataAge(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min siden`;
  const hours = Math.round(minutes / 60);
  return `${hours} ${hours === 1 ? "time" : "timer"} siden`;
}

export async function getTrafficData(): Promise<{
  corridor: CorridorStatus;
  bestTime: BestTimeResult;
}> {
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
        // Fall back to historical: current hour is "normal" by definition
        return {
          station,
          currentVolume: isStale && volume ? volume.total : null,
          normalVolume: currentNormal,
          congestion: "unknown" as const,
          deviationPercent: 100,
          coverage: 0,
          updatedAt: isStale && latestDataTime ? latestDataTime.toISOString() : now.toISOString(),
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
      };
    });

    const worstPoint = isStale ? null : getCorridorWorstPoint(stations);

    const corridor: CorridorStatus = {
      stations,
      worstPoint,
      updatedAt: latestDataTime?.toISOString() ?? now.toISOString(),
      isStale,
      dataAge: latestDataTime ? formatDataAge(dataAgeMs) : "ukjent",
    };

    const bestTime = findBestCrossingTime(averages as StationAverages, hour, dayOfWeek, "kanalbrua");

    return { corridor, bestTime };
  } catch (error) {
    console.error("Failed to fetch traffic data:", error);
    const now = new Date();
    const { dayOfWeek, hour } = getNorwayTime();

    const fallbackStations: StationStatus[] = STATIONS.map((station) => ({
      station,
      currentVolume: null,
      normalVolume: getNormalVolume(averages as StationAverages, station.id, dayOfWeek, hour),
      congestion: "unknown" as const,
      deviationPercent: 100,
      coverage: 0,
      updatedAt: now.toISOString(),
    }));

    const corridor: CorridorStatus = {
      stations: fallbackStations,
      worstPoint: null,
      updatedAt: now.toISOString(),
      isStale: true,
      dataAge: "ukjent",
    };

    const bestTime = findBestCrossingTime(averages as StationAverages, hour, dayOfWeek, "kanalbrua");

    return { corridor, bestTime };
  }
}
