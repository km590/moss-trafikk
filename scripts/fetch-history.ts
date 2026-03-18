/**
 * Fetch 2 years (104 weeks) of hourly traffic data for all 10 stations.
 * Saves raw data to scripts/raw-history/{stationId}.json (gitignored).
 * Supports resume: skips weeks that already have data.
 *
 * Usage: npx tsx scripts/fetch-history.ts
 */
import fs from "fs";
import path from "path";

const API_URL = "https://trafikkdata-api.atlas.vegvesen.no/";
const WEEKS_BACK = 104;
const MIN_COVERAGE = 50;
const DELAY_MS = 500;

const STATION_IDS = [
  "40641V971605", // Kanalbrua
  "39666V971386", // Østre Kanalgate
  "72867V971385", // Rådhusbrua
  "69994V971384", // Vogts gate
  "76208V971383", // Mosseelva
  "28495V971383", // Patterød vest
  "40488V971307", // Patterød sør
  "15322V971307", // Storebaug
  "26266V443149", // E6 Nye Moss Nord
  "59044V971518", // Fjordveien
];

const STATION_NAMES: Record<string, string> = {
  "40641V971605": "Kanalbrua",
  "39666V971386": "Østre Kanalgate",
  "72867V971385": "Rådhusbrua",
  "69994V971384": "Vogts gate",
  "76208V971383": "Mosseelva",
  "28495V971383": "Patterød vest",
  "40488V971307": "Patterød sør",
  "15322V971307": "Storebaug",
  "26266V443149": "E6 Nye Moss Nord",
  "59044V971518": "Fjordveien",
};

interface HourRecord {
  from: string;
  to: string;
  volume: number;
  coverage: number;
}

interface StationHistory {
  stationId: string;
  stationName: string;
  fetchedAt: string;
  weeksCompleted: number[];
  records: HourRecord[];
}

interface ApiResponse {
  data?: {
    trafficData?: {
      volume?: {
        byHour?: {
          edges: Array<{
            node: {
              from: string;
              to: string;
              total: {
                volumeNumbers: { volume: number } | null;
                coverage: { percentage: number } | null;
              } | null;
            };
          }>;
        };
      };
    };
  };
  errors?: Array<{ message: string }>;
}

const RAW_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "raw-history");

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format a date as midnight in Europe/Oslo with correct UTC offset.
 * Uses Intl API to derive the real offset, avoiding CET/CEST heuristics.
 *
 * Vegvesen API uses ZonedDateTime: from is inclusive, to is exclusive.
 * "from=Mon 00:00, to=Thu 00:00" returns Mon+Tue+Wed (72 hours).
 */
function toOsloMidnight(date: Date): string {
  // Get the Oslo date string
  const osloDate = date.toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });

  // Derive the actual UTC offset for this date in Oslo
  // Create a date at noon Oslo time to avoid DST edge cases
  const probe = new Date(`${osloDate}T12:00:00`);
  const utcStr = probe.toLocaleString("en-US", { timeZone: "UTC", hour12: false });
  const osloStr = probe.toLocaleString("en-US", { timeZone: "Europe/Oslo", hour12: false });
  const utcHour = parseInt(utcStr.split(",")[1].trim().split(":")[0], 10);
  const osloHour = parseInt(osloStr.split(",")[1].trim().split(":")[0], 10);
  const offsetHours = osloHour - utcHour;
  const sign = offsetHours >= 0 ? "+" : "-";
  const abs = Math.abs(offsetHours);
  const offset = `${sign}${String(abs).padStart(2, "0")}:00`;

  return `${osloDate}T00:00:00${offset}`;
}

/**
 * Split a week into two half-week chunks (Mon-Thu, Thu-Mon).
 * Vegvesen API caps at 100 edges per query (< 5 full days).
 * Two 3.5-day queries cover the full 7 days.
 */
function weekBounds(weeksAgo: number): { from: string; to: string }[] {
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() - weeksAgo * 7);
  weekEnd.setHours(0, 0, 0, 0);

  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekStart.getDate() - 7);

  const midpoint = new Date(weekStart);
  midpoint.setDate(midpoint.getDate() + 4); // First 4 days, then remaining 3

  return [
    { from: toOsloMidnight(weekStart), to: toOsloMidnight(midpoint) },
    { from: toOsloMidnight(midpoint), to: toOsloMidnight(weekEnd) },
  ];
}

