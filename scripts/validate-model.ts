/**
 * Validate model quality with train/test split.
 * Uses last 4 months as test set, rest as training.
 * Reports segmented MAPE with day-type classification matching compute-model.
 *
 * Usage: npx tsx scripts/validate-model.ts
 */
import fs from "fs";
import path from "path";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const RAW_DIR = path.join(SCRIPT_DIR, "raw-history");
const WEIGHTS_PATH = path.join(SCRIPT_DIR, "../src/data/model-weights.json");

interface HourRecord {
  from: string;
  to: string;
  volume: number;
  coverage: number;
}

interface StationHistory {
  stationId: string;
  stationName: string;
  records: HourRecord[];
}

interface ModelWeights {
  basePatterns: Record<string, Record<number, Record<number, {
    median: number; mean: number; sampleCount: number; p25: number; p75: number;
  }>>>;
  monthFactors: Record<number, number>;
  holidayFactors: Record<string, number>;
}

// --- Oslo time ---

function getOsloTime(isoStr: string): { dayOfWeek: number; hour: number; month: number } {
  const date = new Date(isoStr);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Oslo",
    hour: "numeric",
    hour12: false,
    weekday: "short",
    month: "numeric",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  const hour = parseInt(get("hour"), 10);
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = dayMap[get("weekday")] ?? 1;
  const month = parseInt(get("month"), 10) - 1;
  return { dayOfWeek, hour, month };
}

function getOsloDate(isoStr: string): Date {
  const d = new Date(isoStr);
  const osloStr = d.toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
  const [y, m, day] = osloStr.split("-").map(Number);
  return new Date(y, m - 1, day);
}

// --- Calendar (identical to compute-model) ---

function computeEasterSunday(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month - 1, day];
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getPublicHolidays(year: number): Date[] {
  const [em, ed] = computeEasterSunday(year);
  const easter = new Date(year, em, ed);
  const offset = (base: Date, days: number) => { const d = new Date(base); d.setDate(d.getDate() + days); return d; };
  return [
    new Date(year, 0, 1), offset(easter, -3), offset(easter, -2),
    easter, offset(easter, 1), new Date(year, 4, 1), new Date(year, 4, 17),
    offset(easter, 39), offset(easter, 49), offset(easter, 50),
    new Date(year, 11, 25), new Date(year, 11, 26),
  ];
}

function getPreHolidayKeys(year: number): Set<string> {
  const holidays = getPublicHolidays(year);
  const holidaySet = new Set(holidays.map(d => dateKey(d)));
  const keys = new Set<string>();
  for (const h of holidays) {
    const prev = new Date(h);
    prev.setDate(prev.getDate() - 1);
    const dow = prev.getDay();
    if (dow >= 1 && dow <= 5 && !holidaySet.has(dateKey(prev))) {
      keys.add(dateKey(prev));
    }
  }
  return keys;
}

function isSchoolBreak(date: Date): boolean {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  if ((month === 5 && day >= 20) || month === 6 || (month === 7 && day <= 18)) return true;
  if (month === 11 && day >= 21) return true;
  if (month === 0 && day <= 2) return true;
  const jan1 = new Date(year, 0, 1);
  const dayOfYear = Math.floor((date.getTime() - jan1.getTime()) / 86400000);
  const weekNum = Math.ceil((dayOfYear + jan1.getDay() + 1) / 7);
  if (weekNum === 8 || weekNum === 40) return true;
  return false;
}

type DayType = "public_holiday" | "pre_holiday" | "school_break" | "normal";

function classifyDayType(isoStr: string): DayType {
  const osloDate = getOsloDate(isoStr);
  const key = dateKey(osloDate);
  const year = osloDate.getFullYear();

  const holidays = getPublicHolidays(year);
  if (holidays.some(h => dateKey(h) === key)) return "public_holiday";

  const preKeys = getPreHolidayKeys(year);
  if (preKeys.has(key)) return "pre_holiday";

  if (isSchoolBreak(osloDate)) return "school_break";

  return "normal";
}

