import { getTrafficData } from "@/lib/data-fetcher";
import { findBestCrossingTime, getCongestionLabel, getNorwayTime, formatNorwayTime } from "@/lib/traffic-logic";
import averages from "@/data/averages.json";
import KpiCard from "@/components/kpi-card";
import CorridorStepper from "@/components/corridor-stepper";
import BestTimeWidget from "@/components/best-time-widget";
import { KANALBRUA_ID } from "@/lib/stations";
import type { StationAverages } from "@/lib/types";

export const revalidate = 300;

export default async function Home() {
  const { corridor, bestTime } = await getTrafficData();

  const kanalbrua = corridor.stations.find(s => s.station.id === KANALBRUA_ID);

  const { hour: currentHour, dayOfWeek } = getNorwayTime();
  const corridorBestTime = findBestCrossingTime(
    averages as StationAverages,
    currentHour,
    dayOfWeek,
    "corridor"
  );

  const updatedAt = new Date(corridor.updatedAt);
  const timeStr = formatNorwayTime(updatedAt);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Bør du kjøre nå?</h1>
        <p className="text-sm text-slate-500 mt-1">
          Siste time · Oppdatert kl. {timeStr}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Kanalbrua nå"
          value={kanalbrua ? getCongestionLabel(kanalbrua.congestion) : "Ingen data"}
          subtitle={kanalbrua?.currentVolume ? `${kanalbrua.deviationPercent}% av normal` : "Mangler data"}
          congestion={kanalbrua?.congestion ?? "green"}
        />
        <KpiCard
          title="Korridoren"
          value={corridor.worstPoint ? corridor.worstPoint.station.name : "Ingen data"}
          subtitle={corridor.worstPoint ? `Verste punkt – ${corridor.worstPoint.deviationPercent}% av normal` : "Alt ser normalt ut"}
          congestion={corridor.worstPoint?.congestion ?? "green"}
        />
        <KpiCard
          title="Beste kryssing"
          value={bestTime.primary.label}
          subtitle={bestTime.primary.reason}
          congestion="green"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-600 mb-4 uppercase tracking-wide">
          Korridorstatus
        </h2>
        <CorridorStepper statuses={corridor.stations} />
      </div>

      <BestTimeWidget kanalbruaResult={bestTime} corridorResult={corridorBestTime} />

      <p className="text-xs text-slate-400 text-center">
        Trengselslogikk basert på historisk avvik per ukedag og time.{" "}
        <a href="/om" className="underline">Les mer om metoden</a>.
      </p>
    </div>
  );
}
