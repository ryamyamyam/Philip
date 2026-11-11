/**
 * The optional `training` block of a backup (Story 5, T-012). Backups without it (made before
 * Story 5) restore unchanged; `schemaVersion` stays 1. Validation is structural and strict on the
 * fields the app relies on; anything wrong throws `TrainingBackupError` (wrapped as `invalid`).
 */
import type { PhilipDB } from '../../db/db';
import type {
  AccessoryOverride,
  CardioLog,
  CoachChange,
  CoachChatMessage,
  CoachNote,
  CoachThread,
  IsoWeekday,
  ReviewApplied,
  ActualSet,
  CycleRecord,
  SessionExercise,
  SlotChoice,
  TmRecord,
  TrainingProgram,
  Treadmill,
  WorkoutSession,
} from '../../db/types';
import { isValidYmd } from '../date';
import type { Prescribed } from './session';

export interface TrainingBackup {
  program: TrainingProgram | null;
  tmHistory: TmRecord[];
  cycles: CycleRecord[];
  sessions: WorkoutSession[];
  slotChoices: SlotChoice[];
  /** Story 9: Philip's notes and the Ask Philip chat. Absent in older backups (restores as empty). */
  coachNotes?: CoachNote[];
  coachMessages?: CoachChatMessage[];
}

export const emptyTraining = (): TrainingBackup => ({ program: null, tmHistory: [], cycles: [], sessions: [], slotChoices: [] });

export async function exportTraining(database: PhilipDB): Promise<TrainingBackup> {
  return {
    program: (await database.trainingProgram.get('me')) ?? null,
    tmHistory: await database.tmHistory.toArray(),
    cycles: await database.cycles.orderBy('index').toArray(),
    sessions: await database.workoutSessions.orderBy('date').toArray(),
    slotChoices: await database.slotChoices.toArray(),
    coachNotes: await database.coachNotes.orderBy('createdAt').toArray(),
    coachMessages: await database.coachMessages.orderBy('at').toArray(),
  };
}

export class TrainingBackupError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'TrainingBackupError';
  }
}

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const LIFTS = ['squat', 'bench', 'rdl', 'ohp'] as const;
const BLOCKS = ['A', 'B', 'C', 'D'] as const;
const PHASES = ['lose', 'maintain', 'gain'] as const;

function fail(path: string, msg: string): never {
  throw new TrainingBackupError(`training.${path}: ${msg}`);
}
function obj(x: unknown, path: string): Obj {
  if (!isObj(x)) fail(path, 'not an object');
  return x;
}
function list(x: unknown, path: string): unknown[] {
  if (x == null) return [];
  if (!Array.isArray(x)) fail(path, 'must be a list');
  return x;
}
function num(o: Obj, k: string, path: string, min = -1e15, max = 1e15): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(path, `${k} must be a number in range`);
  return v;
}
function numOrNull(o: Obj, k: string, path: string, min?: number, max?: number): number | null {
  return o[k] == null ? null : num(o, k, path, min, max);
}
function str(o: Obj, k: string, path: string, max = 200): string {
  const v = o[k];
  if (typeof v !== 'string' || v.length > max) fail(path, `${k} must be text`);
  return v;
}
function oneOf<T extends string>(o: Obj, k: string, allowed: readonly T[], path: string): T {
  const v = o[k];
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) fail(path, `${k} has an unexpected value`);
  return v as T;
}
function int<T extends number>(o: Obj, k: string, allowed: readonly T[], path: string): T {
  const v = o[k];
  if (typeof v !== 'number' || !(allowed as readonly number[]).includes(v)) fail(path, `${k} has an unexpected value`);
  return v as T;
}
const bool = (o: Obj, k: string) => o[k] === true;