function buildQuery(stationId: string, from: string, to: string): string {
  return JSON.stringify({
    query: `query ($id: String!, $from: ZonedDateTime!, $to: ZonedDateTime!) {
  trafficData(trafficRegistrationPointId: $id) {
    volume {
      byHour(from: $from, to: $to) {
        edges {
          node {
            from
            to
            total {
              volumeNumbers { volume }
              coverage { percentage }
            }
          }
        }
      }
    }
  }
}`,
    variables: { id: stationId, from, to },
  });
}

async function fetchWeek(stationId: string, from: string, to: string): Promise<HourRecord[]> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: buildQuery(stationId, from, to),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json: ApiResponse = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);

  const edges = json.data?.trafficData?.volume?.byHour?.edges ?? [];
  return edges
    .filter((e) => {
      const cov = e.node.total?.coverage?.percentage ?? 0;
      return cov >= MIN_COVERAGE && e.node.total?.volumeNumbers?.volume != null;
    })
    .map((e) => ({
      from: e.node.from,
      to: e.node.to,
      volume: e.node.total!.volumeNumbers!.volume,
      coverage: e.node.total!.coverage!.percentage,
    }));
}

function loadExisting(stationId: string): StationHistory {
  const filePath = path.join(RAW_DIR, `${stationId}.json`);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }
  return {
    stationId,
    stationName: STATION_NAMES[stationId] ?? stationId,
    fetchedAt: new Date().toISOString(),
    weeksCompleted: [],
    records: [],
  };
}

function saveHistory(history: StationHistory): void {
  const filePath = path.join(RAW_DIR, `${history.stationId}.json`);
  history.fetchedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
}

async function processStation(stationId: string): Promise<void> {
  const name = STATION_NAMES[stationId] ?? stationId;
  const history = loadExisting(stationId);
  const completed = new Set(history.weeksCompleted);
  let newRecords = 0;

  for (let w = 1; w <= WEEKS_BACK; w++) {
    if (completed.has(w)) continue;

    const chunks = weekBounds(w);
    const weekLabel = `uke ${w}/${WEEKS_BACK} (${chunks[0].from.slice(0, 10)})`;
    let weekRecords = 0;

    try {
      for (const chunk of chunks) {
        const records = await fetchWeek(stationId, chunk.from, chunk.to);
        history.records.push(...records);
        weekRecords += records.length;
        await sleep(DELAY_MS);
      }
      history.weeksCompleted.push(w);
      newRecords += weekRecords;
      console.log(`  ${name}: ${weekLabel} -> ${weekRecords} timer`);
    } catch (err) {
      console.error(`  ${name}: ${weekLabel} FEIL: ${(err as Error).message}`);
    }

    await sleep(DELAY_MS);

    // Save every 10 weeks for resume safety
    if (w % 10 === 0) saveHistory(history);
  }

  saveHistory(history);
  console.log(`  ${name}: ferdig. ${newRecords} nye, ${history.records.length} totalt.`);
}

async function main(): Promise<void> {
  ensureDir(RAW_DIR);
  console.log(`Henter ${WEEKS_BACK} uker historikk for ${STATION_IDS.length} stasjoner...\n`);
  console.log("Rå data lagres i scripts/raw-history/ (gitignored)\n");

  for (const stationId of STATION_IDS) {
    console.log(`\n--- ${STATION_NAMES[stationId]} (${stationId}) ---`);
    await processStation(stationId);
  }

  // Summary
  let totalRecords = 0;
  let totalSize = 0;
  for (const stationId of STATION_IDS) {
    const filePath = path.join(RAW_DIR, `${stationId}.json`);
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      totalSize += stat.size;
      const h = JSON.parse(fs.readFileSync(filePath, "utf-8")) as StationHistory;
      totalRecords += h.records.length;
    }
  }

  console.log(`\n=== FERDIG ===`);
  console.log(`Totalt: ${totalRecords} timer, ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Neste steg: npx tsx scripts/compute-model.ts`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
