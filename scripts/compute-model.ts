/**
 * Compute model weights from raw historical data.
 * Reads scripts/raw-history/*.json -> outputs src/data/model-weights.json
 *
 * Multiplicative decomposition:
 *   predicted = base[dow][hour] * monthFactor[month] * holidayFactor[type]
 *
 * Usage: npx tsx scripts/compute-model.ts
 */
import fs from "fs";
import path from "path";

// Import calendar utilities (relative path for script context)
// We inline the classify logic here to avoid tsx path issues with src/lib
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const RAW_DIR = path.join(SCRIPT_DIR, "raw-history");
const OUT_PATH = path.join(SCRIPT_DIR, "../src/data/model-weights.json");

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
  weeksCompleted: number[];
}

// --- Inline calendar logic (to avoid tsx import issues) ---

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

function getPublicHolidays(year: number): Date[] {
  const [em, ed] = computeEasterSunday(year);
  const easter = new Date(year, em, ed);
  const offset = (base: Date, days: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d;
  };
  return [
    new Date(year, 0, 1), offset(easter, -3), offset(easter, -2),
    easter, offset(easter, 1), new Date(year, 4, 1), new Date(year, 4, 17),
    offset(easter, 39), offset(easter, 49), offset(easter, 50),
    new Date(year, 11, 25), new Date(year, 11, 26),
  ];
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

  // Summer: June 20 - Aug 18
  if ((month === 5 && day >= 20) || month === 6 || (month === 7 && day <= 18)) return true;

  // Christmas: Dec 21 - Jan 2
  if (month === 11 && day >= 21) return true;
  if (month === 0 && day <= 2) return true;

  // Week 8 and 40 approximate check
  const jan1 = new Date(year, 0, 1);
  const dayOfYear = Math.floor((date.getTime() - jan1.getTime()) / 86400000);
  const weekNum = Math.ceil((dayOfYear + jan1.getDay() + 1) / 7);
  if (weekNum === 8 || weekNum === 40) return true;

  return false;
}

type DayType = "public_holiday" | "pre_holiday" | "school_break" | "normal";

function classifyDateFromTimestamp(isoStr: string): DayType {
  const d = new Date(isoStr);
  // Use Oslo timezone
  const osloStr = d.toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
  const [y, m, day] = osloStr.split("-").map(Number);
  const osloDate = new Date(y, m - 1, day);

  const key = dateKey(osloDate);
  const year = osloDate.getFullYear();

  const holidays = getPublicHolidays(year);
  if (holidays.some(h => dateKey(h) === key)) return "public_holiday";

  const preKeys = getPreHolidayKeys(year);
  if (preKeys.has(key)) return "pre_holiday";

  if (isSchoolBreak(osloDate)) return "school_break";

  return "normal";
}

// --- Oslo time parsing ---

function getOsloTime(isoStr: string): { dayOfWeek: number; hour: number; month: number; dateKey: string } {
  const date = new Date(isoStr);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Oslo",
    hour: "numeric",
    hour12: false,
    weekday: "short",
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";

  const hour = parseInt(get("hour"), 10);
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = dayMap[get("weekday")] ?? 1;
  const month = parseInt(get("month"), 10) - 1; // 0-indexed

  const y = get("year");
  const m = get("month").padStart(2, "0");
  const d = get("day").padStart(2, "0");

  return { dayOfWeek, hour, month, dateKey: `${y}-${m}-${d}` };
}

// --- Statistics ---

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return Math.round(sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower));
}