function tms(x: unknown, path: string): Record<(typeof LIFTS)[number], number> {
  const o = obj(x, path);
  return {
    squat: num(o, 'squat', path, 0, 1000),
    bench: num(o, 'bench', path, 0, 1000),
    rdl: num(o, 'rdl', path, 0, 1000),
    ohp: num(o, 'ohp', path, 0, 1000),
  };
}

function program(x: unknown): TrainingProgram | null {
  if (x == null) return null;
  const p = 'program';
  const o = obj(x, p);
  const bar = obj(o.bar, `${p}.bar`);
  const plates = list(bar.plates, `${p}.bar.plates`).map((v) => {
    if (typeof v !== 'number' || !(v > 0) || v > 100) fail(`${p}.bar.plates`, 'bad plate size');
    return v;
  });
  return {
    id: 'me',
    startedAt: num(o, 'startedAt', p),
    bar: { barKg: num(bar, 'barKg', `${p}.bar`, 0, 50), plateUnit: oneOf(bar, 'plateUnit', ['kg', 'lb'], `${p}.bar`), plates },
    weightUnit: oneOf(o, 'weightUnit', ['kg', 'lb'], p),
    unavailableEquipment: list(o.unavailableEquipment, `${p}.unavailableEquipment`).filter((s): s is string => typeof s === 'string'),
    currentCycle: num(o, 'currentCycle', p, 0, 10000),
    createdAt: num(o, 'createdAt', p),
    updatedAt: num(o, 'updatedAt', p),
    ...(o.trainingDays != null ? { trainingDays: trainingDays(o.trainingDays, `${p}.trainingDays`) } : {}),
    ...(o.dayOrder != null ? { dayOrder: dayOrder(o.dayOrder, `${p}.dayOrder`) } : {}),
    ...(o.nextOverrides != null ? { nextOverrides: list(o.nextOverrides, `${p}.nextOverrides`).map((v, i) => override(v, `${p}.nextOverrides[${i}]`)) } : {}),
    ...(o.treadmill != null ? { treadmill: treadmill(o.treadmill, `${p}.treadmill`) } : {}),
  };
}

/** Story 10: the owner's treadmill (optional). */
function treadmill(x: unknown, path: string): Treadmill {
  const o = obj(x, path);
  return {
    name: typeof o.name === 'string' ? o.name.slice(0, 80) : '',
    scale: oneOf(o, 'scale', ['mph', 'kmh', 'level'] as const, path),
    ...(o.maxLevel != null ? { maxLevel: num(o, 'maxLevel', path, 2, 40) } : {}),
    ...(o.minMph != null ? { minMph: num(o, 'minMph', path, 0, 2) } : {}),
    ...(o.maxMph != null ? { maxMph: num(o, 'maxMph', path, 4, 15) } : {}),
    source: oneOf(o, 'source', ['philip', 'me'] as const, path),
  };
}

const SLOTS = ['main', 'A1', 'A2', 'B'] as const;

function dayOrder(x: unknown, path: string): Partial<Record<string, (typeof SLOTS)[number][]>> {
  const o = obj(x, path);
  const out: Partial<Record<string, (typeof SLOTS)[number][]>> = {};
  for (const k of ['1', '2', '3', '4']) {
    if (o[k] == null) continue;
    out[k] = list(o[k], `${path}.${k}`).map((v) => {
      if (typeof v !== 'string' || !(SLOTS as readonly string[]).includes(v)) fail(`${path}.${k}`, 'unknown slot');
      return v as (typeof SLOTS)[number];
    });
  }
  return out;
}

function override(x: unknown, path: string): AccessoryOverride {
  const o = obj(x, path);
  return {
    exerciseId: str(o, 'exerciseId', path, 60),
    afterSessionId: str(o, 'afterSessionId', path, 100),
    kg: numOrNull(o, 'kg', path, 0, 1000),
    reps: numOrNull(o, 'reps', path, 0, 600),
    sets: numOrNull(o, 'sets', path, 0, 20),
  };
}

