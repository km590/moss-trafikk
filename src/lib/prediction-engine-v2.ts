/**
 * V2 prediction engine: baseline + LightGBM residual correction.
 * Feature-flagged via PREDICTION_MODEL env var.
 *
 * Residual policy (PREDICTION_RESIDUAL_POLICY):
 *   "off"         - baseline-only, no residual applied
 *   "time_window" - baseline-only 07-17, v2 residual 18-06 (DEFAULT)
 *   "full"        - residual always applied (original v2 behavior)
 */

import { predictVolume, classifyPredictedCongestion } from "./prediction-engine";
import { predictResidual, type ResidualModel } from "./tree-walker";
import { buildFeatures, type StationLiveData, type SignalHourlyData } from "./feature-builder";
import { LAG_MASK_HOURS } from "./constants";
import type { HourlyPredictionV2, CongestionLevel } from "./types";

// --- Residual gating policy ---
type ResidualPolicy = "off" | "time_window" | "full";

const RESIDUAL_POLICY: ResidualPolicy =
  (process.env.PREDICTION_RESIDUAL_POLICY as ResidualPolicy) ?? "time_window";

function shouldApplyResidual(hour: number): boolean {
  if (RESIDUAL_POLICY === "off") return false;
  if (RESIDUAL_POLICY === "full") return true;
  // time_window: baseline-only 07-17, v2 18-06
  return hour < 7 || hour >= 18;
}

// Try to load residual model - may not exist yet
let residualModel: ResidualModel | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  residualModel = require("../data/residual-model.json") as ResidualModel;
  console.log(
    `[v2] residual model loaded: v${residualModel.version}, ${residualModel.features.length} features, trained ${residualModel.trainedAt.slice(0, 10)}`
  );
} catch (e) {
  console.warn(
    "[v2] Failed to load residual model, falling back to v1:",
    e instanceof Error ? e.message : e
  );
}

export function isV2Enabled(): boolean {
  return process.env.PREDICTION_MODEL === "v2" && residualModel !== null;
}

export type V2Status = "v2_active" | "v2_fallback_to_v1" | "v2_disabled";

export function getV2Status(): V2Status {
  if (process.env.PREDICTION_MODEL !== "v2") return "v2_disabled";
  if (residualModel === null) return "v2_fallback_to_v1";
  return "v2_active";
}

