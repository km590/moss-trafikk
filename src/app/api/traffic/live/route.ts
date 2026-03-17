import { NextResponse } from "next/server";
import { STATIONS } from "@/lib/stations";
import { fetchLatestHourForAllStations } from "@/lib/vegvesen-client";
import { classifyCongestion, getNormalVolume, getCorridorWorstPoint } from "@/lib/traffic-logic";
import averages from "@/data/averages.json";
import type { StationStatus, StationAverages } from "@/lib/types";

export const revalidate = 300;

export async function GET() {
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

  return NextResponse.json({
    stations,
    worstPoint,
    updatedAt: now.toISOString(),
  });
}