function cardio(x: unknown, path: string): CardioLog {
  const o = obj(x, path);
  return {
    kind: oneOf(o, 'kind', ['incline-walk'] as const, path),
    planMin: num(o, 'planMin', path, 0, 600),
    minutes: numOrNull(o, 'minutes', path, 0, 600),
    inclinePct: numOrNull(o, 'inclinePct', path, 0, 100),
    speed: numOrNull(o, 'speed', path, 0, 100),
    speedUnit: oneOf(o, 'speedUnit', ['mph', 'kmh', 'level'] as const, path),
    ...(o.speedMph != null ? { speedMph: num(o, 'speedMph', path, 0, 30) } : {}),
    done: bool(o, 'done'),
    skipped: bool(o, 'skipped'),
  };
}

function weekdays(x: unknown, path: string): IsoWeekday[] {
  return trainingDays(x, path);
}

function coachChange(x: unknown, path: string): CoachChange {
  const o = obj(x, path);
  const kind = oneOf(o, 'kind', ['tm', 'rest', 'swap', 'next', 'days'] as const, path);
  switch (kind) {
    case 'tm':
      return { kind, lift: oneOf(o, 'lift', LIFTS, path), toKg: num(o, 'toKg', path, 0, 1000) };
    case 'rest':
      return { kind, extraSec: num(o, 'extraSec', path, 0, 600) };
    case 'swap':
      return { kind, day: int(o, 'day', [1, 2, 3, 4] as const, path), slot: oneOf(o, 'slot', ['A1', 'A2', 'B'] as const, path), exerciseId: str(o, 'exerciseId', path, 60) };
    case 'next':
      return { kind, exerciseId: str(o, 'exerciseId', path, 60), kg: numOrNull(o, 'kg', path, 0, 1000), reps: numOrNull(o, 'reps', path, 0, 600), sets: numOrNull(o, 'sets', path, 0, 20) };
    case 'days':
      return { kind, days: weekdays(o.days, `${path}.days`) };
  }
}

function coach(x: unknown, path: string): CoachThread {
  const o = obj(x, path);
  return {
    report: str(o, 'report', path, 4000),
    proposals: list(o.proposals, `${path}.proposals`).map((v, i) => {
      const q = `${path}.proposals[${i}]`;
      const p = obj(v, q);
      return { id: str(p, 'id', q, 100), change: coachChange(p.change, `${q}.change`), why: p.why == null ? '' : str(p, 'why', q, 1000), status: oneOf(p, 'status', ['open', 'applied', 'declined'] as const, q) };
    }),
    messages: list(o.messages, `${path}.messages`).map((v, i) => {
      const q = `${path}.messages[${i}]`;
      const m = obj(v, q);
      return { from: oneOf(m, 'from', ['me', 'philip'] as const, q), text: str(m, 'text', q, 4000), at: num(m, 'at', q) };
    }),
    createdAt: num(o, 'createdAt', path),
    updatedAt: num(o, 'updatedAt', path),
  };
}

function trainingDays(x: unknown, path: string): IsoWeekday[] {
  const days = list(x, path).map((v) => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 7) fail(path, 'weekdays must be 1–7');
    return v as IsoWeekday;
  });
  if (new Set(days).size !== days.length || days.length > 7) fail(path, 'weekdays must be distinct');
  return days;
}

function reviewApplied(x: unknown, path: string): ReviewApplied {
  const o = obj(x, path);
  return {
    tm: list(o.tm, `${path}.tm`).map((v, i) => {
      const q = `${path}.tm[${i}]`;
      const t = obj(v, q);
      return { lift: oneOf(t, 'lift', LIFTS, q), fromKg: num(t, 'fromKg', q, 0, 1000), toKg: num(t, 'toKg', q, 0, 1000) };
    }),
    restBonusAddedSec: num(o, 'restBonusAddedSec', path, 0, 600),
    ...(o.swaps != null
      ? {
          swaps: list(o.swaps, `${path}.swaps`).map((v, i) => {
            const q = `${path}.swaps[${i}]`;
            const w = obj(v, q);
            return { slotKey: str(w, 'slotKey', q, 30), from: w.from == null ? null : str(w, 'from', q, 60), to: str(w, 'to', q, 60) };
          }),
        }
      : {}),
    ...(o.days != null
      ? (() => {
          const d = obj(o.days, `${path}.days`);
          return { days: { from: d.from == null ? null : trainingDays(d.from, `${path}.days.from`), to: trainingDays(d.to, `${path}.days.to`) } };
        })()
      : {}),
  };
}

