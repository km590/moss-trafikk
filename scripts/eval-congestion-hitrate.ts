/**
 * Evaluate congestion classification hit rate (green/yellow/red).
 * Compares predicted vs actual congestion for baseline and bias-corrected predictions.
 * Uses temporal holdout from compute-bias-corrections.ts output.
 *
 * Usage: npx tsx scripts/eval-congestion-hitrate.ts
 * Requires: tmp/bias-corrections.json (run compute-bias-corrections.ts first)
 */
import fs from "fs";
import path from "path";

// --- Inline constants from traffic-logic.ts and prediction-engine.ts ---
// (inlined to avoid tsx import issues with src/lib, same as compute-model.ts pattern)

const DEVIATION_YELLOW = 1.15;
const DEVIATION_RED = 1.35;
const LEAN_GREEN_DEVIATION = 1.2;
const LEAN_GREEN_ABS_FACTOR = 1.05;
const RUSH_HOURS = [7, 8, 15, 16, 17];

interface StationVulnerability {
  yellowAbsolute: number;
  redAbsolute: number;
  friction: number;
  dampedHours: number[];
}

const STATION_VULNERABILITY: Record<string, StationVulnerability> = {
  "40641V971605": {
    yellowAbsolute: 1200,
    redAbsolute: 1600,
    friction: 1.3,
    dampedHours: [19, 20, 21, 22],
  },
  "72867V971385": {
    yellowAbsolute: 900,
    redAbsolute: 1300,
    friction: 1.0,
    dampedHours: [20, 21, 22],
  },
  "69994V971384": {
    yellowAbsolute: 1000,
    redAbsolute: 1400,
    friction: 0.9,
    dampedHours: [20, 21, 22],
  },
};

const DEFAULT_VULN: StationVulnerability = {
  yellowAbsolute: 1500,
  redAbsolute: 2000,
  friction: 1.0,
  dampedHours: [20, 21, 22],
};

function getVuln(stationId: string): StationVulnerability {
  return STATION_VULNERABILITY[stationId] ?? DEFAULT_VULN;
}

type CongestionLevel = "green" | "yellow" | "red";

// Mirrors classifyCongestion from traffic-logic.ts (measured congestion, 2-of-3 for red)
function classifyActual(
  volume: number,
  normalVolume: number,
  stationId: string,
  hour: number
): CongestionLevel {
  if (normalVolume === 0 || normalVolume < 10) return "green";
  const vuln = getVuln(stationId);
  const ratio = volume / normalVolume;

  const absYellow = volume >= vuln.yellowAbsolute;
  const absRed = volume >= vuln.redAbsolute;
  const devYellow = ratio >= DEVIATION_YELLOW;
  const devRed = ratio >= DEVIATION_RED;
  const isRush = RUSH_HOURS.includes(hour);
  const timeFactor = isRush ? 1.2 : vuln.dampedHours.includes(hour) ? 0.7 : 1.0;
  const ef = vuln.friction * timeFactor;
  const frictionYellow = volume * ef >= vuln.yellowAbsolute;
  const frictionRed = volume * ef >= vuln.redAbsolute;

  const yellowSignals = [absYellow, devYellow, frictionYellow].filter(Boolean).length;
  const redSignals = [absRed, devRed, frictionRed].filter(Boolean).length;
  const isDamped = vuln.dampedHours.includes(hour);
  const redThreshold = isDamped ? 3 : 2;

  if (redSignals >= redThreshold) return "red";
  if (
    yellowSignals >= 1 &&
    ratio < LEAN_GREEN_DEVIATION &&
    volume < vuln.yellowAbsolute * LEAN_GREEN_ABS_FACTOR
  )
    return "green";
  if (yellowSignals >= 1) return "yellow";
  return "green";
}

// --- Shared signal computation ---
interface Signals {
  absYellow: boolean;
  absRed: boolean;
  relYellow: boolean;
  relRed: boolean;
  frictionYellow: boolean;
  frictionRed: boolean;
  isDamped: boolean;
}

