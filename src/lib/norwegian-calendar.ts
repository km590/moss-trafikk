import type { DayType } from "./types";

/**
 * Norwegian calendar utilities for traffic prediction.
 * Gauss algorithm for Easter, fixed holidays, school breaks (Viken).
 */

/** Gauss Easter algorithm: returns [month, day] for a given year */
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
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month - 1, day]; // 0-indexed month for JS Date
}

/** Get all Norwegian public holidays for a given year */
export function getPublicHolidays(year: number): Date[] {
  const [easterMonth, easterDay] = computeEasterSunday(year);
  const easter = new Date(year, easterMonth, easterDay);

  const offsetDay = (base: Date, days: number): Date => {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d;
  };

  return [
    new Date(year, 0, 1), // Nyttårsdag
    offsetDay(easter, -3), // Skjærtorsdag
    offsetDay(easter, -2), // Langfredag
    easter, // 1. påskedag
    offsetDay(easter, 1), // 2. påskedag
    new Date(year, 4, 1), // Arbeidernes dag
    new Date(year, 4, 17), // Grunnlovsdag
    offsetDay(easter, 39), // Kristi himmelfartsdag
    offsetDay(easter, 49), // 1. pinsedag
    offsetDay(easter, 50), // 2. pinsedag
    new Date(year, 11, 25), // 1. juledag
    new Date(year, 11, 26), // 2. juledag
  ];
}

/** Get pre-holiday dates (day before a public holiday, if it's a workday) */
export function getPreHolidays(year: number): Date[] {
  const holidays = getPublicHolidays(year);
  const holidaySet = new Set(holidays.map((d) => dateKey(d)));
  const preHolidays: Date[] = [];

  for (const h of holidays) {
    const prev = new Date(h);
    prev.setDate(prev.getDate() - 1);
    const dow = prev.getDay();
    // Only count if it's a weekday and not itself a holiday
    if (dow >= 1 && dow <= 5 && !holidaySet.has(dateKey(prev))) {
      preHolidays.push(prev);
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return preHolidays.filter((d) => {
    const k = dateKey(d);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** School break periods for Viken (approximate, covers most years) */
export function getSchoolBreakRanges(year: number): Array<{ from: Date; to: Date; name: string }> {
  const [easterMonth, easterDay] = computeEasterSunday(year);
  const easter = new Date(year, easterMonth, easterDay);

  // Winter break: week 8 (Mon-Fri)
  const jan1 = new Date(year, 0, 1);
  const jan1Dow = jan1.getDay();
  // ISO week 8: find the Monday of week 8
  const daysToWeek8Mon = ((1 - jan1Dow + 7) % 7) + 7 * 7; // 7 weeks after first Monday
  const week8Mon = new Date(year, 0, 1 + daysToWeek8Mon);
  const week8Fri = new Date(week8Mon);
  week8Fri.setDate(week8Mon.getDate() + 4);

  // Easter break: Palm Sunday to 2. påskedag
  const palmSunday = new Date(easter);
  palmSunday.setDate(easter.getDate() - 7);
  const easterMonday = new Date(easter);
  easterMonday.setDate(easter.getDate() + 1);

  // Summer break: approx June 20 - Aug 18
  const summerStart = new Date(year, 5, 20);
  const summerEnd = new Date(year, 7, 18);

  // Autumn break: week 40 (Mon-Fri)
  const daysToWeek40Mon = ((1 - jan1Dow + 7) % 7) + 7 * 39;
  const week40Mon = new Date(year, 0, 1 + daysToWeek40Mon);
  const week40Fri = new Date(week40Mon);
  week40Fri.setDate(week40Mon.getDate() + 4);

  // Christmas break: Dec 21 - Jan 2
  const xmasStart = new Date(year, 11, 21);
  const xmasEnd = new Date(year + 1, 0, 2);

  return [
    { from: week8Mon, to: week8Fri, name: "vinterferie" },
    { from: palmSunday, to: easterMonday, name: "påskeferie" },
    { from: summerStart, to: summerEnd, name: "sommerferie" },
    { from: week40Mon, to: week40Fri, name: "høstferie" },
    { from: xmasStart, to: xmasEnd, name: "juleferie" },
  ];
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Classify a date as public_holiday, pre_holiday, school_break, or normal */
export function classifyDate(date: Date): DayType {
  const year = date.getFullYear();
  const key = dateKey(date);

  // Check public holidays
  const holidays = getPublicHolidays(year);
  if (holidays.some((h) => dateKey(h) === key)) {
    return "public_holiday";
  }

  // Check pre-holidays
  const preHolidays = getPreHolidays(year);
  if (preHolidays.some((h) => dateKey(h) === key)) {
    return "pre_holiday";
  }

  // Check school breaks
  const breaks = getSchoolBreakRanges(year);
  for (const b of breaks) {
    if (date >= b.from && date <= b.to) {
      return "school_break";
    }
  }

  return "normal";
}

/** Check if a specific date is May 17th */
export function isMay17(date: Date): boolean {
  return date.getMonth() === 4 && date.getDate() === 17;
}

/** Check if May 17 mode should auto-activate (May 17 + May 16 if it's a Friday) */
export function shouldAutoActivateMay17(date: Date): boolean {
  if (isMay17(date)) return true;
  // May 16 if it's a Friday (inneklemt)
  if (date.getMonth() === 4 && date.getDate() === 16 && date.getDay() === 5) return true;
  return false;
}