// --- Segments: cross day-type with time-of-day ---

type Segment =
  | "weekday_daytime"
  | "weekday_evening"
  | "weekend"
  | "public_holiday"
  | "pre_holiday"
  | "school_break";

function classifySegment(isoStr: string): Segment {
  const dayType = classifyDayType(isoStr);
  if (dayType === "public_holiday") return "public_holiday";
  if (dayType === "pre_holiday") return "pre_holiday";
  if (dayType === "school_break") return "school_break";

  const { dayOfWeek, hour } = getOsloTime(isoStr);
  if (dayOfWeek === 0 || dayOfWeek === 6) return "weekend";
  if (hour >= 7 && hour <= 18) return "weekday_daytime";
  return "weekday_evening";
}

// --- Prediction: matches compute-model decomposition ---

function predictVolume(weights: ModelWeights, stationId: string, isoStr: string): number {
  const { dayOfWeek, hour, month } = getOsloTime(isoStr);
  const base = weights.basePatterns[stationId]?.[dayOfWeek]?.[hour]?.median ?? 0;
  if (base === 0) return 0;

  const monthFactor = weights.monthFactors[month] ?? 1.0;

  const dayType = classifyDayType(isoStr);
  let holidayFactor = 1.0;
  if (dayType !== "normal") {
    holidayFactor = weights.holidayFactors[dayType] ?? 1.0;
  }

  return Math.round(base * monthFactor * holidayFactor);
}

// --- Metrics ---

function computeMAPE(actual: number[], predicted: number[]): number {
  let totalApe = 0;
  let count = 0;
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] < 10) continue;
    if (predicted[i] === 0) continue; // No base pattern -> skip, don't penalize
    totalApe += Math.abs(actual[i] - predicted[i]) / actual[i];
    count++;
  }
  return count > 0 ? (totalApe / count) * 100 : 0;
}

function computeMAE(actual: number[], predicted: number[]): number {
  const pairs = actual.map((a, i) => [a, predicted[i]]).filter(([a, p]) => a >= 10 && p > 0);
  if (pairs.length === 0) return 0;
  return Math.round(pairs.reduce((s, [a, p]) => s + Math.abs(a - p), 0) / pairs.length);
}

function computeMedianAPE(actual: number[], predicted: number[]): number {
  const apes: number[] = [];
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] < 10 || predicted[i] === 0) continue;
    apes.push(Math.abs(actual[i] - predicted[i]) / actual[i] * 100);
  }
  if (apes.length === 0) return 0;
  apes.sort((a, b) => a - b);
  const mid = Math.floor(apes.length / 2);
  return apes.length % 2 === 0 ? (apes[mid - 1] + apes[mid]) / 2 : apes[mid];
}

// --- Main ---

