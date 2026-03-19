import { getTrafficData } from "@/lib/data-fetcher";
import {
  findBestCrossingTime,
  getCongestionLabel,
  getEstimateCongestionLabel,
  getNorwayTime,
  formatNorwayTime,
} from "@/lib/traffic-logic";
import averages from "@/data/averages.json";
import KpiCard from "@/components/kpi-card";
import CorridorStepper from "@/components/corridor-stepper";
import BestTimeWidget from "@/components/best-time-widget";
import TravelAdvice from "@/components/travel-advice";
import PredictionCard from "@/components/prediction-card";
import PredictionChart from "@/components/prediction-chart";
import FerryCountdown from "@/components/ferry-countdown";
import Mai17Mode from "@/components/mai17-mode";
import PartnerLogos from "@/components/partner-logos";
import { KANALBRUA_ID } from "@/lib/stations";
import type { StationAverages } from "@/lib/types";

export const revalidate = 300;

const DAY_LABELS = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];

function deviationToText(percent: number): string {
  if (percent <= 95) return "Roligere enn vanlig";
  if (percent <= 110) return "Omtrent som vanlig for denne tiden";
  return `${percent - 100}% mer enn vanlig`;
}

export default async function Home() {
  const {
    corridor,
    bestTime,
    predictions,
    chartPredictions,
    normalPattern,
    ferryDepartures,
    may17,
    travelDecision,
    v2Predictions,
  } = await getTrafficData();

  const kanalbrua = corridor.stations.find((s) => s.station.id === KANALBRUA_ID);

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

  const kanalbruaLabel = kanalbrua
    ? kanalbrua.isEstimate
      ? getEstimateCongestionLabel(kanalbrua.congestion)
      : getCongestionLabel(kanalbrua.congestion)
    : "Ingen data";

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <PartnerLogos />
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Er det smart å kjøre nå?</h1>
        <p className="text-sm text-slate-500 mt-1">
          {corridor.isStale ? (
            <>Estimert nå · Sist målt for {corridor.dataAge}</>
          ) : (
            <>Målt siste time · Oppdatert kl. {timeStr}</>
          )}
        </p>
      </div>

      {corridor.isStale && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <span aria-hidden="true">⚠</span>
          Vegvesen-data er forsinket akkurat nå. Derfor viser vi et estimat basert på hvordan
          trafikken vanligvis utvikler seg på dette tidspunktet.
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Kanalbrua nå"
          value={kanalbruaLabel}
          subtitle={
            v2Predictions?.[0]?.explanation ??
            (kanalbrua?.isEstimate
              ? "Omtrent som vanlig for denne tiden"
              : kanalbrua?.currentVolume
                ? deviationToText(kanalbrua.deviationPercent)
                : "Mangler data")
          }
          congestion={kanalbrua?.congestion ?? "green"}
        />
        <KpiCard
          title="Tregeste punkt nå"
          value={
            corridor.worstPoint
              ? corridor.worstPoint.station.name
              : corridor.isStale
                ? "Ser normalt ut"
                : "Ingen data"
          }
          subtitle={
            corridor.worstPoint
              ? "Her begrenses flyten mest akkurat nå"
              : corridor.isStale
                ? "Ingen steder skiller seg ut"
                : "Alt ser normalt ut"
          }
          congestion={corridor.worstPoint?.congestion ?? "green"}
        />
        <KpiCard
          title="De neste timene"
          value={travelDecision.mode === "wait" ? bestTime.primary.label : "Ser greit ut"}
          subtitle={travelDecision.detail ?? "Ingen tydelig gevinst i å vente"}
          congestion={travelDecision.mode === "wait" ? "yellow" : "green"}
        />
      </div>

      {/* Prediction card */}
      <PredictionCard prediction={predictions} stationName="Kanalbrua" />

      {/* Ferry countdown */}
      {ferryDepartures.length > 0 && <FerryCountdown departures={ferryDepartures} />}

      {/* Corridor stepper */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-600 mb-4 uppercase tracking-wide">
          Slik ser det ut i korridoren
        </h2>
        <CorridorStepper statuses={corridor.stations} />
      </div>

      {/* Prediction chart (collapsible) */}
      <details className="group">
        <summary className="cursor-pointer text-sm font-semibold text-slate-600 uppercase tracking-wide bg-white rounded-xl border border-slate-200 p-4 list-none flex items-center justify-between">
          I dag vs. en vanlig {dayLabel}
          <svg
            className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
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

      <TravelAdvice decision={travelDecision} />

      <BestTimeWidget
        kanalbruaResult={bestTime}
        corridorResult={corridorBestTime}
        decisionMode={travelDecision.mode}
      />

      <p className="text-xs text-slate-400 text-center">
        Dette er et smart estimat, ikke live trafikk. Anslagene bygger på historiske målinger fra
        samme ukedag og tidspunkt, justert for sesong og høytider.{" "}
        <a href="/om" className="underline">
          Slik fungerer det
        </a>
        .
      </p>
    </div>
  );
}
