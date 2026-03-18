import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const averages = JSON.parse(
  readFileSync(join(__dirname, '../src/data/averages.json'), 'utf-8')
);

const basePatterns = {};

for (const [stationId, days] of Object.entries(averages)) {
  basePatterns[stationId] = {};
  for (const [day, hours] of Object.entries(days)) {
    basePatterns[stationId][day] = {};
    for (const [hour, stats] of Object.entries(hours)) {
      const { mean, median, sampleCount } = stats;
      basePatterns[stationId][day][hour] = {
        median,
        mean,
        sampleCount,
        p25: Math.round(median * 0.85),
        p75: Math.round(median * 1.15),
      };
    }
  }
}

const stationCount = Object.keys(averages).length;

const output = {
  basePatterns,
  monthFactors: {
    "0": 1.0,
    "1": 1.0,
    "2": 1.0,
    "3": 1.0,
    "4": 1.0,
    "5": 0.85,
    "6": 0.75,
    "7": 0.80,
    "8": 1.05,
    "9": 1.0,
    "10": 1.0,
    "11": 0.90,
  },
  holidayFactors: {
    public_holiday: 0.45,
    pre_holiday: 0.85,
    school_break: 0.80,
  },
  metadata: {
    generatedAt: "2026-03-18T00:00:00.000Z",
    weeksOfData: 10,
    stationCount,
  },
};

const outPath = join(__dirname, '../src/data/model-weights.json');
writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`Written to ${outPath}`);
console.log(`Stations: ${stationCount}`);
