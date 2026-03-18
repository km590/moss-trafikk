"use client";

import { useState, useEffect } from "react";

interface FerryCountdownProps {
  departures: { time: string; destination: string; minutesUntil: number }[];
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Nå";
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${String(sec).padStart(2, "0")}s`;
}

export default function FerryCountdown({ departures }: FerryCountdownProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Find the next departure that hasn't passed
  const next = departures
    .map(d => ({ ...d, ms: new Date(d.time).getTime() - now }))
    .find(d => d.ms > 0);

  const upcoming = departures
    .map(d => ({ ...d, ms: new Date(d.time).getTime() - now }))
    .filter(d => d.ms > 0)
    .slice(1, 3);

  if (!next) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
          Neste ferge
        </h3>
        <span className="text-xs text-slate-400">Moss - Horten</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-3xl font-bold text-slate-900 tabular-nums">
          {formatCountdown(next.ms)}
        </div>
        <div className="text-sm text-slate-500">
          kl {new Date(next.time).toLocaleTimeString("no-NO", {
            timeZone: "Europe/Oslo",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>

      {upcoming.length > 0 && (
        <div className="flex gap-3 mt-2 text-xs text-slate-400">
          {upcoming.map((d, i) => (
            <span key={i}>
              Deretter {new Date(d.time).toLocaleTimeString("no-NO", {
                timeZone: "Europe/Oslo",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          ))}
        </div>
      )}

      <p className="text-[11px] text-slate-400 mt-2">
        Fergeavgangene kan påvirke trafikken rundt sentrum og Rv19.
      </p>
    </div>
  );
}