function mean(values: number[]): number {
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

// --- Main computation ---

interface BaseSlot {
  values: number[];
}

interface MonthBucket {
  totalVolume: number;
  count: number;
}

interface HolidayBucket {
  actualVolumes: number[];
  expectedBases: number[];
}

async function main(): Promise<void> {
  console.log("Computing model weights from raw history...\n");

  // Load all station data
  const files = fs.readdirSync(RAW_DIR).filter(f => f.endsWith(".json"));
  if (files.length === 0) {
    console.error("Ingen rå historikk funnet. Kjør fetch-history.ts først.");
    process.exit(1);
  }

  const allStations: StationHistory[] = files.map(f =>
    JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), "utf-8"))
  );

  console.log(`Laster ${allStations.length} stasjoner, ${allStations.reduce((s, h) => s + h.records.length, 0)} timer totalt.\n`);

  // Phase 1: Base patterns per (station, dayOfWeek, hour) - only normal days
  const basePatterns: Record<string, Record<number, Record<number, {
    median: number; mean: number; sampleCount: number; p25: number; p75: number;
  }>>> = {};

  // Phase 2: Month factors (across all stations)
  const monthBuckets: Record<number, MonthBucket> = {};
  for (let m = 0; m < 12; m++) monthBuckets[m] = { totalVolume: 0, count: 0 };

  // Phase 3: Holiday factors
  const holidayBuckets: Record<string, HolidayBucket> = {
    public_holiday: { actualVolumes: [], expectedBases: [] },
    pre_holiday: { actualVolumes: [], expectedBases: [] },
    school_break: { actualVolumes: [], expectedBases: [] },
  };

  // First pass: collect base patterns (normal days only)
  const baseSlots: Record<string, Record<number, Record<number, BaseSlot>>> = {};

  for (const station of allStations) {
    baseSlots[station.stationId] = {};

    for (const rec of station.records) {
      const { dayOfWeek, hour, month } = getOsloTime(rec.from);
      const dayType = classifyDateFromTimestamp(rec.from);

      // Month factors use ALL data
      monthBuckets[month].totalVolume += rec.volume;
      monthBuckets[month].count++;

      // Base patterns: only normal days
      if (dayType === "normal") {
        if (!baseSlots[station.stationId][dayOfWeek]) {
          baseSlots[station.stationId][dayOfWeek] = {};
        }
        if (!baseSlots[station.stationId][dayOfWeek][hour]) {
          baseSlots[station.stationId][dayOfWeek][hour] = { values: [] };
        }
        baseSlots[station.stationId][dayOfWeek][hour].values.push(rec.volume);
      }
    }
  }

  // Compute base patterns
  for (const [stationId, days] of Object.entries(baseSlots)) {
    basePatterns[stationId] = {};
    for (const [dow, hours] of Object.entries(days)) {
      const d = parseInt(dow, 10);
      basePatterns[stationId][d] = {};
      for (const [h, slot] of Object.entries(hours)) {
        const hr = parseInt(h, 10);
        const vals = slot.values;
        if (vals.length === 0) continue;
        basePatterns[stationId][d][hr] = {
          median: median(vals),
          mean: mean(vals),
          sampleCount: vals.length,
          p25: percentile(vals, 25),
          p75: percentile(vals, 75),
        };
      }
    }
  }

  // Compute month factors
  const totalAvg = Object.values(monthBuckets).reduce((s, b) => s + (b.count > 0 ? b.totalVolume / b.count : 0), 0) / 12;
  const monthFactors: Record<number, number> = {};
  for (let m = 0; m < 12; m++) {
    const mAvg = monthBuckets[m].count > 0 ? monthBuckets[m].totalVolume / monthBuckets[m].count : totalAvg;
    monthFactors[m] = parseFloat((mAvg / totalAvg).toFixed(3));
  }

  // Second pass: compute holiday factors
  for (const station of allStations) {
    for (const rec of station.records) {
      const dayType = classifyDateFromTimestamp(rec.from);
      if (dayType === "normal") continue;

      const { dayOfWeek, hour } = getOsloTime(rec.from);
      const baseMedian = basePatterns[station.stationId]?.[dayOfWeek]?.[hour]?.median;
      if (!baseMedian || baseMedian < 10) continue;

      const bucket = holidayBuckets[dayType];
      if (bucket) {
        bucket.actualVolumes.push(rec.volume);
        bucket.expectedBases.push(baseMedian);
      }
    }
  }

  // Compute holiday factors as ratio of actual/expected
  const holidayFactors: Record<string, number> = {};
  for (const [type, bucket] of Object.entries(holidayBuckets)) {
    if (bucket.actualVolumes.length === 0) {
      holidayFactors[type] = 1.0;
      continue;
    }
    const totalActual = bucket.actualVolumes.reduce((s, v) => s + v, 0);
    const totalExpected = bucket.expectedBases.reduce((s, v) => s + v, 0);
    holidayFactors[type] = parseFloat((totalActual / totalExpected).toFixed(3));
  }

  // Build output
  const modelWeights = {
    basePatterns,
    monthFactors,
    holidayFactors,
    metadata: {
      generatedAt: new Date().toISOString(),
      weeksOfData: Math.max(...allStations.map(s => s.weeksCompleted.length)),
      stationCount: allStations.length,
    },
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(modelWeights, null, 2));
  const sizeMB = (fs.statSync(OUT_PATH).size / 1024).toFixed(1);
  console.log(`\n=== Model weights ===`);
  console.log(`Fil: ${OUT_PATH} (${sizeMB} KB)`);
  console.log(`Stasjoner: ${allStations.length}`);
  console.log(`Månedsfaktorer: ${JSON.stringify(monthFactors)}`);
  console.log(`Helligdagsfaktorer: ${JSON.stringify(holidayFactors)}`);
  console.log(`\nNeste steg: npx tsx scripts/validate-model.ts`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
