/**
 * The cardio finisher (Story 7, OBS-93A8C0). Pure.
 *
 * Cardio was left out of the 45-minute lifting budget on purpose (Story 5 §4.6), not because of the
 * phase. The owner's default is an incline (ramp) treadmill walk, 15 minutes or more, after the lifts,
 * every session. It is never counted in the 45 minutes.
 *
 * Minutes per phase are Philip's coaching defaults (a hypothesis, not evidence): low-intensity
 * walking adds energy expenditure with little cost to recovery, so a cut gets a longer walk. Tune here.
 */
import type { CardioLog } from '../../db/types';
import type { Phase } from './program';

export const CARDIO_MINUTES: Readonly<Record<Phase, number>> = { gain: 15, maintain: 15, lose: 25 };

/** `planMin` overrides the phase default (Story 11: Philip's minutes for the cycle). */
export function plannedCardio(phase: Phase, speedUnit: CardioLog['speedUnit'] = 'mph', planMin?: number | null): CardioLog {
  return { kind: 'incline-walk', planMin: planMin ?? CARDIO_MINUTES[phase], minutes: null, inclinePct: null, speed: null, speedUnit, done: false, skipped: false };
}

/** Done needs minutes walked (incline and speed are optional). */
export const canFinishCardio = (c: CardioLog): boolean => c.minutes !== null && c.minutes > 0;

/** Ranges the log accepts (anything outside is ignored as a typo). */
export const CARDIO_LIMITS = { minutes: [1, 240], inclinePct: [0, 30], speed: [0.5, 15] } as const;

export function clampField(field: keyof typeof CARDIO_LIMITS, v: number | null): number | null {
  if (v === null || !Number.isFinite(v)) return null;
  const [min, max] = CARDIO_LIMITS[field];
  return v < min || v > max ? null : v;
}
