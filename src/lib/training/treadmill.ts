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
