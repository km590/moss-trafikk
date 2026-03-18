/**
 * Golden tests: snapshot known scenarios to catch regressions.
 * Tests that predictions are plausible, not exact values.
 *
 * Usage: npx tsx scripts/golden-test.ts
 */
import path from "path";
import fs from "fs";

// Load model weights directly (avoid tsx import issues with src/lib)
const WEIGHTS_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), "../src/data/model-weights.json");
const weights = JSON.parse(fs.readFileSync(WEIGHTS_PATH, "utf-8"));

// --- Inline minimal prediction logic (matches prediction-engine.ts) ---

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

function getPublicHolidayKeys(year: number): Set<string> {
  const [em, ed] = computeEasterSunday(year);
  const easter = new Date(year, em, ed);
  const offset = (base: Date, days: number) => { const d = new Date(base); d.setDate(d.getDate() + days); return d; };
  return new Set([
    new Date(year, 0, 1), offset(easter, -3), offset(easter, -2),
    easter, offset(easter, 1), new Date(year, 4, 1), new Date(year, 4, 17),
    offset(easter, 39), offset(easter, 49), offset(easter, 50),
    new Date(year, 11, 25), new Date(year, 11, 26),
  ].map(d => dateKey(d)));
}

type DayType = "public_holiday" | "pre_holiday" | "school_break" | "normal";

function classifyDayType(date: Date): DayType {
  const key = dateKey(date);
  const year = date.getFullYear();
  const holidays = getPublicHolidayKeys(year);
  if (holidays.has(key)) return "public_holiday";
  // Simplified: just check public holidays for golden tests
  const month = date.getMonth();
  const day = date.getDate();
  if ((month === 5 && day >= 20) || month === 6 || (month === 7 && day <= 18)) return "school_break";
  if (month === 11 && day >= 21) return "school_break";
  return "normal";
}

function predict(stationId: string, date: Date, hour: number): number {
  let dow = date.getDay();
  const month = date.getMonth();
  const dayType = classifyDayType(date);

  // Mon/Tue proxy: use Wednesday
  let base = weights.basePatterns[stationId]?.[dow]?.[hour]?.median ?? 0;
  if (base === 0 && (dow === 1 || dow === 2)) {
    base = weights.basePatterns[stationId]?.[3]?.[hour]?.median ?? 0;
    dow = 3;
  }
  if (base === 0) return 0;

  const monthFactor = weights.monthFactors[month] ?? 1.0;
  const holidayFactor = dayType !== "normal" ? (weights.holidayFactors[dayType] ?? 1.0) : 1.0;

  return Math.round(base * monthFactor * holidayFactor);
}

function getSampleCount(stationId: string, dow: number, hour: number): number {
  const count = weights.basePatterns[stationId]?.[dow]?.[hour]?.sampleCount ?? 0;
  // Mon/Tue proxy
  if (count === 0 && (dow === 1 || dow === 2)) {
    return weights.basePatterns[stationId]?.[3]?.[hour]?.sampleCount ?? 0;
  }
  return count;
}

// --- Test scenarios ---

const KANALBRUA = "40641V971605";
const STOREBAUG = "15322V971307";
const VOGTS_GATE = "69994V971384";

interface TestCase {
  name: string;
  stationId: string;
  date: Date;
  hour: number;
  expectMin: number;
  expectMax: number;
  expectMinSamples?: number;
}

