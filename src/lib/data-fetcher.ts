import { STATIONS } from "./stations";
import { fetchLatestHourForAllStations } from "./vegvesen-client";
import { classifyCongestion, getNormalVolume, getCorridorWorstPoint, findBestCrossingTime } from "./traffic-logic";
import averages from "../data/averages.json";
import type { CorridorStatus, BestTimeResult, StationStatus, StationAverages } from "./types";

export async function getTrafficData(): Promise<{
  corridor: CorridorStatus;
  bestTime: BestTimeResult;
}> {
  try {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const hour = now.getHours();

    const stationIds = STATIONS.map((s) => s.id);
    const volumes = await fetchLatestHourForAllStations(stationIds);

    const stations: StationStatus[] = STATIONS.map((station, i) => {
      const volume = volumes[i];
      const normalVolume = getNormalVolume(averages as StationAverages, station.id, dayOfWeek, hour);

      if (volume === null) {
        return {
          station,
          currentVolume: null,
          normalVolume,
          congestion: "green",
          deviationPercent: 100,
          coverage: 0,
          updatedAt: now.toISOString(),
        } satisfies StationStatus;
      }

      const { level, deviationPercent } = classifyCongestion(volume.total, normalVolume, station.id);

      return {
        station,
        currentVolume: volume.total,
        normalVolume,
        congestion: level,
        deviationPercent,
        coverage: volume.coverage,
        updatedAt: volume.to,
      } satisfies StationStatus;
    });

    const worstPoint = getCorridorWorstPoint(stations);

    const corridor: CorridorStatus = {
      stations,
      worstPoint,
      updatedAt: now.toISOString(),
    };

    const bestTime = findBestCrossingTime(averages as StationAverages, hour, dayOfWeek, "kanalbrua");

    return { corridor, bestTime };
  } catch {
    const now = new Date();

    const fallbackStations: StationStatus[] = STATIONS.map((station) => ({
      station,
      currentVolume: null,
      normalVolume: 0,
      congestion: "green",
      deviationPercent: 100,
      coverage: 0,
      updatedAt: now.toISOString(),
    }));

    const corridor: CorridorStatus = {
      stations: fallbackStations,
      worstPoint: null,
      updatedAt: now.toISOString(),
    };

    const bestTime: BestTimeResult = {
      primary: {
        startHour: 0,
        endHour: 1,
        expectedDeviation: 0,
        label: "Ingen data tilgjengelig",
        reason: "Ingen data tilgjengelig",
      },
      backup: null,
      mode: "kanalbrua",
    };

    return { corridor, bestTime };
  }
}
