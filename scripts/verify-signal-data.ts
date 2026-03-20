/**
 * Verify signal station data quality after fetch-history.
 * Checks coverage, gaps, seasonal distribution, and usability for ML features.
 *
 * Usage: npx tsx scripts/verify-signal-data.ts
 */
import fs from "fs";
import path from "path";

const RAW_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "raw-history");

const SIGNAL_IDS: Record<string, { name: string; corridor: string }> = {
  "48148V1175464": { name: "Horten RV19 nord", corridor: "horten_rv19" },
  "37692V1827282": { name: "Horten RV19 sor", corridor: "horten_rv19" },
  "65271V443150": { name: "Vestby syd (E6)", corridor: "e6_nord" },
  "12554V971778": { name: "Jonsten (E6 sor)", corridor: "e6_sor" },
  "65179V1209937": { name: "Solli (E6 sor)", corridor: "e6_sor" },
  "37187V971514": { name: "Halmstad sor (Larkollen)", corridor: "larkollen" },
};

// Also check core stations for comparison
const CORE_IDS = [
  "40641V971605",
  "39666V971386",
  "72867V971385",
  "69994V971384",
  "76208V971383",
  "28495V971383",
  "40488V971307",
  "15322V971307",
  "26266V443149",
  "59044V971518",
];

interface HourRecord {
  from: string;
  to: string;
  volume: number;
  coverage: number;
}

interface StationHistory {
  stationId: string;
  stationName: string;
  weeksCompleted: number[];
  records: HourRecord[];
}

interface StationReport {
  stationId: string;
  name: string;
  corridor: string;
  totalRecords: number;
  weeksCompleted: number;
  coverageAvg: number;
  coverageSub80: number; // % of records with coverage < 80
  dateRange: { first: string; last: string } | null;
  monthDistribution: Record<number, number>; // month -> count
  hourDistribution: Record<number, number>; // hour -> count
  gapDays: number; // days with zero records
  weekdayDistribution: Record<number, number>; // 0=Sun..6=Sat -> count
  volumeStats: { min: number; max: number; mean: number; median: number };
  usable: boolean;
  issues: string[];
}

