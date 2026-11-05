import { t } from '../../i18n';
import { fmtNum } from '../../lib/format';
import { KG_PER_LB, type PlateUnit } from '../../lib/training/plates';

export const toDisplay = (kg: number, unit: PlateUnit): number => (unit === 'kg' ? kg : kg / KG_PER_LB);
export const fromDisplay = (v: number, unit: PlateUnit): number => (unit === 'kg' ? v : v * KG_PER_LB);

/** One weight in one unit: kg to 0.1, lb to whole pounds. */
export function fmtIn(kg: number, unit: PlateUnit): string {
  return unit === 'kg' ? t('home.kg', { n: fmtNum(Math.round(kg * 10) / 10, 1) }) : t('home.lb', { n: fmtNum(Math.round(kg / KG_PER_LB), 0) });
}

/** Both units, the chosen one first: "76.7 kg · 169 lb". */
export function fmtBoth(kg: number, first: PlateUnit): string {
  const other: PlateUnit = first === 'kg' ? 'lb' : 'kg';
  return `${fmtIn(kg, first)} · ${fmtIn(kg, other)}`;
}

/** Value for an input box in the chosen unit (kg to 0.1, lb to 0.5). */
export function inputValue(kg: number | null, unit: PlateUnit): string {
  if (kg === null) return '';
  const v = toDisplay(kg, unit);
  return String(unit === 'kg' ? Math.round(v * 10) / 10 : Math.round(v * 2) / 2);
}

export function fmtRest(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.max(0, sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
