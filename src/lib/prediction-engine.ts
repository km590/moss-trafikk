import type {
  ModelWeights,
  HourlyPrediction,
  PredictionResult,
  CongestionLevel,
  FerryBoost,
} from "./types";
import { classifyDate, shouldAutoActivateMay17 } from "./norwegian-calendar";
import { getStationVulnerability } from "./stations";
import modelWeightsData from "../data/model-weights.json";

const weights = modelWeightsData as ModelWeights;

// --- Logging ---
function logPredictionEvent(event: string, detail: Record<string, unknown>): void {
  if (typeof console !== "undefined") {
    console.log(`[prediction] ${event}`, JSON.stringify(detail));
  }
}

// --- Guardrails ---
// Absolute floor/ceiling per prediction to prevent absurd outputs
const MIN_PREDICTION = 0;
const MAX_PREDICTION = 3000; // No Norwegian road station exceeds this per hour
const MIN_SAMPLES_FOR_PREDICTION = 3; // Below this, degrade to "insufficient data"
const MAX_HOUR_TO_HOUR_RATIO = 3.0; // Adjacent hours shouldn't differ by more than 3x

/**
 * Clamp a prediction to historically plausible bounds.
 * Uses p25/p75 from base pattern as soft bounds, absolute min/max as hard bounds.
 */
function clampPrediction(raw: number, base: { p25: number; p75: number } | undefined): number {
  if (raw <= MIN_PREDICTION) return MIN_PREDICTION;
  if (raw > MAX_PREDICTION) return MAX_PREDICTION;
  // Soft clamp: allow up to 2x the p75 (seasonal peaks can legitimately exceed IQR)
  if (base && raw > base.p75 * 2) return Math.round(base.p75 * 2);
  return raw;
}

/**
 * Check if a station has sufficient data coverage for predictions.
 */
export function hasAdequateCoverage(stationId: string): boolean {
  const stationData = weights.basePatterns[stationId];
  if (!stationData) {
    logPredictionEvent("coverage_fail", { stationId, reason: "no_data" });
    return false;
  }
  let daysWithData = 0;
  for (const dow of Object.keys(stationData)) {
    const hours = Object.keys(stationData[parseInt(dow)]);
    if (hours.length >= 12) daysWithData++;
  }
  if (daysWithData < 3) {
    logPredictionEvent("coverage_fail", { stationId, daysWithData });
    return false;
  }
  return true;
}

/**
 * Resolve the best available day-of-week for a station.
 * Vegvesen API has no Monday/Tuesday data for most stations.
 * Falls back to Wednesday (closest weekday with data) when needed.
 */
function resolveDayOfWeek(
  stationId: string,
  dayOfWeek: number,
  hour: number
): { dow: number; isProxy: boolean } {
  const base = weights.basePatterns[stationId]?.[dayOfWeek]?.[hour];
  if (base && base.sampleCount >= MIN_SAMPLES_FOR_PREDICTION) {
    return { dow: dayOfWeek, isProxy: false };
  }
  // Monday (1) or Tuesday (2) with no data: use Wednesday (3) as proxy
  if (dayOfWeek === 1 || dayOfWeek === 2) {
    const wedBase = weights.basePatterns[stationId]?.[3]?.[hour];
    if (wedBase && wedBase.sampleCount >= MIN_SAMPLES_FOR_PREDICTION) {
      logPredictionEvent("proxy_fallback", {
        stationId,
        originalDow: dayOfWeek,
        proxyDow: 3,
        hour,
      });
      return { dow: 3, isProxy: true };
    }
  }
  return { dow: dayOfWeek, isProxy: false };
}

/**
 * Predict traffic volume for a specific station, day, and hour.
 * Uses multiplicative decomposition: base[dow][hour] * monthFactor * holidayFactor
 * Includes guardrails: clamping, minimum sample threshold, coverage check.
 * Falls back to Wednesday proxy for Monday/Tuesday when data is missing.
 */
