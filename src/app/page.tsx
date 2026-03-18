import { getTrafficData } from "@/lib/data-fetcher";
import { findBestCrossingTime, getCongestionLabel, getNorwayTime, formatNorwayTime } from "@/lib/traffic-logic";
import averages from "@/data/averages.json";
import KpiCard from "@/components/kpi-card";
import CorridorStepper from "@/components/corridor-stepper";
import BestTimeWidget from "@/components/best-time-widget";
import PredictionCard from "@/components/prediction-card";
import PredictionChart from "@/components/prediction-chart";
import Mai17Mode from "@/components/mai17-mode";
import { KANALBRUA_ID } from "@/lib/stations";
import type { StationAverages } from "@/lib/types";

export const revalidate = 300;

const DAY_LABELS = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];

function deviationToText(percent: number): string {
  if (percent <= 95) return "Roligere enn vanlig";
  if (percent <= 110) return "Som vanlig";
  return `${percent - 100}% mer enn vanlig`;
}

export default async function Home() {
  const { corridor, bestTime, predictions, chartPredictions, normalPattern, may17 } = await getTrafficData();

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
  const dayLabel = DAY_LABELS[dayOfWeek] ?? "i dag";

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Bør du kjøre nå?</h1>
        <p className="text-sm text-slate-500 mt-1">
          {corridor.isStale ? (
            <>Historisk snitt · Siste måling {corridor.dataAge}</>
          ) : (
            <>Siste time · Oppdatert kl. {timeStr}</>
          )}
        </p>
      </div>

      {corridor.isStale && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <span aria-hidden="true">⚠</span>
          Vegvesen-data er forsinket. Viser typisk trafikk for dette tidspunktet basert på historisk snitt.
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title={corridor.isStale ? "Kanalbrua typisk nå" : "Kanalbrua nå"}
          value={kanalbrua ? getCongestionLabel(kanalbrua.congestion) : "Ingen data"}
          subtitle={
            corridor.isStale
              ? "Basert på historisk snitt"
              : kanalbrua?.currentVolume
                ? deviationToText(kanalbrua.deviationPercent)
                : "Mangler data"
          }
          congestion={kanalbrua?.congestion ?? "green"}
        />
        <KpiCard
          title="Korridoren"
          value={corridor.worstPoint ? corridor.worstPoint.station.name : (corridor.isStale ? "Typisk normal" : "Ingen data")}
          subtitle={
            corridor.worstPoint
              ? `Verste punkt – ${deviationToText(corridor.worstPoint.deviationPercent)}`
              : (corridor.isStale ? "Historisk snitt" : "Alt ser normalt ut")
          }
          congestion={corridor.worstPoint?.congestion ?? "green"}
        />
        <KpiCard
          title="Beste kryssing"
          value={bestTime.primary.label}
          subtitle={bestTime.primary.reason}
          congestion="green"
        />
      </div>

      {/* Prediction card */}
      <PredictionCard prediction={predictions} stationName="Kanalbrua" />

      {/* Corridor stepper */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-600 mb-4 uppercase tracking-wide">
          Korridorstatus
        </h2>
        <CorridorStepper statuses={corridor.stations} />
      </div>

      {/* Prediction chart (collapsible) */}
      <details className="group">
        <summary className="cursor-pointer text-sm font-semibold text-slate-600 uppercase tracking-wide bg-white rounded-xl border border-slate-200 p-4 list-none flex items-center justify-between">
          Trafikkmønster
          <svg className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div className="mt-2">
          <PredictionChart
            todayPredictions={chartPredictions}
            normalPattern={normalPattern}
            currentHour={currentHour}
            dayLabel={dayLabel}
          />
        </div>
      </details>

      {/* May 17 mode: only visible May 1-17 */}
      {may17.showSection && (
        <Mai17Mode
          normalDay={may17.normalDay}
          may17Day={may17.may17Day}
          autoActivated={may17.active}
          stationName="Kanalbrua"
        />
      )}

      <BestTimeWidget kanalbruaResult={bestTime} corridorResult={corridorBestTime} />

      <p className="text-xs text-slate-400 text-center">
        Trengselslogikk basert på historisk avvik per ukedag og time. Anslag bruker median fra 2 år + sesong- og helligdagsfaktorer. Ikke en garanti.{" "}
        <a href="/om" className="underline">Les mer om metoden</a>.
      </p>
    </div>
  );
}
