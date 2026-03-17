"use client";

import { useState } from "react";
import { BestTimeResult } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";

interface BestTimeWidgetProps {
  kanalbruaResult: BestTimeResult;
  corridorResult: BestTimeResult;
}

export default function BestTimeWidget({ kanalbruaResult, corridorResult }: BestTimeWidgetProps) {
  const [mode, setMode] = useState<"kanalbrua" | "corridor">("kanalbrua");
  const result = mode === "kanalbrua" ? kanalbruaResult : corridorResult;
  const { primary, backup } = result;

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            Beste tidspunkt
          </p>
          <div className="flex rounded-full bg-slate-100 p-0.5 text-xs">
            <button
              onClick={() => setMode("kanalbrua")}
              className={`rounded-full px-3 py-1 transition-colors ${
                mode === "kanalbrua"
                  ? "bg-slate-800 text-white"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              Kanalbrua
            </button>
            <button
              onClick={() => setMode("corridor")}
              className={`rounded-full px-3 py-1 transition-colors ${
                mode === "corridor"
                  ? "bg-slate-800 text-white"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              Hele korridoren
            </button>
          </div>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-emerald-600">{primary.label}</span>
        </div>

        {primary.expectedDeviation > 0 && primary.expectedDeviation < 100 && (
          <p className="text-sm text-muted-foreground">
            ~{primary.expectedDeviation}% av trafikken nå
          </p>
        )}

        {backup && (
          <p className="text-sm text-muted-foreground">
            Alternativ: <span className="font-medium">{backup.label}</span>
          </p>
        )}

        <p className="text-xs italic text-muted-foreground">{primary.reason}</p>
      </CardContent>
    </Card>
  );
}
