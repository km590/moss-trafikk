/**
 * Decision engine: "kjøre nå eller vente?"
 * 5 rules for contextual travel advice.
 */

import type { HourlyPredictionV2, CongestionLevel, BestTimeWindow, TravelDecision } from "./types";

// CALIBRATION constants
const MUD_VOLUME_THRESHOLD = 0.15; // 15% improvement needed
const FLAT_THRESHOLD = 0.1; // 10% spread = flat profile

const CONGESTION_ORDER: Record<CongestionLevel, number> = {
  green: 0,
  yellow: 1,
  red: 2,
  unknown: 1, // treat unknown as yellow
};

function congestionOrder(level: CongestionLevel): number {
  return CONGESTION_ORDER[level];
}

export function makeDecision(
  currentPrediction: HourlyPredictionV2,
  futurePredictions: HourlyPredictionV2[],
  currentCongestion: CongestionLevel
): TravelDecision {
  const currentVol = currentPrediction.predicted;

  if (futurePredictions.length === 0) {
    return {
      mode: "go_now",
      headline: "Det ser fint ut å kjøre nå",
      detail: null,
      confidence: currentPrediction.confidenceBucket ?? currentPrediction.confidence,
      bestWindow: null,
    };
  }

  const bestFuture = futurePredictions.reduce((min, p) => (p.predicted < min.predicted ? p : min));

  const allVols = [currentVol, ...futurePredictions.map((p) => p.predicted)];
  const maxVol = Math.max(...allVols);
  const minVol = Math.min(...allVols);
  const isFlat = maxVol > 0 && (maxVol - minVol) / maxVol < FLAT_THRESHOLD;

  const confidence = currentPrediction.confidenceBucket ?? currentPrediction.confidence;

  // Rule 1: Green now = never recommend waiting
  if (currentCongestion === "green") {
    return {
      mode: "go_now",
      headline: "Det ser fint ut å kjøre nå",
      detail: isFlat ? "Ingen tydelig gevinst i å vente" : null,
      confidence,
      bestWindow: null,
    };
  }

  // Rule 4: Flat profile (yellow/red, but even)
  if (isFlat) {
    return {
      mode: "no_clear_advantage",
      headline: "Det ser fint ut å kjøre nå",
      detail: "Ingen tydelig gevinst i å vente",
      confidence,
      bestWindow: null,
    };
  }

  // Rule 2: MUD check (now is yellow or red)
  const improvement = currentVol > 0 ? (currentVol - bestFuture.predicted) / currentVol : 0;
  const bestFutureCongestion = bestFuture.congestion;
  const meetsLevelMUD = congestionOrder(bestFutureCongestion) < congestionOrder(currentCongestion);
  const meetsAbsMUD = improvement >= MUD_VOLUME_THRESHOLD;

  if (!meetsLevelMUD && !meetsAbsMUD) {
    return {
      mode: "no_clear_advantage",
      headline: "Det ser fint ut å kjøre nå",
      detail: "Ingen tydelig gevinst i å vente",
      confidence,
      bestWindow: null,
    };
  }

  // Rule 3 + 5: Recommend waiting, damped by uncertainty
  const isUncertain = confidence === "low";
  const headline = isUncertain ? "Det kan lønne seg å vente litt" : "Vent litt hvis du kan";
  const hourLabel = bestFuture.label.slice(0, 2);
  const detail = `Roligere fra ca. kl. ${hourLabel}`;

  const bestWindow: BestTimeWindow = {
    startHour: bestFuture.hour,
    endHour: (bestFuture.hour + 1) % 24,
    expectedDeviation: currentVol > 0 ? Math.round((bestFuture.predicted / currentVol) * 100) : 100,
    label: `${bestFuture.label.slice(0, 5)} - ${String((bestFuture.hour + 1) % 24).padStart(2, "0")}:00`,
    reason: meetsLevelMUD ? "Lavere belastningsnivå" : "Vesentlig lavere trafikk",
  };

  return {
    mode: "wait",
    headline,
    detail,
    confidence,
    bestWindow,
  };
}
