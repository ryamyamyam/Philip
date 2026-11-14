/** Data access functions. UI components call these instead of touching tables directly. */
import { db, newId, defaultProfile, type PhilipDB } from './db';
import type {
  CoachChatMessage,
  CoachNote,
  CoachThread,
  CycleRecord,
  FoodEntry,
  IsoWeekday,
  ReviewApplied,
  Macros,
  Meal,
  Profile,
  SavedFood,
  SavedMeal,
  SavedMealItem,
  TargetPlan,
  TmRecord,
  TrainingProgram,
  WeightEntry,
  WorkoutSession,
  YMD,
} from './types';
import { blockForCycle, type LiftId } from '../lib/training/program';
import type { SessionSlot } from '../lib/training/session';
import { slotKey } from '../lib/training/exercises';
import { adjustedTm, MAX_REST_BONUS_SEC } from '../lib/training/checkin';
import { tmsForCycle } from '../lib/training/progress';
import { roundMacros } from '../lib/nutrition';
import { todayYmd } from '../lib/date';

export type NewFoodEntry = Omit<FoodEntry, 'id' | 'createdAt' | 'updatedAt'>;

function cleanMacros<T extends Macros>(m: T): T {
  return { ...m, ...roundMacros(m) };
}

export async function addFoodEntry(input: NewFoodEntry, database: PhilipDB = db): Promise<string> {
  const now = Date.now();
  const entry: FoodEntry = cleanMacros({ ...input, name: input.name.trim(), id: newId(), createdAt: now, updatedAt: now });
  await database.foodEntries.add(entry);
  return entry.id;
}

export async function addFoodEntries(inputs: NewFoodEntry[], database: PhilipDB = db): Promise<string[]> {
  const now = Date.now();
  const entries = inputs.map((input, i) =>
    cleanMacros({ ...input, name: input.name.trim(), id: newId(), createdAt: now + i, updatedAt: now + i }),
  );
  await database.foodEntries.bulkAdd(entries);
  return entries.map((e) => e.id);
}

export async function updateFoodEntry(
  id: string,
  changes: Partial<Omit<FoodEntry, 'id' | 'createdAt'>>,
  database: PhilipDB = db,
): Promise<void> {
  const existing = await database.foodEntries.get(id);
  if (!existing) throw new Error('Entry not found');
  const next = cleanMacros({ ...existing, ...changes, updatedAt: Date.now() });
  next.name = next.name.trim();
  await database.foodEntries.put(next);
}

export async function deleteFoodEntry(id: string, database: PhilipDB = db): Promise<FoodEntry | undefined> {
  const existing = await database.foodEntries.get(id);
  await database.foodEntries.delete(id);
  return existing;
}

/**
 * Moves an entry to another day and/or meal, keeping its id and nutrition values.
 * Returns where it was before (for undo), or undefined if it no longer exists.
 */
export async function moveFoodEntry(
  id: string,
  target: { date: YMD; meal: Meal },
  database: PhilipDB = db,
): Promise<{ date: YMD; meal: Meal } | undefined> {
  const existing = await database.foodEntries.get(id);
  if (!existing) return undefined;
  await database.foodEntries.update(id, { date: target.date, meal: target.meal, updatedAt: Date.now() });
  return { date: existing.date, meal: existing.meal };
}

/** Re-inserts a deleted entry (undo). */
export async function restoreFoodEntry(entry: FoodEntry, database: PhilipDB = db): Promise<void> {
  await database.foodEntries.put(entry);
}

export async function duplicateFoodEntry(
  id: string,
  target?: { date?: YMD; meal?: Meal },
  database: PhilipDB = db,
): Promise<string> {
  const e = await database.foodEntries.get(id);
  if (!e) throw new Error('Entry not found');
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = e;
  return addFoodEntry({ ...rest, date: target?.date ?? e.date, meal: target?.meal ?? e.meal }, database);
}

export function entriesForDate(date: YMD, database: PhilipDB = db): Promise<FoodEntry[]> {
  return database.foodEntries.where('date').equals(date).toArray();
}

export function entriesInRange(start: YMD, end: YMD, database: PhilipDB = db): Promise<FoodEntry[]> {
  return database.foodEntries.where('date').between(start, end, true, true).toArray();
}

/* ---------- Targets ---------- */

export function allTargetPlans(database: PhilipDB = db): Promise<TargetPlan[]> {
  return database.targetPlans.orderBy('effectiveFrom').toArray();
}

