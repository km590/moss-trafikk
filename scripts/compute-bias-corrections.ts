/**
 * Compute bias correction factors from eval data.
 * Uses temporal holdout: factors from first half, evaluated on second half.
 * Global per-period only (5 buckets). No per-station granularity yet.
 *
 * Usage: npx tsx scripts/compute-bias-corrections.ts
 * Output: tmp/bias-corrections.json (outside repo, experiment artifact)
 */
import fs from "fs";
import path from "path";

const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

interface EvalRow {
  station_id: string;
  target_hour: string;
  predicted_volume: number;
  baseline_volume: number;
  actual_volume: number;
  error_pct: number | null;
  signed_error_pct: number | null;
}

type Period = "morgen-rush" | "midt-dag" | "ettermiddag-rush" | "kveld" | "natt";

function classifyPeriod(hour: number): Period {
  if (hour >= 7 && hour <= 9) return "morgen-rush";
  if (hour >= 10 && hour <= 14) return "midt-dag";
  if (hour >= 15 && hour <= 17) return "ettermiddag-rush";
  if (hour >= 18 && hour <= 22) return "kveld";
  return "natt";
}

function getOsloHour(utcIso: string): number {
  // CET = UTC+1, CEST = UTC+2 (last Sunday March -> last Sunday October)
  const d = new Date(utcIso);
  const oslo = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Oslo" }));
  return oslo.getHours();
}

