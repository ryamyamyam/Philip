import type { Weekday, YMD } from '../db/types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Formats a Date using its LOCAL calendar fields (never UTC). */
export function toYmd(d: Date): YMD {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayYmd(now: Date = new Date()): YMD {
  return toYmd(now);
}

export function isValidYmd(s: unknown): s is YMD {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseYmd(s);
  return toYmd(d) === s;
}

/** Local-midnight Date for a YMD. Uses the (y, m, d) constructor, which is local time. */
export function parseYmd(s: YMD): Date {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

export function addDays(s: YMD, n: number): YMD {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n); // handles DST and month/year rollover in local time
  return toYmd(d);
}

export function weekdayOf(s: YMD): Weekday {
  return parseYmd(s).getDay() as Weekday;
}

/** Whole calendar days from a to b (b - a). DST-safe. */
export function daysBetween(a: YMD, b: YMD): number {
  const [ay, am, ad] = a.split('-').map(Number) as [number, number, number];
  const [by, bm, bd] = b.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** Inclusive list of dates from start to end. */
export function dateRange(start: YMD, end: YMD): YMD[] {
  const out: YMD[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Monday-start week containing the date. */
export function startOfWeek(s: YMD): YMD {
  const wd = weekdayOf(s);
  return addDays(s, -((wd + 6) % 7));
}

export function ageOn(birthDate: YMD, on: YMD): number {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number];
  const [y, m, d] = on.split('-').map(Number) as [number, number, number];
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age;
}
