/**
 * Story 16 §3.4: workout notes that matter. Pure, tested.
 *
 * Every note he types (per exercise, per set, per session) is read by these rules first, with or
 * without Gemini:
 * - pain → PB-7.4: stop that exercise, see a professional if it is sharp, radiating or in a joint; plus a
 *   lighter or swap proposal;
 * - load too heavy / too light → the pushback flow (PB-8.4);
 * - machine taken or missing → a swap from the approved menu (the swap matrix);
 * - anything else → Philip acknowledges it in the report (and Gemini may ask one question).
 * Keyword rules are deliberately simple; the owner always answers yes or no before anything changes.
 */
import type { WorkoutSession } from '../../db/types';
import type { SessionSlot } from '../training/session';
import { reviewSession, type ReviewContext, type ReviewItem } from '../training/checkin';

export type NoteSignal = 'pain' | 'heavy' | 'light' | 'machine';

const PAIN = /\b(pain|painful|hurts?|hurting|sharp|ache|aching|achy|tweak(ed)?|pinch(ed|ing)?|strain(ed)?|injur(y|ed)|numb|tingl\w*|popped|radiat\w*|knee|shoulder|elbow|wrist|lower back|neck)\b/i;
const HEAVY = /\b(too heavy|way heavy|very heavy|heavy|couldn'?t|could not|failed|fail(ing)?|grind(ing|y)?|struggl\w*|too much( weight)?|form broke)\b/i;
const LIGHT = /\b(too (light|easy)|way (light|easy)|felt (light|easy)|so easy|easy|light|could do more|more weight|go heavier)\b/i;
const MACHINE = /\b(taken|busy|occupied|in use|missing|not available|unavailable|broken|out of order|no (machine|bench|rack|cable|station|dumbbells?)|(didn'?t|don'?t|doesn'?t) have|gym has no|someone (was )?on)\b/i;

/** What a note asks for. Pain wins; a full-on load complaint beats "machine" only when both are absent. */
export function noteSignal(text: string): NoteSignal | null {
  const s = text.trim();
  if (!s) return null;
  if (PAIN.test(s)) return 'pain';
  if (MACHINE.test(s)) return 'machine';
  if (/\btoo (light|easy)\b/i.test(s)) return 'light';
  if (HEAVY.test(s)) return 'heavy';
  if (LIGHT.test(s)) return 'light';
  return null;
}

export interface NoteFinding {
  /** '' = the session note. */
  exerciseId: string;
  slot: SessionSlot | null;
  text: string;
  signal: NoteSignal | null;
}

/** All of today's notes: the session note, each exercise note and each set note (one finding per exercise and kind). */
export function sessionNotes(session: WorkoutSession): NoteFinding[] {
  const out: NoteFinding[] = [];
  const sn = (session.note ?? '').trim();
  if (sn) out.push({ exerciseId: '', slot: null, text: sn, signal: noteSignal(sn) });
  for (const e of session.exercises) {
    const texts = [e.note, ...e.actual.map((a) => a.note ?? '')].map((x) => x.trim()).filter(Boolean);
    for (const text of texts) {
      const signal = noteSignal(text);
      if (out.some((f) => f.exerciseId === e.exerciseId && f.signal === signal)) continue;
      out.push({ exerciseId: e.exerciseId, slot: e.slot, text, signal });
    }
  }
  return out;
}

/** Story 16 §3.4: the items today's notes add to the day review (PB-7.4, PB-8.4, the swap menu). */
export function noteReviewItems(session: WorkoutSession, ctx: ReviewContext = {}): ReviewItem[] {
  const items: ReviewItem[] = [];
  for (const n of sessionNotes(session)) {
    const accessory = n.exerciseId !== '' && n.slot !== 'main';
    if (n.signal === 'pain' && n.exerciseId) {
      items.push({ kind: 'safety', exerciseId: n.exerciseId, text: n.text });
      const lighter = accessory ? ctx.pushback?.(n.exerciseId, 'heavy') : null;
      if (lighter) items.push({ kind: 'next', exerciseId: n.exerciseId, ...lighter, why: 'pain' });
      const swap = accessory ? ctx.swapFor?.(n.exerciseId) : null;
      if (swap) items.push({ kind: 'swap', exerciseId: n.exerciseId, ...swap, why: 'pain' });
      continue;
    }
    if ((n.signal === 'heavy' || n.signal === 'light') && accessory) {
      const p = ctx.pushback?.(n.exerciseId, n.signal);
      if (p) {
        items.push({ kind: 'next', exerciseId: n.exerciseId, ...p, why: n.signal });
        continue;
      }
    }
    if (n.signal === 'machine' && accessory) {
      const swap = ctx.swapFor?.(n.exerciseId);
      if (swap) {
        items.push({ kind: 'swap', exerciseId: n.exerciseId, ...swap, why: 'machine' });
        continue;
      }
    }
    items.push({ kind: 'noteAck', exerciseId: n.exerciseId, text: n.text });
  }
  return items;
}

/** The whole day review: the rules on flags and misses, then every note. */
export const reviewDay = (session: WorkoutSession, ctx: ReviewContext = {}): ReviewItem[] => [...reviewSession(session), ...noteReviewItems(session, ctx)];