function median(values: number[]): number {
  if (values.length === 0) return 1.0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mape(rows: EvalRow[], correctionFactors?: Map<Period, number>): number {
  let sum = 0;
  for (const r of rows) {
    const predicted = correctionFactors
      ? r.predicted_volume *
        (correctionFactors.get(classifyPeriod(getOsloHour(r.target_hour))) ?? 1.0)
      : r.predicted_volume;
    sum += (Math.abs(predicted - r.actual_volume) / r.actual_volume) * 100;
  }
  return sum / rows.length;
}

function bias(rows: EvalRow[], correctionFactors?: Map<Period, number>): number {
  let sum = 0;
  for (const r of rows) {
    const predicted = correctionFactors
      ? r.predicted_volume *
        (correctionFactors.get(classifyPeriod(getOsloHour(r.target_hour))) ?? 1.0)
      : r.predicted_volume;
    sum += ((predicted - r.actual_volume) / r.actual_volume) * 100;
  }
  return sum / rows.length;
}

async function fetchEvalRows(): Promise<EvalRow[]> {
  const url = `${SUPABASE_URL}/rest/v1/prediction_eval?select=station_id,target_hour,predicted_volume,baseline_volume,actual_volume,error_pct,signed_error_pct&actual_volume=not.is.null&order=target_hour.asc`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY!,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
  return res.json();
}

async function main() {
  const allRows = await fetchEvalRows();
  console.log(`\nTotal eval rows with actuals: ${allRows.length}`);

  // Filter: both predicted and actual > 10 (avoid division by tiny numbers)
  const validRows = allRows.filter((r) => r.predicted_volume > 10 && r.actual_volume > 10);
  console.log(`After min-volume filter (>10): ${validRows.length}`);

  // Anomaly detection: exclude error_pct > 200%
  const anomalies = validRows.filter((r) => Math.abs(r.error_pct ?? 0) > 200);
  const cleanRows = validRows.filter((r) => Math.abs(r.error_pct ?? 0) <= 200);
  console.log(`Anomalies excluded (|error| > 200%): ${anomalies.length}`);
  if (anomalies.length > 0) {
    console.log("\n=== EXCLUDED ANOMALIES ===");
    for (const a of anomalies) {
      console.log(
        `  ${a.target_hour.slice(0, 16)}  ${a.station_id.slice(0, 12)}  pred=${a.predicted_volume}  actual=${a.actual_volume}  error=${a.error_pct}%`
      );
    }
  }
  console.log(`Clean rows for analysis: ${cleanRows.length}`);

  // Temporal holdout split: first half = training, second half = holdout
  const midpoint = Math.floor(cleanRows.length / 2);
  const trainRows = cleanRows.slice(0, midpoint);
  const holdoutRows = cleanRows.slice(midpoint);
  const trainCutoff = trainRows[trainRows.length - 1]?.target_hour ?? "?";
  console.log(`\nTrain: ${trainRows.length} rows (up to ${trainCutoff.slice(0, 16)})`);
  console.log(`Holdout: ${holdoutRows.length} rows`);

  // Compute correction factors from training data
  const periods: Period[] = ["morgen-rush", "midt-dag", "ettermiddag-rush", "kveld", "natt"];
  const corrections = new Map<Period, number>();
  const stats: Record<string, { factor: number; n: number; trainBias: number }> = {};

  console.log("\n=== CORRECTION FACTORS (from training set) ===");
  console.log("Period            n     Factor   Train Bias");
  console.log("─".repeat(50));

  for (const period of periods) {
    const periodRows = trainRows.filter(
      (r) => classifyPeriod(getOsloHour(r.target_hour)) === period
    );

    if (periodRows.length < 20) {
      console.log(
        `${period.padEnd(18)} ${String(periodRows.length).padStart(4)}     1.000    (insufficient samples, no correction)`
      );
      corrections.set(period, 1.0);
      stats[period] = { factor: 1.0, n: periodRows.length, trainBias: 0 };
      continue;
    }

    const ratios = periodRows.map((r) => r.actual_volume / r.predicted_volume);
    const factor = median(ratios);
    const trainBiasVal = bias(periodRows);

    corrections.set(period, factor);
    stats[period] = { factor, n: periodRows.length, trainBias: trainBiasVal };

    const warning = periodRows.length < 30 ? " ⚠ <30" : "";
    console.log(
      `${period.padEnd(18)} ${String(periodRows.length).padStart(4)}     ${factor.toFixed(3)}    ${trainBiasVal > 0 ? "+" : ""}${trainBiasVal.toFixed(1)}%${warning}`
    );
  }

  // Evaluate on holdout
  console.log("\n=== HOLDOUT EVALUATION ===");
  const holdoutBaselineMape = mape(holdoutRows);
  const holdoutCorrectedMape = mape(holdoutRows, corrections);
  const holdoutBaselineBias = bias(holdoutRows);
  const holdoutCorrectedBias = bias(holdoutRows, corrections);
  const delta = holdoutCorrectedMape - holdoutBaselineMape;

  console.log(`Holdout Baseline MAPE:  ${holdoutBaselineMape.toFixed(1)}%`);
  console.log(`Holdout Corrected MAPE: ${holdoutCorrectedMape.toFixed(1)}%`);
  console.log(
    `Delta:                  ${delta > 0 ? "+" : ""}${delta.toFixed(1)}pp ${delta < 0 ? "(IMPROVEMENT)" : "(WORSE)"}`
  );
  console.log(
    `Holdout Baseline Bias:  ${holdoutBaselineBias > 0 ? "+" : ""}${holdoutBaselineBias.toFixed(1)}%`
  );
  console.log(
    `Holdout Corrected Bias: ${holdoutCorrectedBias > 0 ? "+" : ""}${holdoutCorrectedBias.toFixed(1)}%`
  );

  // Per-period holdout breakdown
  console.log("\n=== HOLDOUT PER PERIOD ===");
  console.log("Period            n    Base MAPE  Corr MAPE  Delta");
  console.log("─".repeat(55));

  for (const period of periods) {
    const pRows = holdoutRows.filter((r) => classifyPeriod(getOsloHour(r.target_hour)) === period);
    if (pRows.length === 0) continue;
    const bm = mape(pRows);
    const cm = mape(pRows, corrections);
    const d = cm - bm;
    console.log(
      `${period.padEnd(18)} ${String(pRows.length).padStart(4)}    ${bm.toFixed(1).padStart(6)}%    ${cm.toFixed(1).padStart(6)}%  ${d > 0 ? "+" : ""}${d.toFixed(1)}pp`
    );
  }

  // Go/no-go
  console.log("\n=== GO/NO-GO (Fase B) ===");
  const mapePass = delta <= -1.0;
  console.log(`MAPE improvement >= 1pp:  ${mapePass ? "PASS" : "FAIL"} (${delta.toFixed(1)}pp)`);
  console.log("(Congestion hit rate evaluated by separate script)");
  console.log(
    `\nIndikasjon basert på ${holdoutRows.length} holdout-rader — ikke statistisk bevis.`
  );

  // Write output artifact
  const outDir = path.join(path.dirname(new URL(import.meta.url).pathname), "../tmp");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const output = {
    corrections: Object.fromEntries(periods.map((p) => [p, stats[p]])),
    holdout: {
      baselineMape: +holdoutBaselineMape.toFixed(1),
      correctedMape: +holdoutCorrectedMape.toFixed(1),
      deltaPp: +delta.toFixed(1),
      baselineBias: +holdoutBaselineBias.toFixed(1),
      correctedBias: +holdoutCorrectedBias.toFixed(1),
      n: holdoutRows.length,
    },
    anomaliesExcluded: anomalies.map((a) => ({
      target_hour: a.target_hour,
      station_id: a.station_id,
      error_pct: a.error_pct,
    })),
    metadata: {
      generatedAt: new Date().toISOString(),
      totalRows: allRows.length,
      cleanRows: cleanRows.length,
      trainRows: trainRows.length,
      holdoutRows: holdoutRows.length,
      trainCutoff,
    },
  };

  const outPath = path.join(outDir, "bias-corrections.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nOutput written to: ${outPath}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