function computeSignals(
  volume: number,
  normalVolume: number,
  stationId: string,
  hour: number
): Signals {
  const vuln = getVuln(stationId);
  const absYellow = volume >= vuln.yellowAbsolute;
  const absRed = volume >= vuln.redAbsolute;
  const relYellow = normalVolume > 0 && volume >= normalVolume * 1.15;
  const relRed = normalVolume > 0 && volume >= normalVolume * 1.35;
  const isRush = RUSH_HOURS.includes(hour);
  const timeFactor = isRush ? 1.2 : vuln.dampedHours.includes(hour) ? 0.7 : 1.0;
  const ef = vuln.friction * timeFactor;
  const frictionYellow = volume * ef >= vuln.yellowAbsolute;
  const frictionRed = volume * ef >= vuln.redAbsolute;
  const isDamped = vuln.dampedHours.includes(hour);
  return { absYellow, absRed, relYellow, relRed, frictionYellow, frictionRed, isDamped };
}

// CURRENT: 3-of-3 for red (damped: + 1.1x headroom), 2-of-3 for yellow
function classifyPredicted(
  predicted: number,
  normalVolume: number,
  stationId: string,
  hour: number
): CongestionLevel {
  if (predicted < 10) return "green";
  const s = computeSignals(predicted, normalVolume, stationId, hour);
  const vuln = getVuln(stationId);
  const yellowSignals = [s.absYellow, s.relYellow, s.frictionYellow].filter(Boolean).length;
  const redSignals = [s.absRed, s.relRed, s.frictionRed].filter(Boolean).length;

  if (redSignals >= 3) {
    if (s.isDamped) {
      if (predicted >= vuln.redAbsolute * 1.1) return "red";
    } else {
      return "red";
    }
  }
  if (yellowSignals >= 2) return "yellow";
  return "green";
}

// ALT A (paritet med measured): 2-of-3 red (normal), 3-of-3 red (damped), 1-of-3 yellow (med lean-green)
function classifyAltA(
  predicted: number,
  normalVolume: number,
  stationId: string,
  hour: number
): CongestionLevel {
  if (predicted < 10) return "green";
  const s = computeSignals(predicted, normalVolume, stationId, hour);
  const vuln = getVuln(stationId);
  const yellowSignals = [s.absYellow, s.relYellow, s.frictionYellow].filter(Boolean).length;
  const redSignals = [s.absRed, s.relRed, s.frictionRed].filter(Boolean).length;
  const redThreshold = s.isDamped ? 3 : 2;

  if (redSignals >= redThreshold) return "red";

  // Lean-green clause (same as measured)
  const ratio = normalVolume > 0 ? predicted / normalVolume : 0;
  if (
    yellowSignals >= 1 &&
    ratio < LEAN_GREEN_DEVIATION &&
    predicted < vuln.yellowAbsolute * LEAN_GREEN_ABS_FACTOR
  ) {
    return "green";
  }
  if (yellowSignals >= 1) return "yellow";
  return "green";
}

// ALT B (moderat): 2-of-3 red (alle timer, ingen damped-distinksjon), 2-of-3 yellow
function classifyAltB(
  predicted: number,
  normalVolume: number,
  stationId: string,
  hour: number
): CongestionLevel {
  if (predicted < 10) return "green";
  const s = computeSignals(predicted, normalVolume, stationId, hour);
  const yellowSignals = [s.absYellow, s.relYellow, s.frictionYellow].filter(Boolean).length;
  const redSignals = [s.absRed, s.relRed, s.frictionRed].filter(Boolean).length;

  if (redSignals >= 2) return "red";
  if (yellowSignals >= 2) return "yellow";
  return "green";
}

// --- Supabase + data ---

const SUPABASE_URL = process.env.SUPABASE_URL?.trim().replace(/^"|"$/g, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim().replace(/^"|"$/g, "");

interface EvalRow {
  station_id: string;
  target_hour: string;
  predicted_volume: number;
  baseline_volume: number;
  actual_volume: number;
  error_pct: number | null;
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
  const d = new Date(utcIso);
  const oslo = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Oslo" }));
  return oslo.getHours();
}

// Normal volume lookup from model-weights.json
let modelWeights: any;
function getNormalVolume(stationId: string, dow: number, hour: number): number {
  if (!modelWeights) {
    const weightsPath = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      "../src/data/model-weights.json"
    );
    modelWeights = JSON.parse(fs.readFileSync(weightsPath, "utf-8"));
  }
  return modelWeights.basePatterns?.[stationId]?.[dow]?.[hour]?.median ?? 0;
}

function getOsloDow(utcIso: string): number {
  const d = new Date(utcIso);
  const oslo = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Oslo" }));
  return oslo.getDay();
}

