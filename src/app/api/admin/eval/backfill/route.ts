import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchHourlyVolume } from "@/lib/vegvesen-client";

/**
 * GET /api/admin/eval/backfill
 * Vercel cron entry point. Authenticated via CRON_SECRET.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return runBackfill();
}

/**
 * POST /api/admin/eval/backfill
 * Manual trigger. Authenticated via ADMIN_API_KEY.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expectedKey = process.env.ADMIN_API_KEY?.trim();
  if (expectedKey && authHeader !== `Bearer ${expectedKey}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return runBackfill();
}

async function runBackfill() {
  if (!supabase) {
    return NextResponse.json({ error: "supabase not configured" }, { status: 503 });
  }

  // Find snapshots without actuals, older than 2 hours (data should be available)
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data: pending, error: fetchError } = await supabase
    .from("prediction_eval")
    .select("id, station_id, target_hour")
    .is("actual_volume", null)
    .lt("target_hour", twoHoursAgo)
    .order("target_hour", { ascending: true })
    .limit(50);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    return NextResponse.json({ ok: true, matched: 0, message: "no pending snapshots" });
  }

  let matched = 0;
  let failed = 0;

  // Group by station to batch API calls
  const byStation = new Map<string, typeof pending>();
  for (const row of pending) {
    if (!byStation.has(row.station_id)) byStation.set(row.station_id, []);
    byStation.get(row.station_id)!.push(row);
  }

  for (const [stationId, rows] of byStation) {
    // Find time range needed
    const hours = rows.map((r) => new Date(r.target_hour));
    const earliest = new Date(Math.min(...hours.map((h) => h.getTime())));
    const latest = new Date(Math.max(...hours.map((h) => h.getTime())));
    earliest.setHours(earliest.getHours() - 1);
    latest.setHours(latest.getHours() + 2);

    try {
      const volumes = await fetchHourlyVolume(
        stationId,
        earliest.toISOString(),
        latest.toISOString()
      );

      for (const row of rows) {
        const targetMs = new Date(row.target_hour).getTime();
        // Find the volume record that matches this hour
        const match = volumes.find((v) => {
          const vStart = new Date(v.from).getTime();
          return Math.abs(vStart - targetMs) < 30 * 60 * 1000; // within 30 min
        });

        if (match && match.coverage > 50) {
          const { error: updateError } = await supabase
            .from("prediction_eval")
            .update({
              actual_volume: match.total,
              actual_available_at: new Date().toISOString(),
            })
            .eq("id", row.id);

          if (!updateError) matched++;
          else failed++;
        }
      }
    } catch {
      failed += rows.length;
    }
  }

  return NextResponse.json({ ok: true, pending: pending.length, matched, failed });
}