export function predictVolume(
  stationId: string,
  date: Date,
  hour: number
): {
  predicted: number;
  confidence: "high" | "medium" | "low";
  sampleCount: number;
  insufficientData: boolean;
} {
  const originalDow = date.getDay();
  const month = date.getMonth();
  const dayType = classifyDate(date);

  const { dow: dayOfWeek, isProxy } = resolveDayOfWeek(stationId, originalDow, hour);

  const base = weights.basePatterns[stationId]?.[dayOfWeek]?.[hour];
  if (!base) {
    logPredictionEvent("no_base_pattern", { stationId, dayOfWeek, hour });
    return { predicted: 0, confidence: "low", sampleCount: 0, insufficientData: true };
  }

  // Guardrail: minimum sample threshold
  if (base.sampleCount < MIN_SAMPLES_FOR_PREDICTION) {
    logPredictionEvent("insufficient_samples", {
      stationId,
      dayOfWeek,
      hour,
      sampleCount: base.sampleCount,
    });
    return {
      predicted: base.median,
      confidence: "low",
      sampleCount: base.sampleCount,
      insufficientData: true,
    };
  }

  const monthFactor = weights.monthFactors[month] ?? 1.0;
  const holidayFactor = dayType !== "normal" ? (weights.holidayFactors[dayType] ?? 1.0) : 1.0;

  const rawPredicted = Math.round(base.median * monthFactor * holidayFactor);
  const predicted = clampPrediction(rawPredicted, base);

  // Confidence based on sample count AND spread (IQR)
  const iqr = base.p75 - base.p25;
  const relativeSpread = base.median > 0 ? iqr / base.median : 1;

  let confidence: "high" | "medium" | "low";
  if (base.sampleCount >= 6 && relativeSpread < 0.4) {
    confidence = "high";
  } else if (base.sampleCount >= 3 && relativeSpread < 0.7) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  // Holidays always reduce confidence (small sample size in training)
  if (dayType !== "normal" && confidence === "high") {
    confidence = "medium";
  }

  // Proxy days (Mon/Tue using Wed data) cap at medium confidence
  if (isProxy && confidence === "high") {
    confidence = "medium";
  }

  return { predicted, confidence, sampleCount: base.sampleCount, insufficientData: false };
}

/**
 * Predict May 17 volume using Wednesday base pattern + May month factor + holiday factor.
 * Avoids day-of-week data gaps by always using Wednesday (most data-rich day).
 */
function predictMay17Volume(
  stationId: string,
  hour: number
): { predicted: number; confidence: "high" | "medium" | "low"; sampleCount: number } {
  const wedBase = weights.basePatterns[stationId]?.[3]?.[hour]; // Wednesday = 3
  if (!wedBase) return { predicted: 0, confidence: "low", sampleCount: 0 };

  const mayFactor = weights.monthFactors[4] ?? 1.0; // May = 4
  const holidayFactor = weights.holidayFactors.public_holiday ?? 1.0;
  const predicted = Math.round(wedBase.median * mayFactor * holidayFactor);

  // Always low-medium confidence for holidays
  return { predicted, confidence: "medium", sampleCount: wedBase.sampleCount };
}

// --- Estimated congestion thresholds (CALIBRATION V1) ---
// Stricter than measured: estimates carry more uncertainty
const EST_RUSH_HOURS = [7, 8, 15, 16, 17]; // CALIBRATION

/**
 * Classify predicted congestion using 3 independent signals (stricter than measured).
 *
 * Signal 1: Absolute level - predicted volume vs station thresholds
 * Signal 2: Relative position - predicted vs p60/p85 of station's daily profile
 * Signal 3: Station/time friction - predicted * friction vs thresholds
 *
 * Red: ALL 3 signals must be true (damped hours: all 3 + absolute > redAbsolute * 1.1)
 * Yellow: 2 of 3 signals (measured needs only 1)
 * Green: 0-1 signals
 */
