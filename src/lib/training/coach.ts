/**
 * Philip's observation report and the chat under it (Story 7, OBS-3DB146). Pure: prompts in,
 * validated proposals out. The Gemini call itself lives in services/foodAnalysis/gemini.ts.
 *
 * After a workout Philip writes a short report of what he saw and proposes plan changes: a lift's
 * training max, rest, an accessory's next weight / reps / sets, an exercise swap, or the training
 * days. Every proposal is checked here against the same kind of bounds the rule engine keeps; anything
 * out of bounds or not in Philip's approved menu is dropped. Nothing changes until the owner taps Apply.
 */
import type { CoachChange, CoachMessage, CoachThread, IsoWeekday, WorkoutSession } from '../../db/types';
import { exerciseFor, menuSlot, type ExerciseId, type Slot } from './exercises';
import { blockForCycle, DAY_LIFT, LIFTS, roundTo, type Day, type LiftId, type Phase } from './program';
import { roundToStep, type PlateUnit } from './plates';
import { MAX_REST_BONUS_SEC } from './checkin';
import { parseRemember, REMEMBER_RULE } from '../coach/memory';

/** Bounds for proposals (Philip's coaching defaults; a hypothesis, not evidence). */
export const COACH_BOUNDS = {
  /** A TM moves at most 10% either way in one review. */
  tmPct: 0.1,
  /** An accessory's next weight moves at most 20% from what was ordered today. */
  nextKgPct: 0.2,
  sets: [2, 5],
  restSec: [15, 60],
  /** Characters kept from a reply or a "why" line. */
  messageMax: 800,
  whyMax: 160,
  /** Chat turns sent back to Gemini as history. */
  historyTurns: 12,
} as const;

export interface CoachContext {
  session: WorkoutSession;
  phase: Phase;
  /** Current TMs (kg) for this cycle. */
  tms: Readonly<Record<LiftId, number | null>>;
  trainingDays: readonly IsoWeekday[];
  /** Owner's sticky swaps by slot key. */
  choices: Readonly<Record<string, string>>;
  unit: PlateUnit;
  /** Names for exercise ids (from en.ts). */
  name: (id: string) => string;
}

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu;
export const cleanText = (s: string, max: number): string => s.replace(EMOJI, '').trim().slice(0, max);

const kgText = (kg: number | null) => (kg === null ? 'no weight' : `${Math.round(kg * 10) / 10} kg`);

/** The facts Philip gets: today's log, the plan around it, and what he may change. */
export function contextText(c: CoachContext): string {
  const s = c.session;
  const block = blockForCycle(s.cycle);
  const lines: string[] = [];
  lines.push(`Phase: ${c.phase}. Cycle ${s.cycle}, block ${block}, week ${s.week} (week 4 is a deload), day ${s.day} (${DAY_LIFT[s.day]} day).`);
  lines.push(`Training maxes (kg): ${LIFTS.map((l) => `${l} ${c.tms[l] ?? 'unknown'}`).join(', ')}.`);
  lines.push(`Training weekdays (1 = Mon … 7 = Sun): ${c.trainingDays.join(', ')}.`);
  lines.push('Today, in the order done (ordered vs actual; dumbbell weights are per hand):');
  for (const e of s.exercises) {
    const work = e.prescription.filter((p) => p.kind !== 'warmup');
    const ordered = work.map((p) => `${kgText(p.kg)} x ${p.targetReps ?? p.repMax}${p.kind === 'amrap' ? '+' : ''}`).join(', ');
    const did = e.actual
      .filter((a) => work.some((p) => p.order === a.order))
      .map((a) => (a.done ? `${kgText(a.kg)} x ${a.reps ?? '?'}` : 'not done') + (a.flag ? ` [${a.flag}]` : '') + (a.note ? ` "${a.note.slice(0, 120)}"` : '') + (a.pain ? ' [PAIN]' : ''))
      .join(', ');
    const range = work[0] ? ` (range ${work[0].repMin}-${work[0].repMax})` : '';
    lines.push(`- ${e.slot} ${c.name(e.exerciseId)} [id ${e.exerciseId}]${range}${e.skipped ? ' SKIPPED' : ''}. Ordered: ${ordered}. Did: ${did || 'nothing'}.${e.note ? ` Note: "${e.note.slice(0, 200)}"` : ''}`);
  }
  if (s.cardio) {
    const cd = s.cardio;
    lines.push(`Cardio: incline walk, planned ${cd.planMin} min; ${cd.skipped ? 'skipped' : cd.done ? `did ${cd.minutes ?? '?'} min${cd.inclinePct !== null ? ` at ${cd.inclinePct}% incline` : ''}${cd.speed !== null ? `, ${cd.speed} ${cd.speedUnit}` : ''}` : 'not logged'}.`);
  }
  if (s.startedAt && s.finishedAt) lines.push(`Time taken: ${Math.round((s.finishedAt - s.startedAt) / 60000)} min (budget 45 min for lifting).`);
  lines.push('Approved swaps per accessory slot for the rest of this block (slot: current | options):');
  for (const day of [1, 2, 3, 4] as Day[]) {
    for (const slot of ['A1', 'A2', 'B'] as Slot[]) {
      const m = menuSlot(day, slot, block);
      const current = exerciseFor(day, slot, block, c.choices as Record<string, ExerciseId>);
      lines.push(`  day ${day} ${slot}: ${current} | ${[m.pick, ...m.swaps].join(', ')}`);
    }
  }
  return lines.join('\n');
}

