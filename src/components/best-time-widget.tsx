"use client";

import { useState, useEffect } from "react";
import type { BestTimeResult, DecisionMode } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { trackEvent } from "@/lib/plausible";

interface BestTimeWidgetProps {
  kanalbruaResult: BestTimeResult;
  corridorResult: BestTimeResult;
  decisionMode: DecisionMode;
}

export default function BestTimeWidget({ kanalbruaResult, corridorResult, decisionMode }: BestTimeWidgetProps) {
  const [mode, setMode] = useState<"kanalbrua" | "corridor">("kanalbrua");

  useEffect(() => {
    trackEvent("best_time_state", { state: decisionMode === "wait" ? "showing" : "hidden" });
  }, [decisionMode]);
  const result = mode === "kanalbrua" ? kanalbruaResult : corridorResult;
  const { primary, backup } = result;

  // When decision layer says go_now or no_clear_advantage,
  // don't show a later time as recommendation (avoids double messaging)
  const showTimeRecommendation = decisionMode === "wait";

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            De neste timene
          </p>
          <div className="flex rounded-full bg-slate-100 p-0.5 text-xs">
            <button
              onClick={() => setMode("kanalbrua")}
              className={`rounded-full px-4 py-2.5 transition-colors ${
                mode === "kanalbrua"
                  ? "bg-slate-800 text-white"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              Kanalbrua
            </button>
            <button
              onClick={() => setMode("corridor")}
              className={`rounded-full px-4 py-2.5 transition-colors ${
                mode === "corridor"
                  ? "bg-slate-800 text-white"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              Hele korridoren
            </button>
          </div>
        </div>

        {showTimeRecommendation ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-emerald-600">{primary.label}</span>
            </div>

            {primary.expectedDeviation > 0 && primary.expectedDeviation < 100 && (
              <p className="text-sm text-muted-foreground">
                {primary.expectedDeviation < 80
                  ? "Vesentlig roligere enn nå"
                  : primary.expectedDeviation < 95
                  ? "Roligere enn nå"
                  : "Omtrent som nå"}
              </p>
            )}

            {backup && (
              <p className="text-sm text-muted-foreground">
                Alternativ: <span className="font-medium">{backup.label}</span>
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Det ser greit ut de neste timene. Ingen tydelig gevinst i å vente.
          </p>
        )}

        <p className="text-xs italic text-muted-foreground">{primary.reason}</p>
        <p className="text-[10px] text-muted-foreground/60 pt-1">
          Basert på historiske mønstre, ikke sanntidsdata
        </p>
      </CardContent>
    </Card>
  );
}