export function classifyPredictedCongestion(
  predicted: number,
  stationId: string,
  dayOfWeek: number,
  hour: number
): CongestionLevel {
  if (predicted < 10) return "green";

  const vuln = getStationVulnerability(stationId);

  // --- Signal 1: Absolute level ---
  const absYellow = predicted >= vuln.yellowAbsolute;
  const absRed = predicted >= vuln.redAbsolute;

  // --- Signal 2: Relative position (p60/p85 instead of deviation) ---
  const dayData = weights.basePatterns[stationId]?.[dayOfWeek];
  let relYellow = false;
  let relRed = false;
  if (dayData) {
    const medians: number[] = [];
    for (const h of Object.keys(dayData)) {
      const med = dayData[parseInt(h)]?.median;
      if (med !== undefined && med > 0) medians.push(med);
    }
    if (medians.length >= 4) {
      medians.sort((a, b) => a - b);
      const p60 = medians[Math.floor(medians.length * 0.6)]; // CALIBRATION
      const p85 = medians[Math.floor(medians.length * 0.85)]; // CALIBRATION
      relYellow = predicted >= p60;
      relRed = predicted >= p85;
    }
  }

  // --- Signal 3: Station/time friction ---
  const isRush = EST_RUSH_HOURS.includes(hour);
  const timeFactor = isRush ? 1.2 : vuln.dampedHours.includes(hour) ? 0.7 : 1.0; // CALIBRATION
  const effectiveFriction = vuln.friction * timeFactor;
  const frictionYellow = predicted * effectiveFriction >= vuln.yellowAbsolute;
  const frictionRed = predicted * effectiveFriction >= vuln.redAbsolute;

  // --- Count signals ---
  const yellowSignals = [absYellow, relYellow, frictionYellow].filter(Boolean).length;
  const redSignals = [absRed, relRed, frictionRed].filter(Boolean).length;

  const isDamped = vuln.dampedHours.includes(hour);

  // --- Red: all 3 signals required (damped: all 3 + absolute > redAbsolute * 1.1) ---
  if (redSignals >= 3) {
    if (isDamped) {
      // Damped hours: red still possible but needs extra absolute headroom
      if (predicted >= vuln.redAbsolute * 1.1) {
        // CALIBRATION
        return "red";
      }
      // Fall through to yellow
    } else {
      return "red";
    }
  }

  // --- Yellow: 2 of 3 signals ---
  if (yellowSignals >= 2) {
    return "yellow";
  }

  return "green";
}

/**
 * Get predictions for a station for the next N hours.
 * Returns 4 hours for UI display, calculates up to 24 for best-time.
 * Includes adjacent-hour smoothing guardrail.
 *
 * Ferry signal is an optional separate adjustment layer:
 * - Only applied to the current hour (real-time signal, not forecast)
 * - Baseline predictions remain untouched for future hours
 * - Can be disabled by omitting ferrySignal parameter
 */