function tmRecord(x: unknown, i: number): TmRecord {
  const p = `tmHistory[${i}]`;
  const o = obj(x, p);
  return {
    lift: oneOf(o, 'lift', LIFTS, p),
    tmKg: num(o, 'tmKg', p, 0, 1000),
    effectiveCycle: num(o, 'effectiveCycle', p, 0, 10000),
    reason: oneOf(o, 'reason', ['setup', 'cycle', 'miss', 'pain', 'retest', 'adjust', 'undo'], p),
    createdAt: num(o, 'createdAt', p),
  };
}

function cycle(x: unknown, i: number): CycleRecord {
  const p = `cycles[${i}]`;
  const o = obj(x, p);
  const g = obj(o.goal, `${p}.goal`);
  return {
    index: num(o, 'index', p, 1, 10000),
    block: oneOf(o, 'block', BLOCKS, p),
    startedAt: num(o, 'startedAt', p),
    phase: oneOf(o, 'phase', PHASES, p),
    tms: tms(o.tms, `${p}.tms`),
    goal: {
      startWeightKg: num(g, 'startWeightKg', `${p}.goal`, 20, 400),
      startBfPct: numOrNull(g, 'startBfPct', `${p}.goal`, 3, 60),
      endWeightKg: num(g, 'endWeightKg', `${p}.goal`, 20, 400),
      weeklyRatePct: num(g, 'weeklyRatePct', `${p}.goal`, -5, 5),
      bfLinePct: numOrNull(g, 'bfLinePct', `${p}.goal`, 3, 60),
      source: oneOf(g, 'source', ['philip', 'user'], `${p}.goal`),
      targetPlanId: numOrNull(g, 'targetPlanId', `${p}.goal`),
    },
    ...(o.restBonusSec != null ? { restBonusSec: num(o, 'restBonusSec', p, 0, 600) } : {}),
  };
}

function prescribed(x: unknown, path: string): Prescribed {
  const o = obj(x, path);
  return {
    order: num(o, 'order', path, 0, 100),
    kind: oneOf(o, 'kind', ['warmup', 'main', 'amrap', 'top', 'backoff', 'accessory'], path),
    kg: numOrNull(o, 'kg', path, 0, 1000),
    pct: numOrNull(o, 'pct', path, 0, 2),
    repMin: num(o, 'repMin', path, 0, 600),
    repMax: num(o, 'repMax', path, 0, 600),
    timed: bool(o, 'timed'),
    perSide: bool(o, 'perSide'),
    rir: num(o, 'rir', path, 0, 10),
    restSec: num(o, 'restSec', path, 0, 3600),
    ...(o.targetReps != null ? { targetReps: num(o, 'targetReps', path, 0, 600) } : {}),
    ...(o.estimate === true ? { estimate: true } : {}),
    ...(o.assist === true ? { assist: true } : {}),
  };
}

function actual(x: unknown, path: string): ActualSet {
  const o = obj(x, path);
  return {
    order: num(o, 'order', path, 0, 100),
    kg: numOrNull(o, 'kg', path, 0, 1000),
    reps: numOrNull(o, 'reps', path, 0, 600),
    done: bool(o, 'done'),
    pain: bool(o, 'pain'),
    copiedFromOrder: bool(o, 'copiedFromOrder'),
    ...(o.flag != null ? { flag: oneOf(o, 'flag', ['breath', 'heavy', 'easy', 'pain'] as const, path) } : {}),
    ...(o.note != null ? { note: str(o, 'note', path, 1000) } : {}),
  };
}

