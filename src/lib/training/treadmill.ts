/**
 * The owner's treadmill and its speed dial (Story 10, OBS-E19B38). Pure.
 *
 * "Most machines have a speed setting like 2 or 3.5, not mph." The owner names his machine; Philip
 * estimates what its speed number means (mph, km/h, or a level 1–N with a top speed), the owner can
 * correct it, and every logged setting gets a projected mph next to it. A level → mph projection is
 * linear between the slowest and fastest speed: an estimate, labelled as one.
 */
import type { Treadmill } from '../../db/types';

export const KMH_TO_MPH = 0.621371;

/** Bounds Philip's (or the owner's) numbers must sit in. */
export const TREADMILL_LIMITS = { maxLevel: [2, 40], minMph: [0, 2], maxMph: [4, 15], nameChars: 80 } as const;

/** What a treadmill with no settings is assumed to be: the display speaks the owner's unit. */
export const defaultTreadmill = (unit: 'mph' | 'kmh'): Treadmill => ({ name: '', scale: unit, source: 'me' });

/** Projected mph for a machine setting; null when it can't be projected. */
export function settingToMph(setting: number | null, m: Treadmill): number | null {
  if (setting === null || !Number.isFinite(setting) || setting <= 0) return null;
  switch (m.scale) {
    case 'mph':
      return round1(setting);
    case 'kmh':
      return round1(setting * KMH_TO_MPH);
    case 'level': {
      const top = m.maxLevel ?? null;
      if (top === null || m.maxMph === undefined) return null;
      const low = m.minMph ?? 0.5;
      const lvl = Math.min(top, Math.max(1, setting));
      return round1(low + ((lvl - 1) / (top - 1)) * (m.maxMph - low));
    }
  }
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const within = (v: unknown, [lo, hi]: readonly [number, number]): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null;

/** A treadmill the owner typed: valid when a level dial has its top level and top speed. */
export function validTreadmill(m: Treadmill): boolean {
  if (m.name.length > TREADMILL_LIMITS.nameChars) return false;
  if (m.scale !== 'level') return true;
  return within(m.maxLevel, TREADMILL_LIMITS.maxLevel) !== null && within(m.maxMph, TREADMILL_LIMITS.maxMph) !== null;
}

/** Prompt for Philip's estimate (Gemini). Answer only JSON; say when unsure instead of guessing wildly. */
export function treadmillPrompt(name: string): string {
  return [
    'You are helping a lifter read their gym treadmill. They named the machine below.',
    'Say what the number on its speed control most likely means: "mph", "kmh", or "level" (a dial from 1 to N that is not a speed).',
    'For "level", also give the top level and the speeds in mph at level 1 and at the top level.',
    'If you do not recognise the model, use what is typical for that brand or for commercial gym treadmills, and set confidence to "low".',
    'Reply ONLY with JSON: {"scale":"mph"|"kmh"|"level","maxLevel":number|null,"minMph":number|null,"maxMph":number|null,"confidence":"high"|"medium"|"low","note":string (max 120 chars, plain words, no emoji)}.',
    `Machine: "${name.slice(0, TREADMILL_LIMITS.nameChars)}"`,
  ].join('\n');
}

export interface TreadmillEstimate {
  treadmill: Treadmill;
  confidence: 'high' | 'medium' | 'low';
  note: string;
}

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu;

/** Validates Gemini's reply; null when it isn't usable (a level dial needs its numbers in range). */
export function parseTreadmillEstimate(raw: unknown, name: string): TreadmillEstimate | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const scale = o.scale === 'mph' || o.scale === 'kmh' || o.scale === 'level' ? o.scale : null;
  if (!scale) return null;
  const confidence = o.confidence === 'high' || o.confidence === 'medium' ? o.confidence : 'low';
  const note = typeof o.note === 'string' ? o.note.replace(EMOJI, '').trim().slice(0, 160) : '';
  const base: Treadmill = { name: name.trim().slice(0, TREADMILL_LIMITS.nameChars), scale, source: 'philip' };
  if (scale !== 'level') return { treadmill: base, confidence, note };
  const maxLevel = within(o.maxLevel, TREADMILL_LIMITS.maxLevel);
  const maxMph = within(o.maxMph, TREADMILL_LIMITS.maxMph);
  const minMph = within(o.minMph, TREADMILL_LIMITS.minMph);
  if (maxLevel === null || maxMph === null) return null;
  return { treadmill: { ...base, maxLevel: Math.round(maxLevel), maxMph, ...(minMph !== null ? { minMph } : {}) }, confidence, note };
}