const RULES = [
  'You are Philip, the lifter\'s personal strength coach: confident, dry, a little sassy, short sentences. Evidence-based. Never insult body, weight or appearance. No emoji.',
  'Never diagnose. If anything suggests pain, injury, dizziness or chest symptoms, tell them to stop that exercise and see a professional, and propose no load increase for it.',
  'Only propose changes the data supports, the fewest that matter (0 to 4). Prefer keeping the plan when it is working.',
  'Allowed changes (JSON objects in "changes"):',
  '{"kind":"tm","lift":"squat|bench|rdl|ohp","toKg":number,"why":string} training max for the rest of this cycle, within 10% of the current one;',
  '{"kind":"rest","extraSec":15|30|45|60,"why":string} extra rest on every work set for the rest of the cycle;',
  '{"kind":"next","exerciseId":string,"kg":number|null,"reps":number|null,"sets":number|null,"why":string} the next time that accessory from today comes up: weight per hand for dumbbells (within 20% of today\'s order), target reps (inside its range), sets 2-5; null keeps Philip\'s rule;',
  '{"kind":"swap","day":1-4,"slot":"A1|A2|B","exerciseId":string,"why":string} only one of the approved options listed for that slot;',
  '{"kind":"days","days":[four distinct weekdays 1-7],"why":string} training weekdays.',
  'Use the brief (history, notes, earlier chats) to compare today with past sessions and to keep promises you made; never invent numbers it does not have.',
  REMEMBER_RULE,
  'Reply ONLY with JSON: {"message": string (plain words, max 600 chars), "changes": [ ... ], "remember": [string]}.',
].join('\n');

/** First report after a workout. */
export function reportPrompt(c: CoachContext, brief = ''): string {
  return [
    RULES,
    'Write the observation report for the workout below: what went well, what did not compared with earlier sessions, what you will change and why. 3 to 6 short sentences.',
    '',
    brief,
    brief ? '' : null,
    "Today's workout:",
    contextText(c),
  ]
    .filter((l) => l !== null)
    .join('\n');
}

/** A chat turn under the report: the owner's comment, with the report and recent turns as history. */
export function chatPrompt(c: CoachContext, thread: CoachThread, comment: string, brief = ''): string {
  const history = thread.messages
    .slice(-COACH_BOUNDS.historyTurns)
    .map((m: CoachMessage) => `${m.from === 'me' ? 'Lifter' : 'Philip'}: ${m.text}`)
    .join('\n');
  const open = thread.proposals.filter((p) => p.status === 'open').map((p) => JSON.stringify(p.change));
  return [
    RULES,
    'You already wrote the report below. The lifter is replying to it. Answer them directly. Propose new or revised changes only if their comment calls for it.',
    '',
    ...(brief ? [brief, ''] : []),
    "Today's workout:",
    contextText(c),
    '',
    `Your report: ${thread.report}`,
    open.length ? `Your open proposals: ${open.join('; ')}` : 'No open proposals.',
    history ? `Conversation so far:\n${history}` : '',
    `Lifter: ${comment.slice(0, 1000)}`,
  ].join('\n');
}

