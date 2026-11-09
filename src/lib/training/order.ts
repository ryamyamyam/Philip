/**
 * The owner's exercise order for a day (Story 7, OBS-F52773). Pure.
 *
 * "Sometimes I want to do A2 before A1 because the machines are on the same floor." The main lift
 * always stays first (it's the heavy compound and needs a fresh lifter); the accessories can go in
 * any order. The order is remembered per program day and can be changed in every session.
 */
import type { SessionSlot } from './session';

export const DEFAULT_ORDER: readonly SessionSlot[] = ['main', 'A1', 'A2', 'B'];
const ACCESSORY: readonly SessionSlot[] = ['A1', 'A2', 'B'];

/** A valid order: main first, then each accessory slot once (unknown or missing slots fall back to default). */
export function normalizeOrder(order: readonly string[] | null | undefined): SessionSlot[] {
  const seen = new Set<SessionSlot>();
  const acc: SessionSlot[] = [];
  for (const s of order ?? []) {
    if ((ACCESSORY as readonly string[]).includes(s) && !seen.has(s as SessionSlot)) {
      seen.add(s as SessionSlot);
      acc.push(s as SessionSlot);
    }
  }
  for (const s of ACCESSORY) if (!seen.has(s)) acc.push(s);
  return ['main', ...acc];
}

/** Sorts a day's exercises into the given order. Slots not in the order keep their place at the end. */
export function applyOrder<T extends { slot: SessionSlot }>(exercises: readonly T[], order: readonly string[] | null | undefined): T[] {
  const o = normalizeOrder(order);
  const rank = (s: SessionSlot) => {
    const i = o.indexOf(s);
    return i === -1 ? o.length : i;
  };
  return [...exercises].sort((a, b) => rank(a.slot) - rank(b.slot));
}

/** The slots in the order the exercises are listed. */
export const orderOf = (exercises: readonly { slot: SessionSlot }[]): SessionSlot[] => normalizeOrder(exercises.map((e) => e.slot));

/** Can the exercise at `index` move one place up (-1) or down (+1)? The main lift never moves, and nothing passes it. */
export function canMove(exercises: readonly { slot: SessionSlot }[], index: number, dir: -1 | 1): boolean {
  const ex = exercises[index];
  const to = exercises[index + dir];
  return !!ex && !!to && ex.slot !== 'main' && to.slot !== 'main';
}

/** Moves one accessory a place up or down; returns the same array when the move isn't allowed. */
export function moveExercise<T extends { slot: SessionSlot }>(exercises: readonly T[], index: number, dir: -1 | 1): T[] {
  if (!canMove(exercises, index, dir)) return [...exercises];
  const next = [...exercises];
  const a = next[index] as T;
  next[index] = next[index + dir] as T;
  next[index + dir] = a;
  return next;
}