function exercise(x: unknown, path: string): SessionExercise {
  const o = obj(x, path);
  return {
    slot: oneOf(o, 'slot', ['main', 'A1', 'A2', 'B'], path),
    exerciseId: str(o, 'exerciseId', path, 60),
    swappedFrom: o.swappedFrom == null ? null : str(o, 'swappedFrom', path, 60),
    note: o.note == null ? '' : str(o, 'note', path, 1000),
    prescription: list(o.prescription, `${path}.prescription`).map((s, i) => prescribed(s, `${path}.prescription[${i}]`)),
    actual: list(o.actual, `${path}.actual`).map((s, i) => actual(s, `${path}.actual[${i}]`)),
    ...(o.skipped === true ? { skipped: true } : {}),
    ...(o.originalPrescription != null
      ? { originalPrescription: list(o.originalPrescription, `${path}.originalPrescription`).map((s, i) => prescribed(s, `${path}.originalPrescription[${i}]`)) }
      : {}),
  };
}

function session(x: unknown, i: number): WorkoutSession {
  const p = `sessions[${i}]`;
  const o = obj(x, p);
  if (!isValidYmd(o.date)) fail(p, 'date must be a YYYY-MM-DD date');
  return {
    id: str(o, 'id', p, 100),
    date: o.date,
    cycle: num(o, 'cycle', p, 1, 10000),
    block: oneOf(o, 'block', BLOCKS, p),
    week: int(o, 'week', [1, 2, 3, 4] as const, p),
    day: int(o, 'day', [1, 2, 3, 4] as const, p),
    status: oneOf(o, 'status', ['in_progress', 'done', 'skipped'], p),
    estMinutes: num(o, 'estMinutes', p, 0, 600),
    startedAt: num(o, 'startedAt', p),
    finishedAt: numOrNull(o, 'finishedAt', p),
    exercises: list(o.exercises, `${p}.exercises`).map((e, j) => exercise(e, `${p}.exercises[${j}]`)),
    ...(o.reviewed === true ? { reviewed: true } : {}),
    ...(o.reviewApplied != null ? { reviewApplied: reviewApplied(o.reviewApplied, `${p}.reviewApplied`) } : {}),
    ...(o.cardio != null ? { cardio: cardio(o.cardio, `${p}.cardio`) } : {}),
    ...(o.coach != null ? { coach: coach(o.coach, `${p}.coach`) } : {}),
    ...(o.editing === true ? { editing: true } : {}),
  };
}

function choice(x: unknown, i: number): SlotChoice {
  const p = `slotChoices[${i}]`;
  const o = obj(x, p);
  return { slotKey: str(o, 'slotKey', p, 30), exerciseId: str(o, 'exerciseId', p, 60), chosenAt: num(o, 'chosenAt', p) };
}

/** Validates the raw `training` block (absent → empty). Throws TrainingBackupError. */
export function parseTraining(raw: unknown): TrainingBackup {
  if (raw == null) return emptyTraining();
  const o = obj(raw, '');
  const sessions = list(o.sessions, 'sessions').map(session);
  const seen = new Set<string>();
  return {
    program: program(o.program),
    tmHistory: list(o.tmHistory, 'tmHistory').map(tmRecord),
    cycles: list(o.cycles, 'cycles').map(cycle),
    sessions: sessions.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true))),
    slotChoices: list(o.slotChoices, 'slotChoices').map(choice),
    coachNotes: list(o.coachNotes, 'coachNotes').map(coachNote),
    coachMessages: list(o.coachMessages, 'coachMessages').map(coachMessage),
  };
}