/** Always inserts a new plan. Existing plans are never modified, so history is preserved. */
export async function addTargetPlan(plan: Omit<TargetPlan, 'id' | 'createdAt'>, database: PhilipDB = db): Promise<number> {
  const id = await database.targetPlans.add({ ...plan, ...roundMacros(plan), createdAt: Date.now() });
  return id as number;
}

/* ---------- Profile ---------- */

export async function getProfile(database: PhilipDB = db): Promise<Profile> {
  return (await database.profile.get('me')) ?? defaultProfile();
}

export async function updateProfile(changes: Partial<Omit<Profile, 'id'>>, database: PhilipDB = db): Promise<void> {
  const current = await getProfile(database);
  // Story 11: body fat has no history, so remember the day it last changed (a goal check needs its age).
  const bfChanged = 'bodyFatPct' in changes && changes.bodyFatPct != null && changes.bodyFatPct !== current.bodyFatPct && !('bodyFatDate' in changes);
  await database.profile.put({ ...current, ...changes, ...(bfChanged ? { bodyFatDate: todayYmd() } : {}), id: 'me' });
}

/* ---------- Weight log ---------- */

/**
 * Logs body weight for a date (default today). One entry per date: logging again overwrites it.
 * When the date is the newest in the log, profile.weightKg is updated too so the calculator uses it.
 */
export async function logWeight(date: YMD, weightKg: number, database: PhilipDB = db): Promise<WeightEntry> {
  const kg = Math.round(weightKg * 10) / 10;
  return database.transaction('rw', database.weightEntries, database.profile, async () => {
    const now = Date.now();
    const existing = await database.weightEntries.get(date);
    const entry: WeightEntry = { date, weightKg: kg, createdAt: existing?.createdAt ?? now, updatedAt: now };
    await database.weightEntries.put(entry);
    const newest = await database.weightEntries.orderBy('date').last();
    if (newest?.date === date) {
      const p = (await database.profile.get('me')) ?? defaultProfile();
      await database.profile.put({ ...p, weightKg: kg, id: 'me' });
    }
    return entry;
  });
}

/** Removes one weigh-in (Undo restores it with restoreWeight). Profile weight is left as is. */
export async function deleteWeight(date: YMD, database: PhilipDB = db): Promise<WeightEntry | undefined> {
  const existing = await database.weightEntries.get(date);
  await database.weightEntries.delete(date);
  return existing;
}

export async function restoreWeight(entry: WeightEntry, database: PhilipDB = db): Promise<void> {
  await database.weightEntries.put(entry);
}

export function allWeightEntries(database: PhilipDB = db): Promise<WeightEntry[]> {
  return database.weightEntries.orderBy('date').toArray();
}

/* ---------- Saved foods ---------- */

export type NewSavedFood = Omit<SavedFood, 'id' | 'createdAt' | 'useCount' | 'lastUsedAt' | 'favorite'> &
  Partial<Pick<SavedFood, 'favorite'>>;

export async function addSavedFood(input: NewSavedFood, database: PhilipDB = db): Promise<string> {
  const food: SavedFood = cleanMacros({
    ...input,
    name: input.name.trim(),
    id: newId(),
    createdAt: Date.now(),
    useCount: 0,
    lastUsedAt: null,
    favorite: input.favorite ?? false,
  });
  await database.savedFoods.add(food);
  return food.id;
}

export async function updateSavedFood(id: string, changes: Partial<Omit<SavedFood, 'id'>>, database: PhilipDB = db): Promise<void> {
  const existing = await database.savedFoods.get(id);
  if (!existing) throw new Error('Saved food not found');
  await database.savedFoods.put(cleanMacros({ ...existing, ...changes, id }));
}

export async function deleteSavedFood(id: string, database: PhilipDB = db): Promise<void> {
  // Historical entries keep their copied values; only the link is cleared.
  await database.transaction('rw', database.savedFoods, database.foodEntries, async () => {
    await database.savedFoods.delete(id);
    await database.foodEntries.where('savedFoodId').equals(id).modify({ savedFoodId: null });
  });
}

/** Copies the saved food's values into a new entry and bumps usage stats. */
export async function logSavedFood(
  id: string,
  date: YMD,
  meal: Meal,
  grams?: number | null,
  database: PhilipDB = db,
): Promise<string> {
  return database.transaction('rw', database.savedFoods, database.foodEntries, async () => {
    const f = await database.savedFoods.get(id);
    if (!f) throw new Error('Saved food not found');
    let macros: Macros = { calories: f.calories, proteinG: f.proteinG, fatG: f.fatG, carbsG: f.carbsG };
    let finalGrams = f.grams;
    if (grams != null && f.grams && f.grams > 0 && grams !== f.grams) {
      const k = grams / f.grams;
      macros = roundMacros({ calories: f.calories * k, proteinG: f.proteinG * k, fatG: f.fatG * k, carbsG: f.carbsG * k });
      finalGrams = grams;
    }
    const entryId = await addFoodEntry(
      { date, meal, name: f.name, grams: finalGrams, ...macros, source: 'saved', savedFoodId: f.id, estimate: null },
      database,
    );
    await database.savedFoods.update(id, { useCount: f.useCount + 1, lastUsedAt: Date.now() });
    return entryId;
  });
}

