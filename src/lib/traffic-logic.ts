import { CongestionLevel, StationStatus, StationAverages, BestTimeWindow, BestTimeResult, ModelWeights } from "./types";
import { KANALBRUA_ID, KANALBRUA_ABSOLUTE_GUARDRAIL, RV19_STATION_IDS, E6_STATION_IDS, getStationVulnerability } from "./stations";
import modelWeightsData from "../data/model-weights.json";

const modelWeights = modelWeightsData as ModelWeights;
const FJORDVEIEN_ID = "59044V971518";

const DAY_NAMES = ["søndager", "mandager", "tirsdager", "onsdager", "torsdager", "fredager", "lørdager"];

/** Get current hour and dayOfWeek in Europe/Oslo timezone */
export function getNorwayTime(): { hour: number; dayOfWeek: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Oslo",
    hour: "numeric",
    hour12: false,
    weekday: "short",
  });
  const parts = formatter.formatToParts(now);
  const hourPart = parts.find((p) => p.type === "hour");
  const weekdayPart = parts.find((p) => p.type === "weekday");

  const hour = parseInt(hourPart?.value ?? "0", 10);
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = dayMap[weekdayPart?.value ?? "Mon"] ?? 1;

  return { hour, dayOfWeek };
}

/** Format a Date to Norwegian time string "HH:MM" */
export function formatNorwayTime(date: Date): string {
  return date.toLocaleTimeString("no-NO", {
    timeZone: "Europe/Oslo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// --- Congestion thresholds (CALIBRATION V1) ---
const DEVIATION_YELLOW = 1.15; // CALIBRATION: 115% of normal triggers yellow signal
const DEVIATION_RED = 1.35;    // CALIBRATION: 135% of normal triggers red signal
const LEAN_GREEN_DEVIATION = 1.20; // CALIBRATION: below this + below yellowAbs*1.05 = lean green
const LEAN_GREEN_ABS_FACTOR = 1.05; // CALIBRATION

// Rush hours where friction signal is strongest (CALIBRATION)
const RUSH_HOURS = [7, 8, 15, 16, 17]; // CALIBRATION

/**
 * Classify measured congestion using 3 independent signals.
 *
 * Signal 1: Absolute volume - raw volume vs station thresholds
 * Signal 2: Deviation from normal - current vs expected for this time
 * Signal 3: Station/time friction - is this volume problematic given
 *           the station's physical capacity at this specific time?
 *
 * Red: 2 of 3 signals (damped hours: 3 of 3)
 * Yellow: 1+ signals, with "lean green" clause for marginal cases
 * Green: 0 signals, or lean-green override
 */
export function classifyCongestion(
  currentVolume: number,
  normalVolume: number,
  stationId: string,
  hour: number
): { level: CongestionLevel; deviationPercent: number } {
  if (normalVolume === 0 || normalVolume < 10) {
    return { level: "green", deviationPercent: 100 };
  }

  const deviationPercent = Math.round((currentVolume / normalVolume) * 100);
  const deviationRatio = currentVolume / normalVolume;
  const vuln = getStationVulnerability(stationId);

  // --- Signal 1: Absolute level ---
  const absYellow = currentVolume >= vuln.yellowAbsolute;
  const absRed = currentVolume >= vuln.redAbsolute;

  // --- Signal 2: Deviation from normal ---
  const devYellow = deviationRatio >= DEVIATION_YELLOW;
  const devRed = deviationRatio >= DEVIATION_RED;

  // --- Signal 3: Station/time friction ---
  // Combines friction coefficient with time-specific weighting
  const isRush = RUSH_HOURS.includes(hour);
  const timeFactor = isRush ? 1.2 : (vuln.dampedHours.includes(hour) ? 0.7 : 1.0); // CALIBRATION
  const effectiveFriction = vuln.friction * timeFactor;
  // Friction signal fires when volume * friction exceeds yellow/red thresholds
  const frictionYellow = currentVolume * effectiveFriction >= vuln.yellowAbsolute;
  const frictionRed = currentVolume * effectiveFriction >= vuln.redAbsolute;

  // --- Count signals ---
  const yellowSignals = [absYellow, devYellow, frictionYellow].filter(Boolean).length;
  const redSignals = [absRed, devRed, frictionRed].filter(Boolean).length;

  const isDamped = vuln.dampedHours.includes(hour);

  // --- Red classification ---
  // Normal: 2 of 3 red signals. Damped hours: all 3 required.
  const redThreshold = isDamped ? 3 : 2;
  if (redSignals >= redThreshold) {
    return { level: "red", deviationPercent };
  }

  // --- Lean green clause ---
  // If deviation is marginal AND absolute is close to but below yellow threshold,
  // lean toward green (doubt between green/yellow -> green)
  if (yellowSignals >= 1 && deviationRatio < LEAN_GREEN_DEVIATION && currentVolume < vuln.yellowAbsolute * LEAN_GREEN_ABS_FACTOR) {
    return { level: "green", deviationPercent };
  }

  // --- Yellow classification ---
  if (yellowSignals >= 1) {
    return { level: "yellow", deviationPercent };
  }

  return { level: "green", deviationPercent };
}

export function getCorridorWorstPoint(statuses: StationStatus[]): StationStatus | null {
  const valid = statuses.filter((s) => s.currentVolume !== null);
  if (valid.length === 0) return null;

  return valid.reduce((worst, current) =>
    current.deviationPercent > worst.deviationPercent ? current : worst
  );
}

export function getNormalVolume(
  averages: StationAverages,
  stationId: string,
  dayOfWeek: number,
  hour: number
): number {
  // Use model weights (median) as primary source
  const modelMedian = modelWeights.basePatterns[stationId]?.[dayOfWeek]?.[hour]?.median;
  if (modelMedian !== undefined && modelMedian > 0) return modelMedian;
  // Mon/Tue proxy: fall back to Wednesday when no data
  if (dayOfWeek === 1 || dayOfWeek === 2) {
    const wedMedian = modelWeights.basePatterns[stationId]?.[3]?.[hour]?.median;
    if (wedMedian !== undefined && wedMedian > 0) return wedMedian;
  }
  // Legacy fallback
  return averages[stationId]?.[dayOfWeek]?.[hour]?.mean ?? 0;
}

function formatTimeWindow(hour: number): string {
  const start = hour % 24;
  const end = (hour + 1) % 24;
  const pad = (h: number) => String(h).padStart(2, "0");
  return `${pad(start)}:00 - ${pad(end)}:00`;
}

function averageVolumes(averages: StationAverages, stationIds: string[], dayOfWeek: number, hour: number): number {
  const volumes = stationIds
    .map((id) => getNormalVolume(averages, id, dayOfWeek, hour))
    .filter((v) => v > 0);
  if (volumes.length === 0) return 0;
  return volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
}

function getExpectedScore(
  averages: StationAverages,
  dayOfWeek: number,
  hour: number,
  mode: "kanalbrua" | "corridor"
): number {
  if (mode === "kanalbrua") {
    const normal = getNormalVolume(averages, KANALBRUA_ID, dayOfWeek, hour);
    return normal;
  }

  const kanalbruaNormal = getNormalVolume(averages, KANALBRUA_ID, dayOfWeek, hour);
  const rv19Normal = averageVolumes(averages, RV19_STATION_IDS, dayOfWeek, hour);
  const e6Normal = averageVolumes(averages, E6_STATION_IDS, dayOfWeek, hour);
  const fjordveiNormal = getNormalVolume(averages, FJORDVEIEN_ID, dayOfWeek, hour);

  return (
    kanalbruaNormal * 0.4 +
    rv19Normal * 0.3 +
    e6Normal * 0.2 +
    fjordveiNormal * 0.1
  );
}

export function findBestCrossingTime(
  averages: StationAverages,
  currentHour: number,
  dayOfWeek: number,
  mode: "kanalbrua" | "corridor"
): BestTimeResult {
  const dayName = DAY_NAMES[dayOfWeek] ?? "denne dagen";

  const candidates: { hour: number; score: number }[] = [];

  for (let i = 0; i < 4; i++) {
    const hour = (currentHour + i) % 24;
    const score = getExpectedScore(averages, dayOfWeek, hour, mode);
    candidates.push({ hour, score });
  }

  // Calculate deviation as percentage relative to current hour
  const currentScore = candidates[0].score;

  candidates.sort((a, b) => a.score - b.score);

  const primaryCandidate = candidates[0];
  const backupCandidate = candidates[1] ?? null;

  const toDeviation = (score: number): number =>
    currentScore > 0 ? Math.round((score / currentScore) * 100) : 100;

  // Check if we're in low-traffic hours (all candidates < 50 vehicles)
  const isLowTraffic = candidates.every((c) => c.score < 50);

  const reason = isLowTraffic
    ? "Lite trafikk akkurat nå"
    : `Basert på typisk trafikk for ${dayName}`;

  const primary: BestTimeWindow = {
    startHour: primaryCandidate.hour,
    endHour: (primaryCandidate.hour + 1) % 24,
    expectedDeviation: toDeviation(primaryCandidate.score),
    label: isLowTraffic ? "Kjør når du vil" : formatTimeWindow(primaryCandidate.hour),
    reason,
  };

  const backup: BestTimeWindow | null = backupCandidate && !isLowTraffic
    ? {
        startHour: backupCandidate.hour,
        endHour: (backupCandidate.hour + 1) % 24,
        expectedDeviation: toDeviation(backupCandidate.score),
        label: formatTimeWindow(backupCandidate.hour),
        reason,
      }
    : null;

  return { primary, backup, mode };
}

export function getCongestionColor(level: CongestionLevel): string {
  switch (level) {
    case "green":
      return "bg-emerald-500";
    case "yellow":
      return "bg-amber-400";
    case "red":
      return "bg-red-500";
    case "unknown":
      return "bg-slate-300";
  }
}

export function getCongestionLabel(level: CongestionLevel): string {
  switch (level) {
    case "green":
      return "Går fint";
    case "yellow":
      return "Travelt";
    case "red":
      return "Kø";
    case "unknown":
      return "Ukjent";
  }
}

export function getEstimateCongestionLabel(level: CongestionLevel): string {
  switch (level) {
    case "green":
      return "Ser rolig ut";
    case "yellow":
      return "Ser travelt ut";
    case "red":
      return "Kø sannsynlig";
    case "unknown":
      return "Ukjent";
  }
}
