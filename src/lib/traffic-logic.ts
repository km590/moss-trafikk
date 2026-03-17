import { CongestionLevel, StationStatus, StationAverages, BestTimeWindow, BestTimeResult } from "./types";
import { KANALBRUA_ID, KANALBRUA_ABSOLUTE_GUARDRAIL, RV19_STATION_IDS, E6_STATION_IDS } from "./stations";

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

export function classifyCongestion(
  currentVolume: number,
  normalVolume: number,
  stationId: string
): { level: CongestionLevel; deviationPercent: number } {
  if (normalVolume === 0 || normalVolume < 10) {
    return { level: "green", deviationPercent: 100 };
  }

  const deviationPercent = Math.round((currentVolume / normalVolume) * 100);

  if (stationId === KANALBRUA_ID && currentVolume > KANALBRUA_ABSOLUTE_GUARDRAIL) {
    return { level: "red", deviationPercent };
  }

  let level: CongestionLevel;
  if (deviationPercent < 110) {
    level = "green";
  } else if (deviationPercent < 125) {
    level = "yellow";
  } else if (deviationPercent < 145) {
    level = "orange";
  } else {
    level = "red";
  }

  return { level, deviationPercent };
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
    case "orange":
      return "bg-orange-500";
    case "red":
      return "bg-red-500";
    case "unknown":
      return "bg-slate-300";
  }
}

export function getCongestionLabel(level: CongestionLevel): string {
  switch (level) {
    case "green":
      return "Normal trafikk";
    case "yellow":
      return "Noe kø";
    case "orange":
      return "Mye kø";
    case "red":
      return "Svært mye kø";
    case "unknown":
      return "Ukjent status";
  }
}