function loadStation(stationId: string): StationHistory | null {
  const filePath = path.join(RAW_DIR, `${stationId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function analyzeStation(
  stationId: string,
  meta: { name: string; corridor: string }
): StationReport {
  const data = loadStation(stationId);
  const issues: string[] = [];

  if (!data || data.records.length === 0) {
    return {
      stationId,
      name: meta.name,
      corridor: meta.corridor,
      totalRecords: 0,
      weeksCompleted: 0,
      coverageAvg: 0,
      coverageSub80: 100,
      dateRange: null,
      monthDistribution: {},
      hourDistribution: {},
      gapDays: 0,
      weekdayDistribution: {},
      volumeStats: { min: 0, max: 0, mean: 0, median: 0 },
      usable: false,
      issues: ["NO DATA"],
    };
  }

  const records = data.records;
  const volumes = records.map((r) => r.volume).sort((a, b) => a - b);
  const coverages = records.map((r) => r.coverage);

  // Date range
  const dates = records.map((r) => r.from).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];

  // Month distribution
  const monthDist: Record<number, number> = {};
  const hourDist: Record<number, number> = {};
  const weekdayDist: Record<number, number> = {};
  const daySet = new Set<string>();

  for (const rec of records) {
    const dt = new Date(rec.from);
    const m = dt.getMonth();
    const h = dt.getHours();
    const dow = dt.getDay();
    const dayKey = rec.from.slice(0, 10);

    monthDist[m] = (monthDist[m] || 0) + 1;
    hourDist[h] = (hourDist[h] || 0) + 1;
    weekdayDist[dow] = (weekdayDist[dow] || 0) + 1;
    daySet.add(dayKey);
  }

  // Gap analysis: how many days in the range have zero records?
  const firstDate = new Date(first);
  const lastDate = new Date(last);
  const totalDaysInRange =
    Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const gapDays = totalDaysInRange - daySet.size;

  // Coverage stats
  const coverageAvg = coverages.reduce((a, b) => a + b, 0) / coverages.length;
  const coverageSub80 = (coverages.filter((c) => c < 80).length / coverages.length) * 100;

  // Volume stats
  const mean = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const median = volumes[Math.floor(volumes.length / 2)];

  // Usability checks
  if (records.length < 1000) issues.push(`LOW_RECORDS: ${records.length} (need 1000+)`);
  if (coverageAvg < 70) issues.push(`LOW_COVERAGE: avg ${coverageAvg.toFixed(1)}%`);
  if (gapDays / totalDaysInRange > 0.3)
    issues.push(
      `HIGH_GAPS: ${gapDays}/${totalDaysInRange} days missing (${((gapDays / totalDaysInRange) * 100).toFixed(0)}%)`
    );

  // Check seasonal balance: every month should have some data
  const emptyMonths = Array.from({ length: 12 }, (_, i) => i).filter((m) => !monthDist[m]);
  if (emptyMonths.length > 2) issues.push(`SPARSE_MONTHS: missing months ${emptyMonths.join(",")}`);

  // Check hour coverage: need data across all hours
  const emptyHours = Array.from({ length: 24 }, (_, i) => i).filter((h) => !hourDist[h]);
  if (emptyHours.length > 0) issues.push(`MISSING_HOURS: ${emptyHours.join(",")}`);

  return {
    stationId,
    name: meta.name,
    corridor: meta.corridor,
    totalRecords: records.length,
    weeksCompleted: data.weeksCompleted.length,
    coverageAvg,
    coverageSub80,
    dateRange: { first: first.slice(0, 10), last: last.slice(0, 10) },
    monthDistribution: monthDist,
    hourDistribution: hourDist,
    gapDays,
    weekdayDistribution: weekdayDist,
    volumeStats: { min: volumes[0], max: volumes[volumes.length - 1], mean, median },
    usable: issues.length === 0,
    issues,
  };
}

function printReport(report: StationReport): void {
  const status = report.usable ? "OK" : "ISSUES";
  const badge = report.usable ? "[OK]" : "[!!]";

  console.log(`\n${badge} ${report.name} (${report.stationId}) [${report.corridor}]`);

  if (report.totalRecords === 0) {
    console.log("   NO DATA FOUND");
    return;
  }

  console.log(`   Records: ${report.totalRecords} | Weeks: ${report.weeksCompleted}/104`);
  console.log(`   Range: ${report.dateRange?.first} - ${report.dateRange?.last}`);
  console.log(
    `   Coverage: avg ${report.coverageAvg.toFixed(1)}% | <80%: ${report.coverageSub80.toFixed(1)}%`
  );
  console.log(
    `   Volume: min=${report.volumeStats.min} max=${report.volumeStats.max} mean=${Math.round(report.volumeStats.mean)} median=${report.volumeStats.median}`
  );
  console.log(
    `   Gap days: ${report.gapDays} (${report.dateRange ? ((report.gapDays / (Math.ceil((new Date(report.dateRange.last).getTime() - new Date(report.dateRange.first).getTime()) / (1000 * 60 * 60 * 24)) + 1)) * 100).toFixed(0) : 0}%)`
  );

  // Month histogram (compact)
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const monthLine = months.map((m, i) => `${m}:${report.monthDistribution[i] || 0}`).join(" ");
  console.log(`   Months: ${monthLine}`);

  if (report.issues.length > 0) {
    console.log(`   Issues: ${report.issues.join(", ")}`);
  }
}

function main(): void {
  console.log("=== Signal Station Data Quality Report ===\n");

  // Signal stations
  console.log("--- SIGNAL STATIONS ---");
  const signalReports: StationReport[] = [];
  for (const [id, meta] of Object.entries(SIGNAL_IDS)) {
    const report = analyzeStation(id, meta);
    signalReports.push(report);
    printReport(report);
  }

  // Reference: one core station for comparison
  console.log("\n--- REFERENCE (Kanalbrua, core) ---");
  const refReport = analyzeStation("40641V971605", { name: "Kanalbrua", corridor: "core" });
  printReport(refReport);

  // Summary
  console.log("\n\n=== SUMMARY ===");
  const usable = signalReports.filter((r) => r.usable);
  const unusable = signalReports.filter((r) => !r.usable);

  console.log(`Usable: ${usable.length}/${signalReports.length}`);
  if (unusable.length > 0) {
    console.log(`Unusable:`);
    for (const r of unusable) {
      console.log(`  - ${r.name}: ${r.issues.join(", ")}`);
    }
  }

  // Corridor readiness
  const corridors = new Map<string, StationReport[]>();
  for (const r of signalReports) {
    if (!corridors.has(r.corridor)) corridors.set(r.corridor, []);
    corridors.get(r.corridor)!.push(r);
  }

  console.log("\nCorridor readiness:");
  for (const [corridor, reports] of corridors) {
    const ready = reports.filter((r) => r.usable).length;
    const total = reports.length;
    const status = ready === total ? "READY" : ready > 0 ? "PARTIAL" : "NOT READY";
    console.log(`  ${corridor}: ${status} (${ready}/${total})`);
  }
}

main();
