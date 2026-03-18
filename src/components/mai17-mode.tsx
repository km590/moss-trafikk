"use client";

import { useState } from "react";
import type { HourlyPrediction } from "@/lib/types";
import { getCongestionColor } from "@/lib/traffic-logic";

interface Mai17ModeProps {
  normalDay: HourlyPrediction[];
  may17Day: HourlyPrediction[];
  autoActivated: boolean;
  stationName: string;
}

export default function Mai17Mode({ normalDay, may17Day, autoActivated, stationName }: Mai17ModeProps) {
  const [isOpen, setIsOpen] = useState(autoActivated);

  if (!autoActivated && !isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-full bg-white rounded-xl border border-slate-200 p-4 text-left hover:border-red-300 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
              17. mai-modus
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Anslag basert på tidligere 17. mai-data</p>
          </div>
          <span className="text-lg">🇳🇴</span>
        </div>
      </button>
    );
  }

  const peakNormal = Math.max(...normalDay.map(p => p.predicted), 1);
  const peak17Mai = Math.max(...may17Day.map(p => p.predicted), 1);
  const peakMax = Math.max(peakNormal, peak17Mai);

  const barHeight = (vol: number) => Math.max(4, Math.round((vol / peakMax) * 40));

  return (
    <div className="bg-white rounded-xl border border-red-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-red-700 uppercase tracking-wide flex items-center gap-2">
            17. mai-modus
            <span className="text-lg">🇳🇴</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">{stationName}</p>
        </div>
        {!autoActivated && (
          <button
            onClick={() => setIsOpen(false)}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            Lukk
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2 text-center">Vanlig dag</p>
          <div className="flex items-end justify-around gap-0.5 h-12">
            {normalDay.filter(p => p.hour >= 7 && p.hour <= 20).map(p => (
              <div key={p.hour} className="flex flex-col items-center">
                <div
                  className={`w-2.5 rounded-t ${getCongestionColor(p.congestion)}`}
                  style={{ height: `${barHeight(p.predicted)}px` }}
                  title={`${p.label}: ${p.predicted} kjt/t`}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[9px] text-slate-400 mt-1 px-0.5">
            <span>07</span><span>14</span><span>20</span>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-red-600 mb-2 text-center">17. mai</p>
          <div className="flex items-end justify-around gap-0.5 h-12">
            {may17Day.filter(p => p.hour >= 7 && p.hour <= 20).map(p => (
              <div key={p.hour} className="flex flex-col items-center">
                <div
                  className={`w-2.5 rounded-t ${getCongestionColor(p.congestion)}`}
                  style={{ height: `${barHeight(p.predicted)}px` }}
                  title={`${p.label}: ${p.predicted} kjt/t`}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[9px] text-slate-400 mt-1 px-0.5">
            <span>07</span><span>14</span><span>20</span>
          </div>
        </div>
      </div>

      <div className="bg-red-50 rounded-lg px-3 py-2">
        <p className="text-xs text-red-700">
          {peak17Mai > peakNormal * 1.2
            ? `Anslagsvis ${Math.round(((peak17Mai / peakNormal) - 1) * 100)}% mer trafikk enn vanlig i rushtiden.`
            : peak17Mai < peakNormal * 0.8
              ? `Anslagsvis ${Math.round((1 - (peak17Mai / peakNormal)) * 100)}% mindre trafikk enn vanlig.`
              : "Trafikken er trolig omtrent som en vanlig dag."}
          {" "}Mønsteret er annerledes: toppene flytter seg. Basert på begrenset historikk.
        </p>
      </div>
    </div>
  );
}
