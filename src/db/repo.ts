/** Data access functions. UI components call these instead of touching tables directly. */
import { db, newId, defaultProfile, type PhilipDB } from './db';
import type { FoodEntry, Macros, Meal, Profile, SavedFood, TargetPlan, YMD } from './types';
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
} as const;