/** Creates a saved food from an existing entry (or returns the existing link). */
export async function saveEntryAsFood(entryId: string, database: PhilipDB = db): Promise<string> {
  return database.transaction('rw', database.savedFoods, database.foodEntries, async () => {
    const e = await database.foodEntries.get(entryId);
    if (!e) throw new Error('Entry not found');
    const id = await addSavedFood(
      { name: e.name, grams: e.grams, calories: e.calories, proteinG: e.proteinG, fatG: e.fatG, carbsG: e.carbsG },
      database,
    );
    await database.savedFoods.update(id, { useCount: 1, lastUsedAt: e.createdAt });
    await database.foodEntries.update(entryId, { savedFoodId: id });
    return id;
  });
}

/* ---------- Saved meals (Story 3) ---------- */

function cleanMealItems(items: readonly SavedMealItem[]): SavedMealItem[] {
  return items
    .filter((i) => i.name.trim())
    .map((i) => ({ ...roundMacros(i), name: i.name.trim(), grams: i.grams == null ? null : Math.round(i.grams * 10) / 10 }));
}

/** Saves a named combination of foods. A meal with the same name (case-insensitive) is replaced. */
export async function saveMeal(name: string, items: readonly SavedMealItem[], database: PhilipDB = db): Promise<string> {
  const clean = cleanMealItems(items);
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Meal name required');
  if (clean.length === 0) throw new Error('Meal needs at least one food');
  return database.transaction('rw', database.savedMeals, async () => {
    const now = Date.now();
    const key = trimmed.toLocaleLowerCase();
    const existing = (await database.savedMeals.toArray()).find((m) => m.name.toLocaleLowerCase() === key);
    if (existing) {
      await database.savedMeals.put({ ...existing, name: trimmed, items: clean, updatedAt: now });
      return existing.id;
    }
    const meal: SavedMeal = { id: newId(), name: trimmed, items: clean, useCount: 0, lastUsedAt: null, createdAt: now, updatedAt: now };
    await database.savedMeals.add(meal);
    return meal.id;
  });
}

/** Most recently used first, then newest. */
export async function allSavedMeals(database: PhilipDB = db): Promise<SavedMeal[]> {
  const list = await database.savedMeals.toArray();
  return list.sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || b.createdAt - a.createdAt);
}

export async function deleteSavedMeal(id: string, database: PhilipDB = db): Promise<SavedMeal | undefined> {
  const existing = await database.savedMeals.get(id);
  await database.savedMeals.delete(id);
  return existing;
}

export async function restoreSavedMeal(meal: SavedMeal, database: PhilipDB = db): Promise<void> {
  await database.savedMeals.put(meal);
}

/**
 * OBS-A0308B: marks a saved meal as the everyday one for `meal` (null = stop). Only one saved meal per
 * meal: any other meal set for the same slot is cleared.
 */
export async function setSavedMealEveryday(id: string, meal: Meal | null, database: PhilipDB = db): Promise<void> {
  await database.transaction('rw', database.savedMeals, async () => {
    const target = await database.savedMeals.get(id);
    if (!target) return;
    if (meal) {
      const others = (await database.savedMeals.toArray()).filter((m) => m.id !== id && m.everyday === meal);
      for (const o of others) await database.savedMeals.update(o.id, { everyday: null, updatedAt: Date.now() });
    }
    if ((target.everyday ?? null) !== meal) await database.savedMeals.update(id, { everyday: meal, updatedAt: Date.now() });
  });
}

/** Bumps usage after a saved meal was logged (it is logged through the review sheet like any other food). */
export async function markSavedMealUsed(id: string, database: PhilipDB = db): Promise<void> {
  const m = await database.savedMeals.get(id);
  if (m) await database.savedMeals.update(id, { useCount: m.useCount + 1, lastUsedAt: Date.now() });
}

/** Removes entries by id (Undo after saving from the review sheet). */
export async function deleteFoodEntries(ids: readonly string[], database: PhilipDB = db): Promise<void> {
  await database.foodEntries.bulkDelete([...ids]);
}

/* ---------- Meta ---------- */

