/**
 * Ferry departure signal for short-term traffic prediction adjustment.
 *
 * Hypothesis: ferry departures from Moss create traffic surges on RV19
 * and Kanalbrua in the 20-45 min window before each departure.
 *
 * This is a spike/experiment. The signal is a multiplier (1.0 = no effect)
 * applied on top of the baseline prediction.
 */
import { fetchFerryDepartures, type FerryDeparture } from "./entur-client";
import { RV19_STATION_IDS, KANALBRUA_ID } from "./stations";

/** Stations affected by ferry traffic */
const FERRY_AFFECTED_STATIONS = new Set([...RV19_STATION_IDS, KANALBRUA_ID]);

/**
 * Time windows where ferry causes traffic increase.
 * Minutes before departure -> multiplier.
 * Peak is 25-35 min before (travel time to ferry + queue).
 */
const FERRY_CURVE: { minBefore: number; maxBefore: number; factor: number }[] = [
  { minBefore: 15, maxBefore: 25, factor: 1.08 }, // Early arrivals
  { minBefore: 25, maxBefore: 40, factor: 1.15 }, // Peak surge
  { minBefore: 40, maxBefore: 55, factor: 1.06 }, // Late stragglers
];

/**
 * Calculate ferry surge multiplier for a station at a given time.
 * Returns 1.0 if no ferry effect, >1.0 if surge expected.
 * Multiple departures stack (capped).
 */
export function computeFerryFactor(
  stationId: string,
  departures: FerryDeparture[],
  nowMs: number = Date.now()
): { factor: number; nextDeparture: FerryDeparture | null; reason: string } {
  if (!FERRY_AFFECTED_STATIONS.has(stationId)) {
    return { factor: 1.0, nextDeparture: null, reason: "station_not_affected" };
  }

  if (departures.length === 0) {
    return { factor: 1.0, nextDeparture: null, reason: "no_departures" };
  }

  let combinedFactor = 1.0;
  let closestDeparture: FerryDeparture | null = null;
  let closestMin = Infinity;

  for (const dep of departures) {
    const depMs = new Date(dep.time).getTime();
    const minUntil = (depMs - nowMs) / 60000;

    if (minUntil < closestMin && minUntil > 0) {
      closestMin = minUntil;
      closestDeparture = dep;
    }

    for (const band of FERRY_CURVE) {
      if (minUntil >= band.minBefore && minUntil < band.maxBefore) {
        // Additive stacking: (factor - 1.0) accumulates
        combinedFactor += band.factor - 1.0;
        break;
      }
    }
  }

  // Cap combined surge at +30%
  combinedFactor = Math.min(combinedFactor, 1.3);

  const reason =
    combinedFactor > 1.0
      ? `ferry_surge_${Math.round((combinedFactor - 1) * 100)}pct`
      : "no_active_surge";

  return { factor: combinedFactor, nextDeparture: closestDeparture, reason };
}

/**
 * Fetch departures and compute ferry factor for a station.
 * Convenience wrapper for use in data-fetcher.
 */
export async function getFerrySignal(stationId: string): Promise<{
  factor: number;
  nextDeparture: FerryDeparture | null;
  reason: string;
}> {
  const departures = await fetchFerryDepartures(6);
  return computeFerryFactor(stationId, departures);
}

/**
 * Check if a station is affected by ferry traffic.
 */
export function isFerryAffectedStation(stationId: string): boolean {
  return FERRY_AFFECTED_STATIONS.has(stationId);
}
