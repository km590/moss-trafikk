import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { predictVolume } from "@/lib/prediction-engine";
import { getFerrySignal, isFerryAffectedStation } from "@/lib/ferry-signal";
import { classifyDate } from "@/lib/norwegian-calendar";
import { getNorwayTime } from "@/lib/traffic-logic";
import { KANALBRUA_ID, RV19_STATION_IDS } from "@/lib/stations";

// Stations to track: Kanalbrua + RV19
const EVAL_STATIONS = [KANALBRUA_ID, ...RV19_STATION_IDS];

/**
 * POST /api/admin/eval/snapshot
 * Saves current predictions for eval stations.
 * Call this hourly via cron or manual trigger.
 */
export async function POST(request: Request) {
  // Simple auth check
  const authHeader = request.headers.get("authorization");
  const expectedKey = process.env.ADMIN_API_KEY;
  if (expectedKey && authHeader !== `Bearer ${expectedKey}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!supabase) {
    return NextResponse.json({ error: "supabase not configured" }, { status: 503 });
  }

  const now = new Date();
  const { hour, dayOfWeek } = getNorwayTime();
  const dayType = classifyDate(now);

  // Round to current hour in Oslo
  const targetHour = new Date(now);
  targetHour.setMinutes(0, 0, 0);

  const snapshots = [];

  for (const stationId of EVAL_STATIONS) {
    const pred = predictVolume(stationId, now, hour);

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

    const boostedVolume = ferryActive
      ? Math.round(pred.predicted * ferryFactor)
      : pred.predicted;

    snapshots.push({
      station_id: stationId,
      target_hour: targetHour.toISOString(),
      predicted_volume: boostedVolume,
      baseline_volume: pred.predicted,
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
    stations: snapshots.length,
    rows: data?.length ?? 0,
  });
}
