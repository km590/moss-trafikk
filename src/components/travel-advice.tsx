"use client";

import { useEffect } from "react";
import type { TravelDecision, DecisionMode } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { trackEvent } from "@/lib/plausible";

interface TravelAdviceProps {
  decision: TravelDecision;
}

function getDecisionStyles(mode: DecisionMode): {
  bg: string;
  border: string;
  iconBg: string;
  headlineColor: string;
} {
  switch (mode) {
    case "go_now":
      return {
        bg: "bg-emerald-50",
        border: "border-emerald-200",
        iconBg: "bg-emerald-500",
        headlineColor: "text-emerald-800",
      };
    case "wait":
      return {
        bg: "bg-amber-50",
        border: "border-amber-200",
        iconBg: "bg-amber-400",
        headlineColor: "text-amber-800",
      };
    case "no_clear_advantage":
      return {
        bg: "bg-slate-50",
        border: "border-slate-200",
        iconBg: "bg-slate-400",
        headlineColor: "text-slate-800",
      };
  }
}

function getIcon(mode: DecisionMode): string {
  switch (mode) {
    case "go_now":
      return "\u2713"; // checkmark
    case "wait":
      return "\u23F0"; // alarm clock
    case "no_clear_advantage":
      return "\u2194"; // left-right arrow
  }
}

function getConfidenceLabel(
  confidence: "high" | "medium" | "low",
  mode: DecisionMode
): string | null {
  if (mode === "go_now") {
    switch (confidence) {
      case "high":
        return null;
      case "medium":
        return "Ser greit ut, men uventede hendelser fanges ikke opp";
      case "low":
        return "Ser greit ut akkurat nå, men hendelser på veien kan endre bildet";
    }
  }
  switch (confidence) {
    case "high":
      return "Rimelig sikkert anslag";
    case "medium":
      return "Mer usikkert enn vanlig akkurat nå";
    case "low":
      return "Bygger mest på historisk mønster";
  }
}

export default function TravelAdvice({ decision }: TravelAdviceProps) {
  useEffect(() => {
    trackEvent("travel_advice_viewed", { mode: decision.mode });
  }, [decision.mode]);

  const styles = getDecisionStyles(decision.mode);
  const icon = getIcon(decision.mode);
  const confidenceLabel = getConfidenceLabel(decision.confidence, decision.mode);

  return (
    <Card className={`${styles.border} ${styles.bg}`}>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
          Kjøre nå eller vente?
        </p>

        <div className="flex items-start gap-3">
          <div
            className={`flex items-center justify-center w-10 h-10 rounded-full ${styles.iconBg} text-white text-lg shrink-0`}
          >
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-xl font-bold leading-snug ${styles.headlineColor}`}>
              {decision.headline}
            </p>
            {decision.detail && (
              <p className="text-sm text-muted-foreground mt-1">{decision.detail}</p>
            )}
          </div>
        </div>

        {decision.bestWindow && decision.mode === "wait" && (
          <div className="flex items-center gap-2 rounded-lg bg-white/60 px-3 py-2 border border-amber-100">
            <span className="text-lg font-bold text-amber-700">{decision.bestWindow.label}</span>
            {decision.bestWindow.expectedDeviation < 85 && (
              <span className="text-xs text-amber-600">Vesentlig roligere</span>
            )}
          </div>
        )}

        {confidenceLabel && (
          <p className="text-[10px] text-muted-foreground/60">{confidenceLabel}</p>
        )}
      </CardContent>
    </Card>
  );
}