export function getV2Predictions(
  stationId: string,
  date: Date,
  currentHour: number,
  hoursAhead: number,
  latestVolumes: Map<string, StationLiveData>,
  signalHourly?: SignalHourlyData
): HourlyPredictionV2[] {
  const predictions: HourlyPredictionV2[] = [];

  for (let i = 0; i < hoursAhead; i++) {
    const effectiveDate = new Date(date);
    effectiveDate.setHours(date.getHours() + i);
    const hour = effectiveDate.getHours();
    const effectiveDow = effectiveDate.getDay();

    // Step 1: Baseline prediction
    const baseline = predictVolume(stationId, effectiveDate, hour);

    // Step 2: Check if station has residual model
    const hasResidual = residualModel?.stationsWithResidual.includes(stationId) ?? false;

    if (!hasResidual || !residualModel) {
      // V1 fallback
      const congestion = classifyPredictedCongestion(
        baseline.predicted,
        stationId,
        effectiveDow,
        hour
      );
      predictions.push({
        hour,
        predicted: baseline.predicted,
        predictedLow: baseline.predicted,
        predictedHigh: baseline.predicted,
        residual: 0,
        congestion,
        confidence: baseline.confidence,
        label: `${String(hour).padStart(2, "0")}:00`,
        modelVersion: "v1",
        confidenceBucket: baseline.confidence,
      });
      continue;
    }

    // Step 3: Check residual policy
    const applyResidual = shouldApplyResidual(hour);

    if (!applyResidual) {
      // Baseline-only: gated by time-window policy
      const congestion = classifyPredictedCongestion(
        baseline.predicted,
        stationId,
        effectiveDow,
        hour
      );

      // Still compute raw residual for diagnostics logging
      const features = buildFeatures(
        stationId,
        baseline.predicted,
        effectiveDate,
        hour,
        latestVolumes,
        residualModel,
        signalHourly
      );
      const rawResidual = predictResidual(residualModel, features);

      console.log(
        `[v2] ${stationId} h=${hour}: GATED baseline=${baseline.predicted} (raw_residual=${rawResidual.p50.toFixed(0)}, policy=${RESIDUAL_POLICY})`
      );

      predictions.push({
        hour,
        predicted: baseline.predicted,
        predictedLow: baseline.predicted,
        predictedHigh: baseline.predicted,
        residual: 0,
        residualRaw: rawResidual.p50,
        finalPolicy: "baseline_only",
        congestion,
        confidence: baseline.confidence,
        label: `${String(hour).padStart(2, "0")}:00`,
        modelVersion: "v2",
        confidenceBucket: baseline.confidence,
      });
      continue;
    }

    // Step 4: Build features
    const features = buildFeatures(
      stationId,
      baseline.predicted,
      effectiveDate,
      hour,
      latestVolumes,
      residualModel,
      signalHourly
    );

    // Step 5: Predict residual
    const residual = predictResidual(residualModel, features);

    // Step 6: Final predictions
    const predicted = Math.max(0, Math.round(baseline.predicted + residual.p50));
    const predictedLow = Math.max(0, Math.round(baseline.predicted + residual.p10));
    const predictedHigh = Math.round(baseline.predicted + residual.p90);

    // Step 7: Confidence from band width
    const bandWidth = predictedHigh - predictedLow;
    const bandPercent = predicted > 0 ? (bandWidth / predicted) * 100 : 100;
    const confidenceBucket: "high" | "medium" | "low" =
      bandPercent < 30
        ? "high" // CALIBRATION
        : bandPercent < 60
          ? "medium" // CALIBRATION
          : "low";

    // Step 8: Uncertainty-informed congestion classification
    // Green only if predictedHigh is also green
    // Red only if predictedLow is also red
    const congestionP50 = classifyPredictedCongestion(predicted, stationId, effectiveDow, hour);
    const congestionHigh = classifyPredictedCongestion(predictedHigh, stationId, effectiveDow, hour);
    const congestionLow = classifyPredictedCongestion(predictedLow, stationId, effectiveDow, hour);

    let congestion: CongestionLevel;
    if (congestionP50 === "green" && congestionHigh === "green") {
      congestion = "green";
    } else if (congestionP50 === "red" && congestionLow === "red") {
      congestion = "red";
    } else if (congestionP50 === "red" || congestionHigh === "red") {
      congestion = "yellow"; // band spans red boundary
    } else {
      congestion = congestionP50;
    }

    // Step 9: Generate explanation
    const explanation = generateExplanation(residual.p50, features, baseline.predicted);

    // Log v1 vs v2 difference
    console.log(
      `[v2] ${stationId} h=${hour}: baseline=${baseline.predicted} v2=${predicted} residual=${residual.p50.toFixed(1)} band=[${predictedLow},${predictedHigh}] policy=v2_residual`
    );

    predictions.push({
      hour,
      predicted,
      predictedLow,
      predictedHigh,
      residual: residual.p50,
      residualRaw: residual.p50,
      finalPolicy: "v2_residual",
      congestion,
      confidence: confidenceBucket,
      label: `${String(hour).padStart(2, "0")}:00`,
      modelVersion: "v2",
      explanation,
      confidenceBucket,
    });
  }

  return predictions;
}

// Phase 5: Explanation layer
function generateExplanation(
  residual: number,
  features: Record<string, number>,
  baseline: number
): string | undefined {
  // CALIBRATION: < 5% residual = no explanation needed
  if (Math.abs(residual) < baseline * 0.05) return undefined;

  if (features.freshness > LAG_MASK_HOURS) {
    const hours = Math.round(features.freshness);
    return `Bygger mest på historisk mønster (data er ${hours} timer gammelt)`;
  }
  if (features.is_rush === 1 && residual > 0) {
    return "Typisk rushtidstrykk gir mer enn vanlig";
  }
  if (features.centrum_pressure > 0 && features.centrum_pressure > baseline * 0.8) {
    return "Høyt trykk i sentrum";
  }
  if (residual < -baseline * 0.1) {
    return "Ser roligere ut enn vanlig for denne tiden";
  }
  if (features.is_evening === 1 && residual < 0) {
    return "Kveldstrafikken avtar";
  }

  return undefined;
}
