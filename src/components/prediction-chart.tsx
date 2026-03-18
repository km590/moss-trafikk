"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { HourlyPrediction } from "@/lib/types";

interface PredictionChartProps {
  todayPredictions: HourlyPrediction[];
  normalPattern: { hour: number; volume: number }[];
  currentHour: number;
  dayLabel: string; // e.g. "onsdag"
}

export default function PredictionChart({
  todayPredictions,
  normalPattern,
  currentHour,
  dayLabel,
}: PredictionChartProps) {
  // Build chart data: 6-22 for readable range
  const chartData = [];
  for (let hour = 6; hour <= 22; hour++) {
    const normal = normalPattern.find(n => n.hour === hour)?.volume ?? 0;
    const prediction = todayPredictions.find(p => p.hour === hour);

    chartData.push({
      hour,
      label: `${String(hour).padStart(2, "0")}:00`,
      [`Vanlig ${dayLabel}`]: normal,
      "Anslag i dag": prediction?.predicted ?? null,
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-4">
        Trafikkmønster
      </h3>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              tickLine={false}
              interval={1}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={50}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid #e2e8f0",
              }}
              formatter={(value) => [`${value} kjt/t`, undefined]}
            />
            <Area
              type="monotone"
              dataKey={`Vanlig ${dayLabel}`}
              stroke="#94a3b8"
              fill="#f1f5f9"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="Anslag i dag"
              stroke="#3b82f6"
              fill="#dbeafe"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <ReferenceLine
              x={`${String(currentHour).padStart(2, "0")}:00`}
              stroke="#ef4444"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              label={{ value: "Nå", position: "top", fontSize: 11, fill: "#ef4444" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-center gap-4 mt-2 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-4 h-0.5 bg-slate-400 inline-block" style={{ borderTop: "1.5px dashed #94a3b8" }} />
          Vanlig {dayLabel}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-4 h-0.5 bg-blue-500 inline-block" />
          Anslag i dag
        </span>
      </div>
    </div>
  );
}
