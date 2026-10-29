import type { YMD } from '../db/types';
import { getLocale } from '../i18n';
import { parseYmd } from './date';

const cache = new Map<string, Intl.NumberFormat>();
function nf(maxFrac: number, minFrac = 0): Intl.NumberFormat {
  const k = `${getLocale()}|${maxFrac}|${minFrac}`;
  let f = cache.get(k);
  if (!f) {
    f = new Intl.NumberFormat(getLocale(), { maximumFractionDigits: maxFrac, minimumFractionDigits: minFrac });
    cache.set(k, f);
  }
  return f;
}

/** Calories: whole numbers. */
export const fmtKcal = (n: number) => nf(0).format(Math.round(n));
/** Grams: up to one decimal under 10, whole numbers above. */
export const fmtG = (n: number) => nf(Math.abs(n) < 10 ? 1 : 0).format(n);
export const fmtNum = (n: number, maxFrac = 1) => nf(maxFrac).format(n);

export function fmtDate(d: YMD, style: 'long' | 'medium' | 'short' | 'weekday' = 'medium'): string {
  const date = parseYmd(d);
  const opts: Intl.DateTimeFormatOptions =
    style === 'long'
      ? { weekday: 'long', month: 'long', day: 'numeric' }
      : style === 'weekday'
        ? { weekday: 'short', month: 'short', day: 'numeric' }
        : style === 'short'
          ? { month: 'numeric', day: 'numeric' }
          : { month: 'short', day: 'numeric', year: 'numeric' };
  return new Intl.DateTimeFormat(getLocale(), opts).format(date);
}

export function fmtDateTime(ms: number): string {
  return new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms));
}

export function fmtRelativeDay(d: YMD, today: YMD): string | null {
  const rtf = new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' });
  const diff = Math.round((parseYmd(d).getTime() - parseYmd(today).getTime()) / 86_400_000);
  if (Math.abs(diff) <= 1) {
    const s = rtf.format(diff, 'day');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return null;
}