export async function getMeta<T>(key: string, database: PhilipDB = db): Promise<T | undefined> {
  return (await database.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown, database: PhilipDB = db): Promise<void> {
  await database.meta.put({ key, value });
}

export const META = {
  lastBackupAt: 'lastBackupAt',
  backupReminderSnoozedAt: 'backupReminderSnoozedAt',
  storagePersisted: 'storagePersisted',
  /** T-010: when Philip's tour was finished or skipped (ms). null = show it (Settings › Replay sets null). Not in backups. */
  tutorialSeenAt: 'tutorialSeenAt',
  /** Owner feedback (Nov 5): the tour's current step id, so it resumes after Set targets or a reload. */
  tutorialStep: 'tutorialStep',
  /** Story 6: rest-end beep on/off (absent = on). Device setting, not in backups. */
  restSound: 'restSound',
  /** Story 6: this device's push subscription for rest alerts (absent = alerts off). Not in backups. */
  restAlertSub: 'restAlertSub',
  /** Story 9: body (weight, body fat, age) and food data go into Philip's brief (absent = yes). Not in backups. */
  coachShareBody: 'coachShareBody',
  /** Story 11: goal events already shown ({cycle, kind, reason}[]), so each fires once. In backups via planChanges only. */
  goalPrompts: 'goalPrompts',
  /** Story 11: this device's pairing token for Philip in the cloud (the Worker). Device-only, never in backups. */
  coachCloudToken: 'coachCloudToken',
} as const;

/* ---------------- Training (Story 5, T-012) ---------------- */

/** The training program row, or undefined before setup. */
export function getTrainingProgram(database: PhilipDB = db): Promise<TrainingProgram | undefined> {
  return database.trainingProgram.get('me');
}

/**
 * Setup: creates (or updates) the program and records each entered TM as a `setup` row. Lifts left
 * out get Calibration in their first session. The first cycle starts with the goal briefing.
 */
export async function setUpTraining(
  input: { bar: TrainingProgram['bar']; weightUnit: TrainingProgram['weightUnit']; tms: Partial<Record<LiftId, number>> },
  database: PhilipDB = db,
): Promise<void> {
  const now = Date.now();
  await database.transaction('rw', [database.trainingProgram, database.tmHistory], async () => {
    const existing = await database.trainingProgram.get('me');
    await database.trainingProgram.put({
      id: 'me',
      startedAt: existing?.startedAt ?? now,
      bar: input.bar,
      weightUnit: input.weightUnit,
      unavailableEquipment: existing?.unavailableEquipment ?? [],
      currentCycle: existing?.currentCycle ?? 0,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    const cycle = Math.max(1, existing?.currentCycle ?? 1);
    for (const lift of Object.keys(input.tms) as LiftId[]) {
      const tmKg = input.tms[lift];
      if (tmKg != null) await database.tmHistory.add({ lift, tmKg, effectiveCycle: cycle, reason: 'setup', createdAt: now });
    }
  });
}

export async function updateTrainingProgram(
  changes: Partial<Omit<TrainingProgram, 'id' | 'createdAt'>>,
  database: PhilipDB = db,
): Promise<void> {
  await database.trainingProgram.update('me', { ...changes, updatedAt: Date.now() });
}

/** Appends a TM row (cycle progression, miss, pain hold or re-test). TM history is never edited. */
export async function addTm(record: Omit<TmRecord, 'id' | 'createdAt'>, database: PhilipDB = db): Promise<number> {
  return (await database.tmHistory.add({ ...record, createdAt: Date.now() })) as number;
}

export function allTmHistory(database: PhilipDB = db): Promise<TmRecord[]> {
  return database.tmHistory.orderBy('effectiveCycle').toArray();
}

/** Starts a cycle after the briefing: snapshots phase, TMs and goal, and moves the program to it. */
export async function startCycle(record: CycleRecord, database: PhilipDB = db): Promise<void> {
  await database.transaction('rw', [database.cycles, database.trainingProgram], async () => {
    await database.cycles.put(record);
    await database.trainingProgram.update('me', { currentCycle: record.index, updatedAt: Date.now() });
  });
}

export function allCycles(database: PhilipDB = db): Promise<CycleRecord[]> {
  return database.cycles.orderBy('index').toArray();
}

/** Saves a session (autosave on every input). Orders are written once at creation and never changed here. */
export async function saveWorkoutSession(session: WorkoutSession, database: PhilipDB = db): Promise<void> {
  const existing = await database.workoutSessions.get(session.id);
  if (existing) {
    // The frozen orders win: callers can only change the log, notes, swaps and status. A swap (new
    // exercise in the slot, chosen from Philip's approved list) brings that exercise's own orders.
    // Matched by slot, not position: the owner can reorder the day (Story 7).
    const exercises = session.exercises.map((e) => {
      const old = existing.exercises.find((o) => o.slot === e.slot);
      // A mid-workout change the owner OK'd (applyCheckin) is the one other way orders move.
      const keep = old && old.exerciseId === e.exerciseId && !e.originalPrescription;
      return { ...e, prescription: keep ? old.prescription : e.prescription };
    });
    await database.workoutSessions.put({ ...session, exercises });
  } else {
    await database.workoutSessions.put(session);
  }
}

export function allWorkoutSessions(database: PhilipDB = db): Promise<WorkoutSession[]> {
  return database.workoutSessions.orderBy('date').toArray();
}

/** Owner's sticky swap for a menu slot. Only approved swaps are honoured when sessions are built. */
export async function setSlotChoice(slotKey: string, exerciseId: string, database: PhilipDB = db): Promise<void> {
  await database.slotChoices.put({ slotKey, exerciseId, chosenAt: Date.now() });
}

export async function slotChoiceMap(database: PhilipDB = db): Promise<Record<string, string>> {
  return Object.fromEntries((await database.slotChoices.toArray()).map((c) => [c.slotKey, c.exerciseId]));
}

/** Reset program: removes the program, TMs, cycles and swaps; session logs are kept (spec §7). */
export async function resetTrainingProgram(database: PhilipDB = db): Promise<void> {
  await database.transaction('rw', [database.trainingProgram, database.tmHistory, database.cycles, database.slotChoices], async () => {
    await Promise.all([
      database.trainingProgram.clear(),
      database.tmHistory.clear(),
      database.cycles.clear(),
      database.slotChoices.clear(),
    ]);
  });
}

/** Saves today's orders after the owner OKs a mid-workout change; the original orders are kept alongside. */
export async function applyCheckin(session: WorkoutSession, database: PhilipDB = db): Promise<void> {
  await database.workoutSessions.put(session);
}

/** Extra rest for the rest of a cycle, accepted in an end-of-day review. */
export async function setCycleRestBonus(index: number, restBonusSec: number, database: PhilipDB = db): Promise<void> {
  await database.cycles.update(index, { restBonusSec });
}

/* ---------------- Story 6 (T-019): training days, review apply/undo, delete a log ---------------- */

/** The owner's training weekdays for the projected calendar (Settings › Training › Training days). */
export async function setTrainingDays(days: IsoWeekday[] | null, database: PhilipDB = db): Promise<void> {
  const program = await database.trainingProgram.get('me');
  if (!program) return;
  const next: TrainingProgram = { ...program, updatedAt: Date.now() };
  if (days === null) delete next.trainingDays;
  else next.trainingDays = [...new Set(days)].sort((a, b) => a - b);
  await database.trainingProgram.put(next);
}

/** Story 7 (OBS-F52773): remembers the owner's exercise order for a program day. */
export async function setDayOrder(day: number, order: SessionSlot[], database: PhilipDB = db): Promise<void> {
  const program = await database.trainingProgram.get('me');
  if (!program) return;
  await database.trainingProgram.put({ ...program, dayOrder: { ...(program.dayOrder ?? {}), [String(day)]: order }, updatedAt: Date.now() });
}

/** Story 7 (OBS-3DB146): saves Philip's report and the chat on a session (nothing in the plan changes). */
export async function saveCoachThread(sessionId: string, coach: CoachThread, database: PhilipDB = db): Promise<void> {
  await database.workoutSessions.update(sessionId, { coach });
}

export type ReviewChange = { kind: 'tm'; lift: LiftId; factor: number } | { kind: 'rest'; extraSec: number };

/**
 * "OK, apply" in the end-of-workout review (D-027), in one transaction: appends `adjust` TM rows,
 * raises the cycle's rest bonus (capped), and records what actually changed on the session
 * (`reviewApplied`) so deleting the log can undo it.
 */
export async function applyReview(sessionId: string, changes: readonly ReviewChange[], database: PhilipDB = db): Promise<ReviewApplied> {
  return database.transaction('rw', [database.workoutSessions, database.tmHistory, database.cycles], async () => {
    const session = await database.workoutSessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    const cycle = await database.cycles.get(session.cycle);
    const tms = tmsForCycle(await database.tmHistory.toArray(), session.cycle);
    const applied: ReviewApplied = { tm: [], restBonusAddedSec: 0 };
    const now = Date.now();
    for (const c of changes) {
      if (c.kind === 'tm') {
        const from = tms[c.lift];
        if (from === null) continue;
        const to = adjustedTm(from, c.factor);
        await database.tmHistory.add({ lift: c.lift, tmKg: to, effectiveCycle: session.cycle, reason: 'adjust', createdAt: now });
        tms[c.lift] = to;
        applied.tm.push({ lift: c.lift, fromKg: from, toKg: to });
      } else if (cycle) {
        const before = cycle.restBonusSec ?? 0;
        const after = Math.min(MAX_REST_BONUS_SEC, before + c.extraSec);
        cycle.restBonusSec = after;
        applied.restBonusAddedSec += after - before;
        await database.cycles.update(cycle.index, { restBonusSec: after });
      }
    }
    await database.workoutSessions.put({ ...session, reviewed: true, reviewApplied: mergeApplied(session.reviewApplied, applied) });
    return applied;
  });
}

/** Adds what one apply changed to what the session's earlier applies changed (rules review + report). */
function mergeApplied(a: ReviewApplied | undefined, b: ReviewApplied): ReviewApplied {
  if (!a) return b;
  const swaps = [...(a.swaps ?? [])];
  for (const s of b.swaps ?? []) {
    const i = swaps.findIndex((x) => x.slotKey === s.slotKey);
    // Undo goes back to what was there before the first change.
    if (i >= 0) swaps[i] = { ...s, from: swaps[i]?.from ?? null };
    else swaps.push(s);
  }
  const days = b.days ? { from: a.days ? a.days.from : b.days.from, to: b.days.to } : a.days;
  const orders = [...(a.orders ?? [])];
  for (const o of b.orders ?? []) {
    const i = orders.findIndex((x) => x.day === o.day);
    if (i >= 0) orders[i] = { ...o, from: orders[i]?.from ?? null };
    else orders.push(o);
  }
  return {
    tm: [...a.tm, ...b.tm],
    restBonusAddedSec: a.restBonusAddedSec + b.restBonusAddedSec,
    ...(swaps.length ? { swaps } : {}),
    ...(days ? { days } : {}),
    ...(orders.length ? { orders } : {}),
  };
}

/**
 * Story 7 (OBS-3DB146): applies the report proposals the owner OK'd, in one transaction, and records
 * them in `reviewApplied` so deleting the log undoes them:
 * - tm: appends an `adjust` TM row;
 * - rest: raises the cycle's rest bonus (capped);
 * - next: sets a next-time order for that accessory (inert once it's logged again);
 * - swap: sets the slot's sticky choice;
 * - days: sets the training weekdays;
 * - order (OBS-369BCA): sets a day's exercise order.
 * Proposals that aren't open are ignored. Returns the ids applied.
 */
export async function applyCoachProposals(sessionId: string, ids: readonly string[], database: PhilipDB = db): Promise<string[]> {
  return database.transaction(
    'rw',
    [database.workoutSessions, database.tmHistory, database.cycles, database.trainingProgram, database.slotChoices],
    async () => {
      const session = await database.workoutSessions.get(sessionId);
      const thread = session?.coach;
      if (!session || !thread) return [];
      const program = await database.trainingProgram.get('me');
      const cycle = await database.cycles.get(session.cycle);
      const tms = tmsForCycle(await database.tmHistory.toArray(), session.cycle);
      const applied: ReviewApplied = { tm: [], restBonusAddedSec: 0 };
      const done: string[] = [];
      const now = Date.now();
      let prog = program ? { ...program } : null;
      for (const p of thread.proposals) {
        if (p.status !== 'open' || !ids.includes(p.id)) continue;
        const c = p.change;
        if (c.kind === 'tm') {
          const from = tms[c.lift];
          if (from === null) continue;
          await database.tmHistory.add({ lift: c.lift, tmKg: c.toKg, effectiveCycle: session.cycle, reason: 'adjust', createdAt: now });
          tms[c.lift] = c.toKg;
          applied.tm.push({ lift: c.lift, fromKg: from, toKg: c.toKg });
        } else if (c.kind === 'rest') {
          if (!cycle) continue;
          const before = cycle.restBonusSec ?? 0;
          const after = Math.min(MAX_REST_BONUS_SEC, before + c.extraSec);
          cycle.restBonusSec = after;
          applied.restBonusAddedSec += after - before;
          await database.cycles.update(cycle.index, { restBonusSec: after });
        } else if (c.kind === 'next') {
          if (!prog) continue;
          const rest = (prog.nextOverrides ?? []).filter((o) => o.exerciseId !== c.exerciseId);
          prog = { ...prog, nextOverrides: [...rest, { exerciseId: c.exerciseId, afterSessionId: session.id, kg: c.kg, reps: c.reps, sets: c.sets }] };
        } else if (c.kind === 'swap') {
          const key = slotKey(c.day, c.slot, blockForCycle(session.cycle));
          const before = (await database.slotChoices.get(key))?.exerciseId ?? null;
          await database.slotChoices.put({ slotKey: key, exerciseId: c.exerciseId, chosenAt: now });
          applied.swaps = [...(applied.swaps ?? []), { slotKey: key, from: before, to: c.exerciseId }];
        } else if (c.kind === 'order') {
          if (!prog) continue;
          const to: SessionSlot[] = ['main', ...c.order];
          const before = prog.dayOrder?.[String(c.day)] ?? null;
          prog = { ...prog, dayOrder: { ...(prog.dayOrder ?? {}), [String(c.day)]: to } };
          applied.orders = [...(applied.orders ?? []), { day: c.day, from: before ? [...before] : null, to }];
        } else {
          if (!prog) continue;
          applied.days = { from: prog.trainingDays ? [...prog.trainingDays] : null, to: [...c.days] };
          prog = { ...prog, trainingDays: [...c.days] };
        }
        done.push(p.id);
      }
      if (prog) await database.trainingProgram.put({ ...prog, updatedAt: now });
      const proposals = thread.proposals.map((p) => (done.includes(p.id) ? { ...p, status: 'applied' as const } : p));
      await database.workoutSessions.put({
        ...session,
        reviewed: true,
        reviewApplied: mergeApplied(session.reviewApplied, applied),
        coach: { ...thread, proposals, updatedAt: now },
      });
      return done;
    },
  );
}

export class LockedSessionError extends Error {
  constructor() {
    super('Logs from finished cycles are locked');
    this.name = 'LockedSessionError';
  }
}

/**
 * Deletes a workout log of the current cycle (Story 6 §4), in one transaction:
 * - each TM change its review applied gets an appended `undo` row (TM += from − to, additive, so a
 *   later change isn't wiped out; tmHistory stays append-only);
 * - the rest bonus it added comes off (floor 0);
 * - the session row goes. Everything else (next day, e1RM, PRs) is derived from sessions.
 * Throws LockedSessionError for a session from another cycle.
 */
export async function deleteWorkoutSession(id: string, database: PhilipDB = db): Promise<void> {
  await database.transaction('rw', [database.workoutSessions, database.tmHistory, database.cycles, database.trainingProgram, database.slotChoices], async () => {
    const session = await database.workoutSessions.get(id);
    if (!session) return;
    await undoSessionChanges(session, database);
    await database.workoutSessions.delete(id);
  });
}

/**
 * Story 10 (OBS-7BAD75): reopen a finished log of the current cycle to fix it. Undoes what its review
 * and report applied (exactly as delete does), clears the report so Philip reviews the fixed log, and
 * marks it `editing`. Throws LockedSessionError for past cycles; refuses while another workout is open.
 */
export async function reopenWorkoutSession(id: string, database: PhilipDB = db): Promise<void> {
  await database.transaction('rw', [database.workoutSessions, database.tmHistory, database.cycles, database.trainingProgram, database.slotChoices], async () => {
    const session = await database.workoutSessions.get(id);
    if (!session || session.status !== 'done') return;
    const open = await database.workoutSessions.where('status').equals('in_progress').count();
    if (open > 0) throw new OpenSessionError();
    await undoSessionChanges(session, database);
    const next: WorkoutSession = { ...session, status: 'in_progress', editing: true };
    delete next.reviewed;
    delete next.reviewApplied;
    delete next.coach;
    await database.workoutSessions.put(next);
  });
}

/** Another workout is still open (one at a time). */
export class OpenSessionError extends Error {
  constructor() {
    super('Another workout is open');
    this.name = 'OpenSessionError';
  }
}

/** Undo what a session's review/report applied; shared by delete and reopen. Runs inside their transaction. */
async function undoSessionChanges(session: WorkoutSession, database: PhilipDB): Promise<void> {
  const id = session.id;
  const program = await database.trainingProgram.get('me');
  if (!program || session.cycle !== program.currentCycle) throw new LockedSessionError();
  const applied = session.reviewApplied;
  if (applied) {
    const records = await database.tmHistory.toArray();
    const now = Date.now();
    for (const change of applied.tm) {
      const effective = session.cycle;
      const current = tmsForCycle(records, effective)[change.lift];
      if (current === null) continue;
      const tmKg = Math.round((current + change.fromKg - change.toKg) * 100) / 100;
      const row = { lift: change.lift, tmKg, effectiveCycle: effective, reason: 'undo' as const, createdAt: now };
      const newId = (await database.tmHistory.add(row)) as number;
      records.push({ ...row, id: newId });
    }
    if (applied.restBonusAddedSec > 0) {
      const cycle = await database.cycles.get(session.cycle);
      if (cycle) await database.cycles.update(cycle.index, { restBonusSec: Math.max(0, (cycle.restBonusSec ?? 0) - applied.restBonusAddedSec) });
    }
    // Story 7: a swap goes back to what it replaced, unless the owner changed that slot since.
    for (const sw of applied.swaps ?? []) {
      const now = await database.slotChoices.get(sw.slotKey);
      if (now && now.exerciseId !== sw.to) continue;
      if (sw.from === null) await database.slotChoices.delete(sw.slotKey);
      else await database.slotChoices.put({ slotKey: sw.slotKey, exerciseId: sw.from, chosenAt: Date.now() });
    }
  }
  // Story 7: training days go back (unless changed since); next-time orders this log set go.
  const days = applied?.days;
  const overrides = (program.nextOverrides ?? []).filter((o) => o.afterSessionId !== id);
  const next: TrainingProgram = { ...program, nextOverrides: overrides };
  if (days && (program.trainingDays ?? []).join() === days.to.join()) {
    if (days.from === null) delete next.trainingDays;
    else next.trainingDays = days.from;
  }
  // OBS-369BCA: a day order goes back to what it replaced, unless the owner reordered that day since.
  for (const o of applied?.orders ?? []) {
    const cur = next.dayOrder?.[String(o.day)] ?? null;
    if ((cur ?? []).join() !== o.to.join()) continue;
    const dayOrder = { ...(next.dayOrder ?? {}) };
    if (o.from === null) delete dayOrder[String(o.day)];
    else dayOrder[String(o.day)] = o.from;
    next.dayOrder = dayOrder;
  }
  if (!next.nextOverrides?.length) delete next.nextOverrides;
  if (JSON.stringify(next) !== JSON.stringify(program)) await database.trainingProgram.put({ ...next, updatedAt: Date.now() });
}

/* ---------------- Philip's memory (Story 9) ---------------- */

export const MEMORY = {
  /** Notes kept; the oldest go first when a new one would pass this. */
  notesMax: 40,
  noteChars: 140,
  /** Ask Philip lines kept on the device. */
  askMessagesMax: 200,
} as const;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Adds notes Philip asked to remember. Skips blanks and repeats (case-insensitive); keeps the newest notesMax. */
export async function addCoachNotes(
  texts: readonly string[],
  from: { source: CoachNote['source']; sessionId: string | null },
  now = Date.now(),
  database: PhilipDB = db,
): Promise<number> {
  return database.transaction('rw', database.coachNotes, async () => {
    const existing = await database.coachNotes.toArray();
    const seen = new Set(existing.map((n) => norm(n.text)));
    const fresh: CoachNote[] = [];
    for (const raw of texts) {
      const text = raw.trim().slice(0, MEMORY.noteChars);
      if (!text || seen.has(norm(text))) continue;
      seen.add(norm(text));
      fresh.push({ text, source: from.source, sessionId: from.sessionId, createdAt: now + fresh.length });
    }
    if (fresh.length) await database.coachNotes.bulkAdd(fresh);
    const over = existing.length + fresh.length - MEMORY.notesMax;
    if (over > 0) {
      const oldest = await database.coachNotes.orderBy('createdAt').limit(over).primaryKeys();
      await database.coachNotes.bulkDelete(oldest);
    }
    return fresh.length;
  });
}

export function allCoachNotes(database: PhilipDB = db): Promise<CoachNote[]> {
  return database.coachNotes.orderBy('createdAt').toArray();
}

export async function deleteCoachNote(id: number, database: PhilipDB = db): Promise<void> {
  await database.coachNotes.delete(id);
}

export async function clearCoachNotes(database: PhilipDB = db): Promise<void> {
  await database.coachNotes.clear();
}

/** Appends an Ask Philip line and trims the chat to askMessagesMax. */
export async function addCoachMessage(m: Omit<CoachChatMessage, 'id'>, database: PhilipDB = db): Promise<void> {
  await database.transaction('rw', database.coachMessages, async () => {
    await database.coachMessages.add({ ...m });
    const over = (await database.coachMessages.count()) - MEMORY.askMessagesMax;
    if (over > 0) await database.coachMessages.bulkDelete(await database.coachMessages.orderBy('at').limit(over).primaryKeys());
  });
}

export async function clearCoachMessages(database: PhilipDB = db): Promise<void> {
  await database.coachMessages.clear();
}