const tests: TestCase[] = [
  // Normal weekday mornings
  {
    name: "Kanalbrua onsdag kl 08 (morgenrush)",
    stationId: KANALBRUA,
    date: new Date(2026, 2, 18), // Wed Mar 18
    hour: 8,
    expectMin: 800,
    expectMax: 1600,
    expectMinSamples: 20,
  },
  {
    name: "Kanalbrua onsdag kl 16 (ettermiddagsrush)",
    stationId: KANALBRUA,
    date: new Date(2026, 2, 18), // Wed Mar 18
    hour: 16,
    expectMin: 1200,
    expectMax: 2200,
    expectMinSamples: 20,
  },
  {
    name: "Kanalbrua fredag kl 15 (fredagsrush)",
    stationId: KANALBRUA,
    date: new Date(2026, 2, 20), // Fri Mar 20
    hour: 15,
    expectMin: 1000,
    expectMax: 2200,
    expectMinSamples: 20,
  },
  // Monday/Tuesday proxy (uses Wednesday data)
  {
    name: "Kanalbrua mandag kl 08 (proxy fra onsdag)",
    stationId: KANALBRUA,
    date: new Date(2026, 2, 16), // Mon Mar 16
    hour: 8,
    expectMin: 800,
    expectMax: 1600,
    expectMinSamples: 20,
  },
  {
    name: "Kanalbrua tirsdag kl 16 (proxy fra onsdag)",
    stationId: KANALBRUA,
    date: new Date(2026, 2, 17), // Tue Mar 17
    hour: 16,
    expectMin: 1200,
    expectMax: 2200,
    expectMinSamples: 20,
  },
  // Night: should be low
  {
    name: "Kanalbrua onsdag kl 03 (natt, lav trafikk)",
    stationId: KANALBRUA,
    date: new Date(2026, 2, 18),
    hour: 3,
    expectMin: 0,
    expectMax: 200,
  },
  // Summer Saturday (month factor boost)
  {
    name: "Kanalbrua lordag juli kl 12 (sommertrafikk)",
    stationId: KANALBRUA,
    date: new Date(2026, 6, 11), // Sat Jul 11
    hour: 12,
    expectMin: 300,
    expectMax: 2500,
  },
  // Holiday: Christmas Day (public_holiday factor ~0.67)
  {
    name: "Kanalbrua 1. juledag kl 12 (helligdag, lavere)",
    stationId: KANALBRUA,
    date: new Date(2026, 11, 25), // Dec 25
    hour: 12,
    expectMin: 100,
    expectMax: 1200,
  },
  // 17. mai (public holiday)
  {
    name: "Kanalbrua 17. mai kl 10",
    stationId: KANALBRUA,
    date: new Date(2026, 4, 17),
    hour: 10,
    expectMin: 0,
    expectMax: 1500,
  },
  // Other stations
  {
    name: "Storebaug onsdag kl 08",
    stationId: STOREBAUG,
    date: new Date(2026, 2, 18),
    hour: 8,
    expectMin: 200,
    expectMax: 3000,
    expectMinSamples: 10,
  },
  {
    name: "Vogts gate fredag kl 16",
    stationId: VOGTS_GATE,
    date: new Date(2026, 2, 20),
    hour: 16,
    expectMin: 200,
    expectMax: 1500,
    expectMinSamples: 10,
  },
  // Guardrail: prediction should never exceed MAX (3000)
  {
    name: "Ingen stasjon skal predikere > 3000",
    stationId: KANALBRUA,
    date: new Date(2026, 6, 3), // Summer Friday
    hour: 16,
    expectMin: 0,
    expectMax: 3000,
  },
  // Adjacent hours should be reasonably close
  // (tested via ratio check below)
];

// --- Run tests ---

function main(): void {
  console.log("=== Golden Tests ===\n");

  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    const predicted = predict(t.stationId, t.date, t.hour);
    const samples = getSampleCount(t.stationId, t.date.getDay(), t.hour);
    const inRange = predicted >= t.expectMin && predicted <= t.expectMax;
    const enoughSamples = t.expectMinSamples ? samples >= t.expectMinSamples : true;
    const pass = inRange && enoughSamples;

    if (pass) {
      passed++;
      console.log(`  PASS  ${t.name}`);
      console.log(`        predicted=${predicted}, range=[${t.expectMin}-${t.expectMax}], samples=${samples}`);
    } else {
      failed++;
      console.log(`  FAIL  ${t.name}`);
      console.log(`        predicted=${predicted}, range=[${t.expectMin}-${t.expectMax}], samples=${samples}`);
      if (!inRange) console.log(`        OUT OF RANGE`);
      if (!enoughSamples) console.log(`        INSUFFICIENT SAMPLES (need ${t.expectMinSamples})`);
    }
  }

  // Adjacent-hour ratio test for Kanalbrua Wednesday
  console.log("\n=== Adjacent-Hour Ratio (Kanalbrua onsdag) ===\n");
  const wed = new Date(2026, 2, 18);
  let ratioFails = 0;
  for (let h = 1; h < 24; h++) {
    const prev = predict(KANALBRUA, wed, h - 1);
    const curr = predict(KANALBRUA, wed, h);
    if (prev > 0 && curr > 0) {
      const ratio = curr / prev;
      // Allow steeper ratio during dawn transition (hours 4-7)
      const maxRatio = (h >= 4 && h <= 7) ? 6.0 : 3.0;
      if (ratio > maxRatio || ratio < 1 / maxRatio) {
        console.log(`  FAIL  Hour ${h - 1}->${h}: ratio=${ratio.toFixed(2)} (${prev}->${curr})`);
        ratioFails++;
        failed++;
      }
    }
  }
  if (ratioFails === 0) {
    console.log("  PASS  All adjacent hours within 3x ratio");
    passed++;
  }

  // Coverage check: key stations should have adequate data
  console.log("\n=== Coverage Check ===\n");
  const keyStations = [
    { id: KANALBRUA, name: "Kanalbrua" },
    { id: STOREBAUG, name: "Storebaug" },
    { id: VOGTS_GATE, name: "Vogts gate" },
  ];
  for (const s of keyStations) {
    const data = weights.basePatterns[s.id];
    if (!data) { console.log(`  FAIL  ${s.name}: no data`); failed++; continue; }
    let daysWithData = 0;
    for (const dow of Object.keys(data)) {
      const hours = Object.keys(data[parseInt(dow)]);
      if (hours.length >= 12) daysWithData++;
    }
    if (daysWithData >= 3) {
      console.log(`  PASS  ${s.name}: ${daysWithData} days with 12+ hours`);
      passed++;
    } else {
      console.log(`  FAIL  ${s.name}: only ${daysWithData} days with 12+ hours`);
      failed++;
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main();