export interface CoachTurn {
  message: string;
  changes: { change: CoachChange; why: string }[];
  /** Story 9: short facts Philip wants kept (saved as notes by the caller). */
  remember: string[];
}

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Validates one proposed change against today's session and the bounds; null when it's not allowed. */
export function validateChange(raw: unknown, c: CoachContext): CoachChange | null {
  if (!isObj(raw)) return null;
  const s = c.session;
  const block = blockForCycle(s.cycle);
  switch (raw.kind) {
    case 'tm': {
      const lift = raw.lift as LiftId;
      const to = finite(raw.toKg);
      const from = LIFTS.includes(lift) ? c.tms[lift] : null;
      if (from === null || from === undefined || to === null) return null;
      const lo = from * (1 - COACH_BOUNDS.tmPct);
      const hi = from * (1 + COACH_BOUNDS.tmPct);
      const toKg = roundTo(Math.min(hi, Math.max(lo, to)), 0.5);
      return toKg === from ? null : { kind: 'tm', lift, toKg };
    }
    case 'rest': {
      const sec = finite(raw.extraSec);
      if (sec === null) return null;
      const [min, max] = COACH_BOUNDS.restSec;
      const extra = Math.round(Math.min(max, Math.max(min, sec)) / 15) * 15;
      return { kind: 'rest', extraSec: Math.min(extra, MAX_REST_BONUS_SEC) };
    }
    case 'next': {
      const ex = s.exercises.find((e) => e.slot !== 'main' && e.exerciseId === raw.exerciseId);
      if (!ex) return null;
      const first = ex.prescription.find((p) => p.kind === 'accessory');
      if (!first) return null;
      let kg: number | null = null;
      const k = finite(raw.kg);
      if (k !== null && k > 0 && first.kg !== null && first.kg > 0) {
        const lo = first.kg * (1 - COACH_BOUNDS.nextKgPct);
        const hi = first.kg * (1 + COACH_BOUNDS.nextKgPct);
        kg = Math.max(0, roundToStep(Math.min(hi, Math.max(lo, k)), c.unit));
        if (kg === first.kg) kg = null;
      }
      const r = finite(raw.reps);
      const reps = r === null ? null : Math.round(Math.min(first.repMax, Math.max(first.repMin, r)));
      const st = finite(raw.sets);
      const [smin, smax] = COACH_BOUNDS.sets;
      const sets = st === null ? null : Math.round(Math.min(smax, Math.max(smin, st)));
      if (kg === null && reps === null && sets === null) return null;
      return { kind: 'next', exerciseId: ex.exerciseId, kg, reps, sets };
    }
    case 'swap': {
      const day = finite(raw.day);
      const slot = raw.slot;
      if (day === null || ![1, 2, 3, 4].includes(day) || (slot !== 'A1' && slot !== 'A2' && slot !== 'B')) return null;
      const m = menuSlot(day as Day, slot, block);
      const id = raw.exerciseId;
      if (typeof id !== 'string' || ![m.pick, ...m.swaps].includes(id as ExerciseId)) return null;
      if (exerciseFor(day as Day, slot, block, c.choices as Record<string, ExerciseId>) === id) return null;
      return { kind: 'swap', day: day as Day, slot, exerciseId: id };
    }
    case 'days': {
      if (!Array.isArray(raw.days)) return null;
      const days = [...new Set(raw.days.filter((d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b);
      if (days.length !== 4) return null;
      if (days.join() === [...c.trainingDays].sort((a, b) => a - b).join()) return null;
      return { kind: 'days', days: days as IsoWeekday[] };
    }
    default:
      return null;
  }
}

/** Parses Gemini's reply; null when there's no usable message. Invalid changes are dropped, not fixed up. */
export function parseCoachTurn(raw: unknown, c: CoachContext): CoachTurn | null {
  if (!isObj(raw)) return null;
  const message = typeof raw.message === 'string' ? cleanText(raw.message, COACH_BOUNDS.messageMax) : '';
  if (!message) return null;
  const list = Array.isArray(raw.changes) ? raw.changes.slice(0, 6) : [];
  const changes: CoachTurn['changes'] = [];
  for (const x of list) {
    const change = validateChange(x, c);
    if (!change) continue;
    // One proposal per target: the later one wins.
    const key = targetKey(change);
    const i = changes.findIndex((y) => targetKey(y.change) === key);
    const why = isObj(x) && typeof x.why === 'string' ? cleanText(x.why, COACH_BOUNDS.whyMax) : '';
    if (i >= 0) changes.splice(i, 1);
    changes.push({ change, why });
  }
  return { message, changes, remember: parseRemember(raw) };
}

/** What a change targets, so a newer proposal replaces an older open one for the same thing. */
export function targetKey(c: CoachChange): string {
  switch (c.kind) {
    case 'tm':
      return `tm:${c.lift}`;
    case 'rest':
      return 'rest';
    case 'next':
      return `next:${c.exerciseId}`;
    case 'swap':
      return `swap:${c.day}:${c.slot}`;
    case 'days':
      return 'days';
  }
}

/** Adds a Philip turn to the thread: his message, and new proposals superseding open ones for the same target. */
export function addPhilipTurn(thread: CoachThread, turn: CoachTurn, now: number, newId: () => string): CoachThread {
  const keys = new Set(turn.changes.map((c) => targetKey(c.change)));
  const proposals = thread.proposals.map((p) => (p.status === 'open' && keys.has(targetKey(p.change)) ? { ...p, status: 'declined' as const } : p));
  for (const c of turn.changes) proposals.push({ id: newId(), change: c.change, why: c.why, status: 'open' });
  return { ...thread, proposals, messages: [...thread.messages, { from: 'philip', text: turn.message, at: now }], updatedAt: now };
}

/** A new thread from the first report. */
export function newThread(turn: CoachTurn, now: number, newId: () => string): CoachThread {
  return {
    report: turn.message,
    proposals: turn.changes.map((c) => ({ id: newId(), change: c.change, why: c.why, status: 'open' as const })),
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}
