import fs from "fs";
import path from "path";

const API_URL = "https://trafikkdata-api.atlas.vegvesen.no/";

const STATION_IDS = [
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

const WEEKS_BACK = 10;
const MIN_COVERAGE = 80;
const DELAY_MS = 500;

interface HourNode {
  from: string;
  to: string;
  total: {
    volumeNumbers: { volume: number } | null;
    coverage: { percentage: number } | null;
  } | null;
}

interface ApiResponse {
  data?: {
    trafficData?: {
      volume?: {
        byHour?: {
          edges: Array<{ node: HourNode }>;
        };
      };
    };
  };
  errors?: Array<{ message: string }>;
}

type SlotSamples = Record<string, Record<string, number[]>>;

function buildQuery(stationId: string, from: string, to: string): string {
  return JSON.stringify({
    query: `{
  trafficData(trafficRegistrationPointId: "${stationId}") {
    volume {
      byHour(from: "${from}", to: "${to}") {
        edges {
          node {
            from
            to
            total {
              volumeNumbers {
                volume
              }
              coverage {
                percentage
              }
            }
          }
        }
      }
    }
  }
}`,
  });
}

function isoWeekBounds(weeksAgo: number): { from: string; to: string } {
  const now = new Date();
  const to = new Date(now);
  to.setDate(to.getDate() - weeksAgo * 7);
  to.setHours(0, 0, 0, 0);

  const from = new Date(to);
  from.setDate(from.getDate() - 7);

  return {
    from: from.toISOString().replace(".000Z", "Z"),
    to: to.toISOString().replace(".000Z", "Z"),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWeek(
  stationId: string,
  from: string,
  to: string
): Promise<HourNode[]> {
  const body = buildQuery(stationId, from, to);

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${stationId} ${from}`);
  }

  const json: ApiResponse = await res.json();

  if (json.errors && json.errors.length > 0) {
    throw new Error(
      `GraphQL errors for ${stationId}: ${json.errors.map((e) => e.message).join(", ")}`
    );
  }

  return (
    json.data?.trafficData?.volume?.byHour?.edges?.map((e) => e.node) ?? []
  );
}

function addToSamples(samples: SlotSamples, nodes: HourNode[]): void {
  for (const node of nodes) {
    const coverage = node.total?.coverage?.percentage ?? 0;
    if (coverage < MIN_COVERAGE) continue;

    const volume = node.total?.volumeNumbers?.volume;
    if (volume == null) continue;

    const date = new Date(node.from);
    const dayOfWeek = date.getDay(); // 0 = Sunday
    const hour = date.getHours();

    const dayKey = String(dayOfWeek);
    const hourKey = String(hour);

    if (!samples[dayKey]) samples[dayKey] = {};
    if (!samples[dayKey][hourKey]) samples[dayKey][hourKey] = [];

    samples[dayKey][hourKey].push(volume);
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function mean(values: number[]): number {
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

function computeAverages(
  samples: SlotSamples
): Record<string, Record<string, { mean: number; median: number; sampleCount: number }>> {
  const result: Record<
    string,
    Record<string, { mean: number; median: number; sampleCount: number }>
  > = {};

  for (const [day, hours] of Object.entries(samples)) {
    result[day] = {};
    for (const [hour, values] of Object.entries(hours)) {
      result[day][hour] = {
        mean: mean(values),
        median: median(values),
        sampleCount: values.length,
      };
    }
  }

  return result;
}

async function processStation(
  stationId: string
): Promise<
  Record<string, Record<string, { mean: number; median: number; sampleCount: number }>>
> {
  const name = STATION_NAMES[stationId] ?? stationId;
  const samples: SlotSamples = {};

  for (let w = 1; w <= WEEKS_BACK; w++) {
    const { from, to } = isoWeekBounds(w);
    console.log(`  ${name}: uke ${w}/${WEEKS_BACK} (${from.slice(0, 10)} - ${to.slice(0, 10)})`);

    try {
      const nodes = await fetchWeek(stationId, from, to);
      addToSamples(samples, nodes);
    } catch (err) {
      console.error(`  FEIL for ${name} uke ${w}:`, (err as Error).message);
    }

    await sleep(DELAY_MS);
  }

  return computeAverages(samples);
}

async function main(): Promise<void> {
  console.log(`Genererer gjennomsnitt for ${STATION_IDS.length} stasjoner, ${WEEKS_BACK} uker tilbake...\n`);

  const output: Record<
    string,
    Record<string, Record<string, { mean: number; median: number; sampleCount: number }>>
  > = {};

  for (const stationId of STATION_IDS) {
    console.log(`\nStasjon: ${STATION_NAMES[stationId] ?? stationId} (${stationId})`);
    try {
      output[stationId] = await processStation(stationId);
    } catch (err) {
      console.error(`Stasjon ${stationId} feilet totalt:`, (err as Error).message);
      output[stationId] = {};
    }
  }

  const outPath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "../src/data/averages.json"
  );

  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nFerdig. Skrevet til ${outPath}`);
}

main().catch((err) => {
  console.error("Fatal feil:", err);
  process.exit(1);
});