/* ---------------- Story 17 (OBS-A4F4B9): incline and speed read off the machine ---------------- */

/** Bounds for the incline dial Philip may describe. */
export const INCLINE_LIMITS = { maxLevel: [2, 40], maxPct: [1, 40] } as const;

/** Incline % for the number the machine shows; null when it can't be projected. Most machines show %. */
export function inclineToPct(setting: number | null, m: Treadmill): number | null {
  if (setting === null || !Number.isFinite(setting) || setting < 0) return null;
  const inc = m.incline;
  if (!inc || inc.scale === 'pct') return round1(setting);
  if (inc.maxLevel === undefined || inc.maxPct === undefined) return null;
  return round1((Math.min(inc.maxLevel, setting) / inc.maxLevel) * inc.maxPct);
}

/** Prompt: read this machine's incline and speed numbers (Gemini). JSON only; low confidence when unsure. */
export function treadmillReadPrompt(name: string, incline: number | null, speed: number | null): string {
  return [
    'You are helping a lifter read their gym treadmill during a workout. They named the machine and typed the numbers its display shows.',
    'Say what its incline number means: "pct" (already a percent grade, as on most machines) or "level" (a dial from 1 to N that is not a percent). For "level", give the top level and the percent grade at the top level.',
    'Say what its speed number means: "mph", "kmh", or "level" (a dial from 1 to N). For "level", give the top level and the speeds in mph at level 1 and at the top level.',
    'Then give the incline in percent and the speed in mph for the numbers below.',
    'If you do not recognise the model, use what is typical for that brand or for commercial gym treadmills, and set confidence to "low". Never invent extra precision.',
    'Reply ONLY with JSON: {"inclineScale":"pct"|"level","inclineMaxLevel":number|null,"inclineMaxPct":number|null,"scale":"mph"|"kmh"|"level","maxLevel":number|null,"minMph":number|null,"maxMph":number|null,"inclinePct":number|null,"mph":number|null,"confidence":"high"|"medium"|"low","note":string (max 120 chars, plain words, no emoji)}.',
    `Machine: "${name.slice(0, TREADMILL_LIMITS.nameChars)}"`,
    `Incline shown: ${incline ?? 'not given'}`,
    `Speed shown: ${speed ?? 'not given'}`,
  ].join('\n');
}

export interface TreadmillRead extends TreadmillEstimate {
  /** Incline % for the numbers he typed (from the machine's dial, the app's own math). */
  inclinePct: number | null;
  mph: number | null;
  /** The incline number was already a percent (Philip kept it). */
  inclineWasPct: boolean;
}

/**
 * Validates Philip's read (Story 17). The machine's dials come from his reply; the numbers for this
 * walk are then computed here from those dials (`inclineToPct`, `settingToMph`), so the app never takes a
 * converted number it can't reproduce. Null when the reply isn't usable.
 */
export function parseTreadmillRead(raw: unknown, name: string, incline: number | null, speed: number | null): TreadmillRead | null {
  const est = parseTreadmillEstimate(raw, name);
  if (!est) return null;
  const o = raw as Record<string, unknown>;
  let inc: NonNullable<Treadmill['incline']> = { scale: 'pct' };
  if (o.inclineScale === 'level') {
    const maxLevel = within(o.inclineMaxLevel, INCLINE_LIMITS.maxLevel);
    const maxPct = within(o.inclineMaxPct, INCLINE_LIMITS.maxPct);
    if (maxLevel === null || maxPct === null) return null;
    inc = { scale: 'level', maxLevel: Math.round(maxLevel), maxPct };
  }
  const treadmill: Treadmill = { ...est.treadmill, incline: inc };
  return { ...est, treadmill, inclinePct: inclineToPct(incline, treadmill), mph: settingToMph(speed, treadmill), inclineWasPct: inc.scale === 'pct' };
}
