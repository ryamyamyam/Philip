/** Data access functions. UI components call these instead of touching tables directly. */
import { db, newId, defaultProfile, type PhilipDB } from './db';
import type {
  CycleRecord,
  FoodEntry,
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
import type { LiftId } from '../lib/training/program';
import { roundMacros } from '../lib/nutrition';

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
  await database.profile.put({ ...current, ...changes, id: 'me' });
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
    const exercises = session.exercises.map((e, i) => {
      const old = existing.exercises[i];
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
