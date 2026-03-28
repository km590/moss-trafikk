import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { predictVolume } from "@/lib/prediction-engine";
import { predictResidual } from "@/lib/tree-walker";
import { buildFeatures } from "@/lib/feature-builder";
import { getFerrySignal, isFerryAffectedStation } from "@/lib/ferry-signal";
import { classifyDate } from "@/lib/norwegian-calendar";
import { getNorwayTime } from "@/lib/traffic-logic";
import { getV2Status } from "@/lib/prediction-engine-v2";
import { KANALBRUA_ID, RV19_STATION_IDS } from "@/lib/stations";

// Stations to track: Kanalbrua + RV19 stations with confirmed data availability
// Excluded: 39666V971386 (Østre Kanalgate) and 76208V971383 (Mosseelva) - 0 edges from Vegvesen API
const EVAL_STATIONS = [
  KANALBRUA_ID,
  "72867V971385", // Rådhusbrua
  "69994V971384", // Vogts gate
];

// Mirror residual policy from prediction-engine-v2
type ResidualPolicy = "off" | "time_window" | "full";
const RESIDUAL_POLICY: ResidualPolicy =
  (process.env.PREDICTION_RESIDUAL_POLICY as ResidualPolicy) ?? "time_window";

function shouldApplyResidual(hour: number): boolean {
  if (RESIDUAL_POLICY === "off") return false;
  if (RESIDUAL_POLICY === "full") return true;
  return hour < 7 || hour >= 18;
}

// Try to load residual model for raw residual logging
let residualModel: import("@/lib/tree-walker").ResidualModel | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  residualModel = require("@/data/residual-model.json");
} catch {
  // Model not available
}

/**
 * GET /api/admin/eval/snapshot
 * Vercel cron entry point. Authenticated via CRON_SECRET.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return runSnapshot();
}

/**
 * POST /api/admin/eval/snapshot
 * Manual trigger. Authenticated via ADMIN_API_KEY.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expectedKey = process.env.ADMIN_API_KEY?.trim();
  if (expectedKey && authHeader !== `Bearer ${expectedKey}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return runSnapshot();
}

async function runSnapshot() {
  if (!supabase) {
    return NextResponse.json({ error: "supabase not configured" }, { status: 503 });
  }

  const now = new Date();
  const { hour } = getNorwayTime();
  const dayType = classifyDate(now);

  // Round to current hour in Oslo
  const targetHour = new Date(now);
  targetHour.setMinutes(0, 0, 0);

  const snapshots = [];

  for (const stationId of EVAL_STATIONS) {
    const pred = predictVolume(stationId, now, hour);
    const applyResidual = shouldApplyResidual(hour);

    // Compute raw residual for diagnostics (even when gated)
    let rawResidualP50: number | null = null;
    if (residualModel) {
      try {
        const features = buildFeatures(
          stationId,
          pred.predicted,
          now,
          hour,
          new Map(),
          residualModel,
          undefined
        );
        const residual = predictResidual(residualModel, features);
        rawResidualP50 = residual.p50;
      } catch {
        // Residual computation optional
      }
    }

    // Determine final predicted volume based on policy
    let finalPredicted = pred.predicted;
    let finalPolicy: "baseline_only" | "v2_residual" = "baseline_only";

    if (applyResidual && rawResidualP50 !== null) {
      finalPredicted = Math.max(0, Math.round(pred.predicted + rawResidualP50));
      finalPolicy = "v2_residual";
    }

    // Ferry signal for affected stations
    let ferryFactor = 1.0;
    let ferryActive = false;
    if (isFerryAffectedStation(stationId)) {
      try {
        const fs = await getFerrySignal(stationId);
        ferryFactor = fs.factor;
        ferryActive = fs.factor > 1.0;
      } catch {
        // Ferry signal optional
      }
    }

    const boostedVolume = ferryActive ? Math.round(finalPredicted * ferryFactor) : finalPredicted;

    snapshots.push({
      station_id: stationId,
      target_hour: targetHour.toISOString(),
      predicted_volume: boostedVolume,
      baseline_volume: pred.predicted,
      residual_raw_p50: rawResidualP50,
      final_policy: finalPolicy,
      ferry_boost_factor: ferryFactor,
      ferry_boost_active: ferryActive,
      confidence: pred.confidence,
      day_type: dayType,
    });
  }

  const { data, error } = await supabase
    .from("prediction_eval")
    .upsert(snapshots, { onConflict: "station_id,target_hour" })
    .select("id, station_id");

  if (error) {
    console.error("[eval/snapshot] Supabase error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    hour,
    policy: RESIDUAL_POLICY,
    applyResidual: shouldApplyResidual(hour),
    v2_status: getV2Status(),
    stations: snapshots.length,
    rows: data?.length ?? 0,
  });
}