function coachNote(x: unknown, i: number): CoachNote {
  const p = `coachNotes[${i}]`;
  const o = obj(x, p);
  const source = o.source === 'ask' ? 'ask' : o.source === 'report' ? 'report' : fail(p, 'source');
  return { text: str(o, 'text', p, 400), source, sessionId: o.sessionId == null ? null : str(o, 'sessionId', p), createdAt: num(o, 'createdAt', p, 0) };
}

function coachMessage(x: unknown, i: number): CoachChatMessage {
  const p = `coachMessages[${i}]`;
  const o = obj(x, p);
  const from = o.from === 'me' ? 'me' : o.from === 'philip' ? 'philip' : fail(p, 'from');
  return { from, text: str(o, 'text', p, 2000), at: num(o, 'at', p, 0) };
}

export const TRAINING_TABLES = ['trainingProgram', 'tmHistory', 'cycles', 'workoutSessions', 'slotChoices', 'coachNotes', 'coachMessages'] as const;

/**
 * Restores the training block inside the caller's transaction.
 *  - replace: clears training and writes the backup's.
 *  - merge: if this device has no program, takes the backup's whole training history; otherwise keeps
 *    the local program, TMs and cycles, adds sessions it doesn't have (same id: the later finished one
 *    wins) and swaps it doesn't have.
 */
export async function restoreTraining(database: PhilipDB, t: TrainingBackup, mode: 'merge' | 'replace'): Promise<number> {
  if (mode === 'replace' || !(await database.trainingProgram.get('me'))) {
    await Promise.all([
      database.trainingProgram.clear(),
      database.tmHistory.clear(),
      database.cycles.clear(),
      database.workoutSessions.clear(),
      database.slotChoices.clear(),
    ]);
    if (t.program) await database.trainingProgram.put(t.program);
    await database.tmHistory.bulkAdd(t.tmHistory.map(({ id: _id, ...r }) => r));
    await database.cycles.bulkPut(t.cycles);
    await database.workoutSessions.bulkPut(t.sessions);
    await database.slotChoices.bulkPut(t.slotChoices);
    await restoreMemory(database, t, mode);
    return t.sessions.length;
  }
  let added = 0;
  const writes: WorkoutSession[] = [];
  for (const s of t.sessions) {
    const local = await database.workoutSessions.get(s.id);
    if (!local) {
      writes.push(s);
      added++;
    } else if ((s.finishedAt ?? 0) > (local.finishedAt ?? 0)) writes.push(s);
  }
  await database.workoutSessions.bulkPut(writes);
  for (const c of t.slotChoices) if (!(await database.slotChoices.get(c.slotKey))) await database.slotChoices.put(c);
  await restoreMemory(database, t, 'merge');
  return added;
}

/** Story 9: notes and the Ask chat. Replace clears them; merge adds notes and lines this device doesn't have. */
async function restoreMemory(database: PhilipDB, t: TrainingBackup, mode: 'merge' | 'replace'): Promise<void> {
  const notes = (t.coachNotes ?? []).map(({ id: _id, ...n }) => n);
  const msgs = (t.coachMessages ?? []).map(({ id: _id, ...m }) => m);
  if (mode === 'replace') {
    await Promise.all([database.coachNotes.clear(), database.coachMessages.clear()]);
    await database.coachNotes.bulkAdd(notes);
    await database.coachMessages.bulkAdd(msgs);
    return;
  }
  const haveNotes = new Set((await database.coachNotes.toArray()).map((n) => n.text.toLowerCase().trim()));
  await database.coachNotes.bulkAdd(notes.filter((n) => !haveNotes.has(n.text.toLowerCase().trim())));
  const key = (m: { from: string; at: number; text: string }) => `${m.from}|${m.at}|${m.text}`;
  const haveMsgs = new Set((await database.coachMessages.toArray()).map(key));
  await database.coachMessages.bulkAdd(msgs.filter((m) => !haveMsgs.has(key(m))));
}