async function fetchEvalRows(): Promise<EvalRow[]> {
  const url = `${SUPABASE_URL}/rest/v1/prediction_eval?select=station_id,target_hour,predicted_volume,baseline_volume,actual_volume,error_pct&actual_volume=not.is.null&order=target_hour.asc`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
  return res.json();
}

interface ConfusionMatrix {
  green_green: number;
  green_yellow: number;
  green_red: number;
  yellow_green: number;
  yellow_yellow: number;
  yellow_red: number;
  red_green: number;
  red_yellow: number;
  red_red: number;
}

function emptyMatrix(): ConfusionMatrix {
  return {
    green_green: 0,
    green_yellow: 0,
    green_red: 0,
    yellow_green: 0,
    yellow_yellow: 0,
    yellow_red: 0,
    red_green: 0,
    red_yellow: 0,
    red_red: 0,
  };
}

function addToMatrix(m: ConfusionMatrix, predicted: CongestionLevel, actual: CongestionLevel) {
  const key = `${predicted}_${actual}` as keyof ConfusionMatrix;
  m[key]++;
}

function printMatrix(label: string, m: ConfusionMatrix, total: number) {
  const accuracy = ((m.green_green + m.yellow_yellow + m.red_red) / total) * 100;
  console.log(`\n=== ${label} (n=${total}, accuracy=${accuracy.toFixed(1)}%) ===`);
  console.log("              Actual:");
  console.log("Predicted:    green    yellow   red");
  console.log(
    `  green       ${String(m.green_green).padStart(5)}    ${String(m.green_yellow).padStart(5)}   ${String(m.green_red).padStart(5)}`
  );
  console.log(
    `  yellow      ${String(m.yellow_green).padStart(5)}    ${String(m.yellow_yellow).padStart(5)}   ${String(m.yellow_red).padStart(5)}`
  );
  console.log(
    `  red         ${String(m.red_green).padStart(5)}    ${String(m.red_yellow).padStart(5)}   ${String(m.red_red).padStart(5)}`
  );

  // Per-class metrics
  const levels: CongestionLevel[] = ["green", "yellow", "red"];
  for (const level of levels) {
    const tp = m[`${level}_${level}` as keyof ConfusionMatrix];
    const totalActual = levels.reduce((s, l) => s + m[`${l}_${level}` as keyof ConfusionMatrix], 0);
    const totalPredicted = levels.reduce(
      (s, l) => s + m[`${level}_${l}` as keyof ConfusionMatrix],
      0
    );
    const recall = totalActual > 0 ? ((tp / totalActual) * 100).toFixed(0) : "n/a";
    const precision = totalPredicted > 0 ? ((tp / totalPredicted) * 100).toFixed(0) : "n/a";
    console.log(
      `  ${level}: recall=${recall}% precision=${precision}% (actual=${totalActual}, predicted=${totalPredicted})`
    );
  }
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  // Load bias corrections
  const correctionsPath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "../tmp/bias-corrections.json"
  );
  if (!fs.existsSync(correctionsPath)) {
    console.error("Run compute-bias-corrections.ts first to generate tmp/bias-corrections.json");
    process.exit(1);
  }
  const biasData = JSON.parse(fs.readFileSync(correctionsPath, "utf-8"));
  const corrections = new Map<Period, number>();
  for (const [period, data] of Object.entries(biasData.corrections)) {
    corrections.set(period as Period, (data as any).factor);
  }

  const allRows = await fetchEvalRows();
  const validRows = allRows.filter((r) => r.predicted_volume > 10 && r.actual_volume > 10);
  const cleanRows = validRows.filter((r) => Math.abs(r.error_pct ?? 0) <= 200);

  // Use same holdout split as bias corrections
  const midpoint = Math.floor(cleanRows.length / 2);
  const holdoutRows = cleanRows.slice(midpoint);

  console.log(
    `Total rows: ${allRows.length}, clean: ${cleanRows.length}, holdout: ${holdoutRows.length}`
  );

  // --- Evaluate all three classifiers side by side ---
  const classifiers: { name: string; fn: typeof classifyPredicted }[] = [
    { name: "CURRENT (3-of-3 red, 2-of-3 yellow)", fn: classifyPredicted },
    {
      name: "ALT A (paritet: 2/3 red normal, 3/3 damped, 1/3 yellow + lean-green)",
      fn: classifyAltA,
    },
    { name: "ALT B (moderat: 2/3 red alle timer, 2/3 yellow)", fn: classifyAltB },
  ];

  const matrices: { name: string; matrix: ConfusionMatrix }[] = [];

  for (const clf of classifiers) {
    const m = emptyMatrix();
    for (const row of holdoutRows) {
      const hour = getOsloHour(row.target_hour);
      const dow = getOsloDow(row.target_hour);
      const normalVol = getNormalVolume(row.station_id, dow, hour);

      const actualCongestion = classifyActual(row.actual_volume, normalVol, row.station_id, hour);
      const predictedCongestion = clf.fn(row.predicted_volume, normalVol, row.station_id, hour);
      addToMatrix(m, predictedCongestion, actualCongestion);
    }
    matrices.push({ name: clf.name, matrix: m });
    printMatrix(clf.name, m, holdoutRows.length);
  }

  // --- Side-by-side comparison table ---
  const levels: CongestionLevel[] = ["green", "yellow", "red"];
  console.log("\n=== SIDE-BY-SIDE COMPARISON ===");
  console.log("Metric".padEnd(20) + matrices.map((m) => m.name.slice(0, 30).padEnd(32)).join(""));

  // Overall accuracy
  const accuracies = matrices.map(
    ({ matrix: m }) => ((m.green_green + m.yellow_yellow + m.red_red) / holdoutRows.length) * 100
  );
  console.log(
    "Accuracy".padEnd(20) + accuracies.map((a) => `${a.toFixed(1)}%`.padEnd(32)).join("")
  );

  // Per-class recall and precision
  for (const level of levels) {
    const recalls = matrices.map(({ matrix: m }) => {
      const tp = m[`${level}_${level}` as keyof ConfusionMatrix];
      const totalActual = levels.reduce(
        (s, l) => s + m[`${l}_${level}` as keyof ConfusionMatrix],
        0
      );
      return totalActual > 0
        ? `${((tp / totalActual) * 100).toFixed(0)}% (${tp}/${totalActual})`
        : "n/a";
    });
    console.log(`${level} recall`.padEnd(20) + recalls.map((r) => r.padEnd(32)).join(""));

    const precisions = matrices.map(({ matrix: m }) => {
      const tp = m[`${level}_${level}` as keyof ConfusionMatrix];
      const totalPredicted = levels.reduce(
        (s, l) => s + m[`${level}_${l}` as keyof ConfusionMatrix],
        0
      );
      return totalPredicted > 0
        ? `${((tp / totalPredicted) * 100).toFixed(0)}% (${tp}/${totalPredicted})`
        : "n/a (0 pred)";
    });
    console.log(`${level} precision`.padEnd(20) + precisions.map((p) => p.padEnd(32)).join(""));
  }

  // --- Go/no-go ---
  console.log("\n=== GO/NO-GO vs CURRENT ===");
  for (let i = 1; i < matrices.length; i++) {
    const { name, matrix: m } = matrices[i];
    const curr = matrices[0].matrix;
    const currAcc = (curr.green_green + curr.yellow_yellow + curr.red_red) / holdoutRows.length;
    const altAcc = (m.green_green + m.yellow_yellow + m.red_red) / holdoutRows.length;
    const delta = (altAcc - currAcc) * 100;

    console.log(`\n${name}:`);
    console.log(`  Accuracy delta: ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}pp`);

    let anyWorse = false;
    for (const level of levels) {
      const currTp = curr[`${level}_${level}` as keyof ConfusionMatrix];
      const altTp = m[`${level}_${level}` as keyof ConfusionMatrix];
      const totalActual = levels.reduce(
        (s, l) => s + curr[`${l}_${level}` as keyof ConfusionMatrix],
        0
      );
      if (totalActual > 5) {
        const currRecall = ((currTp / totalActual) * 100).toFixed(0);
        const altRecall = ((altTp / totalActual) * 100).toFixed(0);
        if (altTp < currTp) {
          console.log(`  ⚠ ${level} recall: ${currRecall}% -> ${altRecall}% (WORSE)`);
          anyWorse = true;
        } else if (altTp > currTp) {
          console.log(`  ✓ ${level} recall: ${currRecall}% -> ${altRecall}% (improved)`);
        }
      }
    }

    // Check precision for red/yellow specifically (spam check)
    for (const level of ["yellow", "red"] as CongestionLevel[]) {
      const altPredicted = levels.reduce(
        (s, l) => s + m[`${level}_${l}` as keyof ConfusionMatrix],
        0
      );
      const altTp = m[`${level}_${level}` as keyof ConfusionMatrix];
      const currPredicted = levels.reduce(
        (s, l) => s + curr[`${level}_${l}` as keyof ConfusionMatrix],
        0
      );
      const currTp = curr[`${level}_${level}` as keyof ConfusionMatrix];
      if (altPredicted > 0) {
        const altPrec = ((altTp / altPredicted) * 100).toFixed(0);
        const currPrec = currPredicted > 0 ? ((currTp / currPredicted) * 100).toFixed(0) : "n/a";
        console.log(
          `  ${level} precision: ${currPrec}% (${currTp}/${currPredicted}) -> ${altPrec}% (${altTp}/${altPredicted})`
        );
      }
    }

    if (!anyWorse) {
      console.log(`  VERDICT: No class worsened`);
    } else {
      console.log(`  VERDICT: Some classes worsened — review needed`);
    }
  }

  console.log(`\nIndikasjon basert på ${holdoutRows.length} holdout-rader.`);

  // --- RAD-FOR-RAD INSPEKSJON: CURRENT vs ALT A uenigheter ---
  console.log("\n\n========================================");
  console.log("=== RAD-FOR-RAD INSPEKSJON (CURRENT vs ALT A) ===");
  console.log("========================================");
  console.log("Viser holdout-rader der CURRENT og ALT A klassifiserer ulikt.\n");

  interface DisagreementRow {
    time: string;
    station: string;
    hour: number;
    predicted: number;
    actual: number;
    normal: number;
    actualClass: CongestionLevel;
    currentClass: CongestionLevel;
    altAClass: CongestionLevel;
    signals: {
      absRed: boolean;
      relRed: boolean;
      frictionRed: boolean;
      absYellow: boolean;
      relYellow: boolean;
      frictionYellow: boolean;
      isDamped: boolean;
    };
  }

  const disagreements: DisagreementRow[] = [];

  for (const row of holdoutRows) {
    const hour = getOsloHour(row.target_hour);
    const dow = getOsloDow(row.target_hour);
    const normalVol = getNormalVolume(row.station_id, dow, hour);

    const actualClass = classifyActual(row.actual_volume, normalVol, row.station_id, hour);
    const currentClass = classifyPredicted(row.predicted_volume, normalVol, row.station_id, hour);
    const altAClass = classifyAltA(row.predicted_volume, normalVol, row.station_id, hour);

    if (currentClass !== altAClass) {
      const s = computeSignals(row.predicted_volume, normalVol, row.station_id, hour);
      disagreements.push({
        time: row.target_hour,
        station: row.station_id,
        hour,
        predicted: row.predicted_volume,
        actual: row.actual_volume,
        normal: normalVol,
        actualClass,
        currentClass,
        altAClass,
        signals: {
          absRed: s.absRed,
          relRed: s.relRed,
          frictionRed: s.frictionRed,
          absYellow: s.absYellow,
          relYellow: s.relYellow,
          frictionYellow: s.frictionYellow,
          isDamped: s.isDamped,
        },
      });
    }
  }

  // Categorize
  const categories = {
    "yellow→red (actual=red)": disagreements.filter(
      (d) => d.currentClass === "yellow" && d.altAClass === "red" && d.actualClass === "red"
    ),
    "yellow→red (actual=yellow)": disagreements.filter(
      (d) => d.currentClass === "yellow" && d.altAClass === "red" && d.actualClass === "yellow"
    ),
    "yellow→red (actual=green)": disagreements.filter(
      (d) => d.currentClass === "yellow" && d.altAClass === "red" && d.actualClass === "green"
    ),
    "yellow→green (actual=green)": disagreements.filter(
      (d) => d.currentClass === "yellow" && d.altAClass === "green" && d.actualClass === "green"
    ),
    "yellow→green (actual=yellow)": disagreements.filter(
      (d) => d.currentClass === "yellow" && d.altAClass === "green" && d.actualClass === "yellow"
    ),
    "green→yellow (actual=yellow)": disagreements.filter(
      (d) => d.currentClass === "green" && d.altAClass === "yellow" && d.actualClass === "yellow"
    ),
    "green→yellow (actual=green)": disagreements.filter(
      (d) => d.currentClass === "green" && d.altAClass === "yellow" && d.actualClass === "green"
    ),
    other: disagreements.filter((d) => {
      const key = `${d.currentClass}→${d.altAClass} (actual=${d.actualClass})`;
      return ![
        "yellow→red (actual=red)",
        "yellow→red (actual=yellow)",
        "yellow→red (actual=green)",
        "yellow→green (actual=green)",
        "yellow→green (actual=yellow)",
        "green→yellow (actual=yellow)",
        "green→yellow (actual=green)",
      ].includes(key);
    }),
  };

  console.log(
    `Totalt ${disagreements.length} uenigheter av ${holdoutRows.length} holdout-rader:\n`
  );
  for (const [cat, rows] of Object.entries(categories)) {
    if (rows.length === 0) continue;
    const correct = rows.filter((r) => r.altAClass === r.actualClass).length;
    const wasCorrect = rows.filter((r) => r.currentClass === r.actualClass).length;
    console.log(
      `  ${cat}: ${rows.length} rader (Alt A riktig: ${correct}, CURRENT riktig: ${wasCorrect})`
    );
  }

  // Show individual rows for the key categories
  function printRows(label: string, rows: DisagreementRow[], max: number) {
    if (rows.length === 0) return;
    console.log(`\n--- ${label} (viser ${Math.min(rows.length, max)} av ${rows.length}) ---`);
    const vuln = getVuln(rows[0].station);
    console.log(
      `(Terskler for forste stasjon ${rows[0].station}: yellowAbs=${vuln.yellowAbsolute}, redAbs=${vuln.redAbsolute})\n`
    );
    console.log(
      "Tid(Oslo)".padEnd(14) +
        "Stasjon".padEnd(18) +
        "Pred".padEnd(7) +
        "Actual".padEnd(8) +
        "Normal".padEnd(8) +
        "Ratio".padEnd(7) +
        "Act".padEnd(6) +
        "CUR".padEnd(6) +
        "AltA".padEnd(6) +
        "absR relR friR | absY relY friY | damp"
    );
    for (const r of rows.slice(0, max)) {
      const vuln2 = getVuln(r.station);
      const ratio = r.normal > 0 ? (r.predicted / r.normal).toFixed(2) : "n/a";
      const s = r.signals;
      console.log(
        `${r.time.slice(0, 16)}  `.padEnd(14) +
          r.station.padEnd(18) +
          String(r.predicted).padEnd(7) +
          String(r.actual).padEnd(8) +
          String(r.normal).padEnd(8) +
          ratio.padEnd(7) +
          r.actualClass.padEnd(6) +
          r.currentClass.padEnd(6) +
          r.altAClass.padEnd(6) +
          `${s.absRed ? "T" : "f"}    ${s.relRed ? "T" : "f"}    ${s.frictionRed ? "T" : "f"}    | ${s.absYellow ? "T" : "f"}    ${s.relYellow ? "T" : "f"}    ${s.frictionYellow ? "T" : "f"}    | ${s.isDamped ? "D" : "-"}`
      );
    }
  }

  // Key inspection: yellow→red where actual is red (should be correct reclassification)
  printRows(
    "yellow→red der actual=red (forventet riktig omklassifisering)",
    categories["yellow→red (actual=red)"],
    15
  );

  // Key inspection: yellow→red where actual is yellow (potential over-classification)
  printRows(
    "yellow→red der actual=yellow (potensiell overklassifisering)",
    categories["yellow→red (actual=yellow)"],
    10
  );

  // Lean-green: yellow→green (should be correct for lean-green clause)
  printRows(
    "yellow→green der actual=green (lean-green forbedring)",
    categories["yellow→green (actual=green)"],
    10
  );
  printRows(
    "yellow→green der actual=yellow (lean-green feil)",
    categories["yellow→green (actual=yellow)"],
    10
  );

  // New yellow: green→yellow
  printRows(
    "green→yellow der actual=yellow (ny korrekt gul)",
    categories["green→yellow (actual=yellow)"],
    10
  );
  printRows(
    "green→yellow der actual=green (ny feil gul)",
    categories["green→yellow (actual=green)"],
    10
  );

  // Other
  printRows("Andre uenigheter", categories["other"], 10);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