export function getPredictions(
  stationId: string,
  date: Date,
  currentHour: number,
  hoursAhead: number = 4,
  ferrySignal?: { factor: number; nextDepartureMin: number | null; reason: string }
): PredictionResult {
  const dayOfWeek = date.getDay();
  const dayType = classifyDate(date);
  const rawPredictions: {
    hour: number;
    predicted: number;
    confidence: "high" | "medium" | "low";
    insufficientData: boolean;
  }[] = [];

  for (let i = 0; i < hoursAhead; i++) {
    const hour = (currentHour + i) % 24;
    const result = predictVolume(stationId, date, hour);

    // Ferry boost: only apply to current hour (i === 0)
    // Future hours use pure baseline - ferry schedule changes too fast to forecast
    if (i === 0 && ferrySignal && ferrySignal.factor > 1.0) {
      const boosted = Math.round(result.predicted * ferrySignal.factor);
      const clamped = clampPrediction(
        boosted,
        weights.basePatterns[stationId]?.[dayOfWeek]?.[hour]
      );
      logPredictionEvent("ferry_boost", {
        stationId,
        hour,
        baseline: result.predicted,
        boosted: clamped,
        factor: ferrySignal.factor,
        reason: ferrySignal.reason,
      });
      rawPredictions.push({
        hour,
        predicted: clamped,
        confidence: result.confidence,
        insufficientData: result.insufficientData,
      });
    } else {
      rawPredictions.push({ hour, ...result });
    }
  }

  // Guardrail: smooth adjacent-hour jumps exceeding MAX_HOUR_TO_HOUR_RATIO
  for (let i = 1; i < rawPredictions.length; i++) {
    const prev = rawPredictions[i - 1].predicted;
    const curr = rawPredictions[i].predicted;
    if (prev > 0 && curr > 0) {
      const ratio = curr / prev;
      if (ratio > MAX_HOUR_TO_HOUR_RATIO) {
        rawPredictions[i].predicted = Math.round(prev * MAX_HOUR_TO_HOUR_RATIO);
      } else if (ratio < 1 / MAX_HOUR_TO_HOUR_RATIO) {
        rawPredictions[i].predicted = Math.round(prev / MAX_HOUR_TO_HOUR_RATIO);
      }
    }
  }

  const predictions: HourlyPrediction[] = rawPredictions.map(
    ({ hour, predicted, confidence, insufficientData }) => {
      const congestion = classifyPredictedCongestion(predicted, stationId, dayOfWeek, hour);
      const finalConfidence = insufficientData ? "low" : confidence;

      return {
        hour,
        predicted,
        congestion,
        confidence: finalConfidence,
        label: `${String(hour).padStart(2, "0")}:00`,
      };
    }
  );

  // Find peak and quietest within 4-hour window
  const fourHour = predictions.slice(0, Math.min(4, predictions.length));
  const peakHour = fourHour.reduce(
    (max, p) => (p.predicted > max.predicted ? p : max),
    fourHour[0]
  ).hour;
  const quietestHour = fourHour.reduce(
    (min, p) => (p.predicted < min.predicted ? p : min),
    fourHour[0]
  ).hour;

  const peakLabel = `${String(peakHour).padStart(2, "0")}`;
  const quietLabel = `${String(quietestHour).padStart(2, "0")}`;

  const peakVol = fourHour.find((p) => p.hour === peakHour)?.predicted ?? 0;
  const quietVol = fourHour.find((p) => p.hour === quietestHour)?.predicted ?? 0;

  let summary: string;
  if (peakVol - quietVol < 50) {
    summary = "Jevn trafikk de neste timene";
  } else {
    summary = `Mest trafikk rundt kl. ${peakLabel}. Det ser roligere ut fra kl. ${quietLabel}.`;
  }

  // Ferry boost metadata
  const ferry: FerryBoost =
    ferrySignal && ferrySignal.factor > 1.0
      ? {
          active: true,
          factor: ferrySignal.factor,
          nextDepartureMin: ferrySignal.nextDepartureMin,
          reason: ferrySignal.reason,
        }
      : { active: false, factor: 1.0, nextDepartureMin: null, reason: "no_ferry_signal" };

  return {
    stationId,
    predictions,
    peakHour,
    quietestHour,
    summary,
    dayType,
    ferry,
  };
}

/**
 * Get the model's normal volume for a station/day/hour.
 * Replaces averages.json as the source of truth.
 */
export function getModelNormalVolume(stationId: string, dayOfWeek: number, hour: number): number {
  return weights.basePatterns[stationId]?.[dayOfWeek]?.[hour]?.median ?? 0;
}

/**
 * Check if May 17 mode should be active.
 */
export function isMay17ModeActive(date: Date): boolean {
  return shouldAutoActivateMay17(date);
}

/**
 * Get May 17 comparison data: normal day vs May 17 prediction.
 */
export function getMay17Comparison(
  stationId: string,
  year: number
): { normalDay: HourlyPrediction[]; may17Day: HourlyPrediction[] } {
  // Find a Wednesday in May for "normal day" reference (Wednesday = day 3, always has data)
  const normalDate = new Date(year, 4, 1);
  while (normalDate.getDay() !== 3) normalDate.setDate(normalDate.getDate() + 1);

  // For May 17 prediction: use Wednesday base pattern with holiday factor applied
  // This avoids the issue of May 17 falling on a day-of-week with sparse data
  const normalDay: HourlyPrediction[] = [];
  const may17Day: HourlyPrediction[] = [];

  for (let hour = 6; hour <= 22; hour++) {
    const normalPred = predictVolume(stationId, normalDate, hour);
    const may17Pred = predictMay17Volume(stationId, hour);
    const wedDow = normalDate.getDay();

    normalDay.push({
      hour,
      predicted: normalPred.predicted,
      congestion: classifyPredictedCongestion(normalPred.predicted, stationId, wedDow, hour),
      confidence: normalPred.confidence,
      label: `${String(hour).padStart(2, "0")}:00`,
    });

    may17Day.push({
      hour,
      predicted: may17Pred.predicted,
      congestion: classifyPredictedCongestion(may17Pred.predicted, stationId, wedDow, hour),
      confidence: may17Pred.confidence,
      label: `${String(hour).padStart(2, "0")}:00`,
    });
  }

  return { normalDay, may17Day };
}
