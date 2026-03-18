"use client";

import type { HourlyPrediction, PredictionResult } from "@/lib/types";
import { getCongestionColor, getCongestionLabel } from "@/lib/traffic-logic";

interface PredictionCardProps {
  prediction: PredictionResult;
  stationName: string;
}

function ConfidenceBadge({ confidence }: { confidence: "high" | "medium" | "low" }) {
  const styles = {
    high: "bg-emerald-100 text-emerald-700",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-slate-100 text-slate-500",
  };
  const labels = { high: "Høy sikkerhet", medium: "Middels sikkerhet", low: "Lav sikkerhet" };
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${styles[confidence]}`}>
      {labels[confidence]}
    </span>
  );
}

function HourBar({ prediction }: { prediction: HourlyPrediction }) {
  const maxHeight = 48; // px
  const minHeight = 8;
  // Normalize: scale relative to max in the set (handled by parent)
  const height = prediction.predicted;

  const colorMap: Record<string, string> = {
    green: "bg-emerald-500",
    yellow: "bg-amber-400",
    orange: "bg-orange-500",
    red: "bg-red-500",
    unknown: "bg-slate-300",
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`w-8 rounded-t ${colorMap[prediction.congestion]}`}
        style={{ height: `${Math.max(minHeight, height)}px` }}
        title={`${prediction.predicted} kjt/t`}
      />
      <span className="text-[11px] text-slate-500 font-medium">
        {prediction.label.slice(0, 2)}
      </span>
    </div>
  );
}

export default function PredictionCard({ prediction, stationName }: PredictionCardProps) {
  const maxVol = Math.max(...prediction.predictions.map(p => p.predicted), 1);

  // Normalize heights relative to max
  const normalizedPredictions = prediction.predictions.map(p => ({
    ...p,
    predicted: Math.round((p.predicted / maxVol) * 48),
  }));

  // Average confidence
  const confidenceCounts = prediction.predictions.reduce(
    (acc, p) => { acc[p.confidence]++; return acc; },
    { high: 0, medium: 0, low: 0 } as Record<string, number>
  );
  const avgConfidence = confidenceCounts.high >= prediction.predictions.length / 2
    ? "high" as const
    : confidenceCounts.low >= prediction.predictions.length / 2
      ? "low" as const
      : "medium" as const;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
            Indikasjon neste 4 timer
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">{stationName} · Basert på historiske mønstre</p>
        </div>
        <ConfidenceBadge confidence={avgConfidence} />
      </div>

      <div className="flex items-end justify-around gap-1 h-16 mb-3">
        {normalizedPredictions.map((p) => (
          <HourBar key={p.hour} prediction={p} />
        ))}
      </div>

      <p className="text-sm text-slate-700 font-medium text-center">
        {prediction.summary}
      </p>

      {prediction.dayType !== "normal" && (
        <p className="text-xs text-amber-600 text-center mt-1">
          {prediction.dayType === "public_holiday" && "Helligdag - anslaget er mer usikkert"}
          {prediction.dayType === "pre_holiday" && "Dag før helligdag - anslaget er mer usikkert"}
          {prediction.dayType === "school_break" && "Skoleferie - trafikkmønsteret kan avvike"}
        </p>
      )}
    </div>
  );
}