async function main(): Promise<void> {
  console.log("Validating model quality...\n");

  if (!fs.existsSync(WEIGHTS_PATH)) {
    console.error("model-weights.json ikke funnet. Kjør compute-model.ts først.");
    process.exit(1);
  }

  const weights: ModelWeights = JSON.parse(fs.readFileSync(WEIGHTS_PATH, "utf-8"));

  const files = fs.readdirSync(RAW_DIR).filter(f => f.endsWith(".json"));
  const allStations: StationHistory[] = files.map(f =>
    JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), "utf-8"))
  );

  // Last 4 months as test set
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - 4);
  const cutoff = cutoffDate.toISOString();

  const allSegments: Segment[] = [
    "weekday_daytime", "weekday_evening", "weekend",
    "public_holiday", "pre_holiday", "school_break",
  ];

  const segments: Record<Segment, { actual: number[]; predicted: number[] }> = {} as never;
  for (const s of allSegments) segments[s] = { actual: [], predicted: [] };

  const stationData: Record<string, { name: string; actual: number[]; predicted: number[] }> = {};

  let skippedNoBase = 0;

  for (const station of allStations) {
    const testRecords = station.records.filter(r => r.from >= cutoff);
    stationData[station.stationId] = { name: station.stationName, actual: [], predicted: [] };

    for (const rec of testRecords) {
      const predicted = predictVolume(weights, station.stationId, rec.from);
      if (predicted === 0) { skippedNoBase++; continue; }

      const segment = classifySegment(rec.from);

      segments[segment].actual.push(rec.volume);
      segments[segment].predicted.push(predicted);

      stationData[station.stationId].actual.push(rec.volume);
      stationData[station.stationId].predicted.push(predicted);
    }
  }

  // Thresholds
  const thresholds: Record<Segment, number> = {
    weekday_daytime: 12,
    weekday_evening: 20,
    weekend: 20,
    public_holiday: 30,
    pre_holiday: 20,
    school_break: 20,
  };

  const segmentNames: Record<Segment, string> = {
    weekday_daytime: "Ukedager 07-18",
    weekday_evening: "Ukedager kveld/natt",
    weekend: "Helger (normal)",
    public_holiday: "Helligdager",
    pre_holiday: "Dag før helligdag",
    school_break: "Skoleferie",
  };

  console.log("=== Segment-MAPE ===\n");
  console.log(`${"Segment".padEnd(24)} ${"N".padStart(6)} ${"MAPE%".padStart(7)} ${"MdAPE%".padStart(8)} ${"MAE".padStart(6)} ${"Mål%".padStart(6)} Status`);
  console.log("-".repeat(72));

  let allPass = true;

  for (const segment of allSegments) {
    const data = segments[segment];
    if (data.actual.length === 0) {
      console.log(`${segmentNames[segment].padEnd(24)} ${String(0).padStart(6)}       -        -      -      - N/A`);
      continue;
    }

    const mape = computeMAPE(data.actual, data.predicted);
    const mdape = computeMedianAPE(data.actual, data.predicted);
    const mae = computeMAE(data.actual, data.predicted);
    const threshold = thresholds[segment];
    const pass = mape <= threshold;
    if (!pass) allPass = false;

    console.log(
      `${segmentNames[segment].padEnd(24)} ${String(data.actual.length).padStart(6)} ${mape.toFixed(1).padStart(7)} ${mdape.toFixed(1).padStart(8)} ${String(mae).padStart(6)} ${`<${threshold}`.padStart(6)} ${pass ? "PASS" : "FAIL"}`
    );
  }

  console.log(`\nSkipped (no base pattern): ${skippedNoBase}`);

  console.log("\n=== Per-stasjon MAPE ===\n");
  for (const [id, data] of Object.entries(stationData)) {
    if (data.actual.length === 0) {
      console.log(`  ${data.name.padEnd(20)} N=    0  (ingen testdata)`);
      continue;
    }
    const mape = computeMAPE(data.actual, data.predicted);
    const mdape = computeMedianAPE(data.actual, data.predicted);
    console.log(`  ${data.name.padEnd(20)} N=${String(data.actual.length).padStart(5)}  MAPE=${mape.toFixed(1).padStart(5)}%  MdAPE=${mdape.toFixed(1).padStart(5)}%`);
  }

  // Sample size warnings
  console.log("\n=== Datadekning ===\n");
  for (const segment of allSegments) {
    const n = segments[segment].actual.length;
    if (n > 0 && n < 100) {
      console.log(`  ⚠ ${segmentNames[segment]}: kun ${n} samples - MAPE er ustabilt`);
    }
  }

  console.log(`\n=== Samlet resultat: ${allPass ? "PASS" : "FAIL"} ===`);
  if (!allPass) {
    const fails = allSegments.filter(s => {
      const d = segments[s];
      if (d.actual.length === 0) return false;
      return computeMAPE(d.actual, d.predicted) > thresholds[s];
    });
    console.log(`Segmenter over mål: ${fails.map(s => segmentNames[s]).join(", ")}`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
