import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { PhilipDB, initDatabase } from './db';
import { addFoodEntry, allSavedMeals, deleteSavedMeal, deleteWeight, restoreWeight, logWeight, markSavedMealUsed, restoreSavedMeal, saveMeal, updateProfile } from './repo';
import { createBackup, deleteAllData, parseBackup, restoreBackup } from '../lib/backup';
import { freshDb } from '../test/helpers';

let n = 0;

/** Writes data with the exact v1 schema (as shipped in 21f75d0), then closes it. */
async function seedV1(name: string) {
  const v1 = new Dexie(name);
  v1.version(1).stores({
    profile: 'id',
    targetPlans: '++id, effectiveFrom',
    foodEntries: 'id, date, createdAt, savedFoodId, name',
    savedFoods: 'id, name, lastUsedAt, useCount',
    meta: 'key',
  });
  await v1.open();
  await v1.table('profile').put({
    id: 'me', sex: 'male', birthDate: '1998-01-01', heightCm: 184, weightKg: 80, activityLevel: 'moderate', trainingDaysPerWeek: 4,
    goal: 'lose', targetWeightKg: 76, weeklyRateKg: -0.5, unitPrefs: { weight: 'kg', height: 'cm' }, locale: 'en-US',
    geminiKey: 'k', geminiModel: null, adherenceEnabled: true,
  });
  await v1.table('targetPlans').add({ effectiveFrom: '2026-10-01', calories: 2300, proteinG: 160, fatG: 70, carbsG: 250, method: 'manual', inputsSnapshot: null, weekdayOverrides: null, createdAt: 1 });
  await v1.table('foodEntries').bulkAdd([
    { id: 'e1', date: '2026-10-30', meal: 'lunch', name: 'Rice', grams: 150, calories: 195, proteinG: 4, fatG: 0.4, carbsG: 43, source: 'manual', savedFoodId: null, estimate: null, createdAt: 1, updatedAt: 1 },
    { id: 'e2', date: '2026-10-31', meal: 'dinner', name: 'Salmon', grams: 120, calories: 250, proteinG: 25, fatG: 16, carbsG: 0, source: 'saved', savedFoodId: 's1', estimate: null, createdAt: 2, updatedAt: 2 },
  ]);
  await v1.table('savedFoods').add({ id: 's1', name: 'Salmon', grams: 120, calories: 250, proteinG: 25, fatG: 16, carbsG: 0, useCount: 3, lastUsedAt: 2, favorite: true, createdAt: 1 });
  await v1.table('meta').put({ key: 'lastBackupAt', value: 123 });
  v1.close();
}

describe('Dexie v2 migration (OBS-F047E3)', () => {
  it('keeps every v1 record, adds weightEntries, and sets profile.bodyFatPct = null', async () => {
    const name = `mig-${Date.now()}-${n++}`;
    await seedV1(name);
    const db = new PhilipDB(name);
    await initDatabase(db);
    expect(db.verno).toBe(3);
    expect(await db.foodEntries.count()).toBe(2);
    expect(await db.foodEntries.get('e2')).toMatchObject({ name: 'Salmon', savedFoodId: 's1' });
    expect(await db.savedFoods.get('s1')).toMatchObject({ useCount: 3, favorite: true });
    expect(await db.targetPlans.count()).toBe(1);
    expect((await db.meta.get('lastBackupAt'))?.value).toBe(123);
    const p = await db.profile.get('me');
    expect(p).toMatchObject({ weightKg: 80, goal: 'lose', geminiKey: 'k', bodyFatPct: null });
    expect(await db.weightEntries.count()).toBe(0);
    db.close();
  });
});

describe('weight log', () => {
  it('one entry per date: logging again overwrites; newest date updates profile weight', async () => {
    const db = await freshDb();
    await logWeight('2026-11-01', 73.04, db);
    await logWeight('2026-11-01', 72.8, db);
    expect(await db.weightEntries.count()).toBe(1);
    expect((await db.weightEntries.get('2026-11-01'))?.weightKg).toBe(72.8);
    expect((await db.profile.get('me'))?.weightKg).toBe(72.8);
    // An older date doesn't overwrite the current profile weight.
    await logWeight('2026-10-25', 74, db);
    expect((await db.profile.get('me'))?.weightKg).toBe(72.8);
    expect(await db.weightEntries.count()).toBe(2);
    // Story 3: delete a weigh-in, then undo.
    const removed = await deleteWeight('2026-10-25', db);
    expect(await db.weightEntries.count()).toBe(1);
    await restoreWeight(removed!, db);
    expect((await db.weightEntries.get('2026-10-25'))?.weightKg).toBe(74);
  });
});

describe('backups with weight entries and body fat', () => {
  it('round-trips weight entries and bodyFatPct (replace), and delete-all clears weights', async () => {
    const a = await freshDb();
    await updateProfile({ sex: 'male', weightKg: 73, bodyFatPct: 15 }, a);
    await logWeight('2026-10-31', 73.4, a);
    await logWeight('2026-11-01', 73, a);
    await addFoodEntry({ date: '2026-11-01', meal: 'breakfast', name: 'Oats', grams: 50, calories: 190, proteinG: 6.5, fatG: 3.5, carbsG: 33, source: 'manual', savedFoodId: null, estimate: null }, a);
    const backup = await createBackup(a);
    expect(backup.schemaVersion).toBe(1);
    expect(backup.data.weightEntries).toHaveLength(2);
    const b = await freshDb();
    await restoreBackup(b, parseBackup(JSON.stringify(backup)).file, 'replace');
    expect(await b.weightEntries.orderBy('date').toArray()).toEqual(await a.weightEntries.orderBy('date').toArray());
    expect((await b.profile.get('me'))?.bodyFatPct).toBe(15);
    await deleteAllData(b);
    expect(await b.weightEntries.count()).toBe(0);
  });

  it('merge adds missing dates and lets the newer updatedAt win on the same date', async () => {
    const a = await freshDb();
    await logWeight('2026-11-01', 73, a);
    const file = parseBackup(JSON.stringify(await createBackup(a))).file;
    file.data.weightEntries.push({ date: '2026-11-02', weightKg: 72.9, createdAt: 1, updatedAt: 1 });
    file.data.weightEntries[0] = { ...file.data.weightEntries[0]!, weightKg: 70, updatedAt: 1 }; // older → loses
    const s = await restoreBackup(a, file, 'merge');
    expect(s.weightsAdded).toBe(1);
    expect((await a.weightEntries.get('2026-11-01'))?.weightKg).toBe(73);
    expect((await a.weightEntries.get('2026-11-02'))?.weightKg).toBe(72.9);
  });

  it('imports a backup made before this change (no weightEntries, no bodyFatPct)', async () => {
    const old = {
      format: 'philip-backup',
      schemaVersion: 1,
      exportedAt: '2026-10-28T21:15:00.000Z',
      data: {
        profile: { id: 'me', sex: 'male', birthDate: null, heightCm: 184, weightKg: 73, activityLevel: null, trainingDaysPerWeek: null, goal: null, targetWeightKg: null, weeklyRateKg: null, unitPrefs: { weight: 'kg', height: 'cm' }, locale: 'en-US', geminiKey: null, geminiModel: null, adherenceEnabled: false },
        targetPlans: [],
        foodEntries: [{ id: 'x', date: '2026-10-27', meal: 'snack', name: 'Apple', grams: 180, calories: 95, proteinG: 0.5, fatG: 0.3, carbsG: 25, source: 'manual', savedFoodId: null, estimate: null, createdAt: 1, updatedAt: 1 }],
        savedFoods: [],
      },
    };
    const parsed = parseBackup(JSON.stringify(old));
    expect(parsed.file.data.weightEntries).toEqual([]);
    expect(parsed.file.data.profile?.bodyFatPct).toBeNull();
    const db = await freshDb();
    await logWeight('2026-11-01', 73, db);
    await restoreBackup(db, parsed.file, 'merge');
    expect(await db.foodEntries.count()).toBe(1);
    expect(await db.weightEntries.count()).toBe(1); // merge keeps local weights
    await restoreBackup(db, parsed.file, 'replace');
    expect(await db.weightEntries.count()).toBe(0);
    expect(await db.foodEntries.count()).toBe(1);
  });

  it('rejects malformed weight entries and dedupes repeated dates', () => {
    const base = { format: 'philip-backup', schemaVersion: 1, exportedAt: '', data: { profile: null, targetPlans: [], foodEntries: [], savedFoods: [] } };
    expect(() => parseBackup(JSON.stringify({ ...base, data: { ...base.data, weightEntries: [{ date: 'nope', weightKg: 70, createdAt: 1, updatedAt: 1 }] } }))).toThrow(/weightEntries\[0\]/);
    expect(() => parseBackup(JSON.stringify({ ...base, data: { ...base.data, weightEntries: 'x' } }))).toThrow();
    const w = { date: '2026-11-01', weightKg: 70, createdAt: 1, updatedAt: 1 };
    const p = parseBackup(JSON.stringify({ ...base, data: { ...base.data, weightEntries: [w, { ...w, weightKg: 71 }] } }));
    expect(p.file.data.weightEntries).toEqual([w]);
    expect(p.duplicatesSkipped).toBe(1);
  });
});

/** Opens with the exact v2 schema (as shipped on qa-round-2, 389c39e) and writes a weight entry. */
async function seedV2(name: string) {
  await seedV1(name);
  const v2 = new Dexie(name);
  v2.version(1).stores({
    profile: 'id',
    targetPlans: '++id, effectiveFrom',
    foodEntries: 'id, date, createdAt, savedFoodId, name',
    savedFoods: 'id, name, lastUsedAt, useCount',
    meta: 'key',
  });
  v2.version(2).stores({ weightEntries: 'date' });
  await v2.open();
  await v2.table('weightEntries').put({ date: '2026-11-01', weightKg: 73, createdAt: 5, updatedAt: 5 });
  v2.close();
}

describe('Dexie v3 migration (Story 3: saved meals)', () => {
  it('keeps every v2 record and adds an empty savedMeals table', async () => {
    const name = `mig3-${Date.now()}-${n++}`;
    await seedV2(name);
    const db = new PhilipDB(name);
    await initDatabase(db);
    expect(db.verno).toBe(3);
    expect(await db.foodEntries.count()).toBe(2);
    expect(await db.savedFoods.count()).toBe(1);
    expect(await db.targetPlans.count()).toBe(1);
    expect(await db.weightEntries.get('2026-11-01')).toMatchObject({ weightKg: 73 });
    expect((await db.profile.get('me'))?.weightKg).toBe(80);
    expect(await db.savedMeals.count()).toBe(0);
    db.close();
  });
});

const OATS = { name: 'Oatmeal', grams: 50, calories: 190, proteinG: 6.5, fatG: 3.5, carbsG: 33 };
const MILK = { name: 'Milk', grams: 200, calories: 128, proteinG: 6.6, fatG: 7, carbsG: 9.6 };
const EGGS = { name: 'Eggs', grams: 100, calories: 143, proteinG: 12.6, fatG: 9.5, carbsG: 0.7 };

describe('saved meals', () => {
  it('saves, replaces by name, orders by last use, deletes and restores', async () => {
    const db = await freshDb();
    const id = await saveMeal('  Usual breakfast ', [OATS, MILK, { ...EGGS, name: ' ' }], db);
    let meals = await allSavedMeals(db);
    expect(meals).toHaveLength(1);
    expect(meals[0]).toMatchObject({ name: 'Usual breakfast', useCount: 0 });
    expect(meals[0]!.items.map((i) => i.name)).toEqual(['Oatmeal', 'Milk']); // blank rows dropped
    // Same name (any case) replaces the foods, keeps the id.
    expect(await saveMeal('usual BREAKFAST', [OATS, MILK, EGGS], db)).toBe(id);
    expect((await allSavedMeals(db))[0]!.items).toHaveLength(3);
    const other = await saveMeal('Post-workout', [EGGS], db);
    await markSavedMealUsed(other, db);
    meals = await allSavedMeals(db);
    expect(meals.map((m) => m.name)).toEqual(['Post-workout', 'usual BREAKFAST']);
    expect(meals[0]!.useCount).toBe(1);
    const removed = await deleteSavedMeal(id, db);
    expect(await db.savedMeals.count()).toBe(1);
    await restoreSavedMeal(removed!, db);
    expect(await db.savedMeals.count()).toBe(2);
    await expect(saveMeal('', [OATS], db)).rejects.toThrow();
    await expect(saveMeal('Empty', [], db)).rejects.toThrow();
  });

  it('round-trips in backups (replace and merge), and older backups without savedMeals still import', async () => {
    const a = await freshDb();
    await saveMeal('Usual breakfast', [OATS, MILK, EGGS], a);
    const backup = await createBackup(a);
    expect(backup.schemaVersion).toBe(1);
    expect(backup.data.savedMeals).toHaveLength(1);
    const b = await freshDb();
    const s = await restoreBackup(b, parseBackup(JSON.stringify(backup)).file, 'replace');
    expect(s.mealsAdded).toBe(1);
    expect(await b.savedMeals.toArray()).toEqual(await a.savedMeals.toArray());
    const s2 = await restoreBackup(b, parseBackup(JSON.stringify(backup)).file, 'merge');
    expect(s2.mealsAdded).toBe(0);
    expect(await b.savedMeals.count()).toBe(1);

    const { savedMeals: _m, ...oldData } = backup.data;
    const parsed = parseBackup(JSON.stringify({ ...backup, data: oldData }));
    expect(parsed.file.data.savedMeals).toEqual([]);
    await restoreBackup(b, parsed.file, 'merge');
    expect(await b.savedMeals.count()).toBe(1); // merge keeps local meals

    expect(() => parseBackup(JSON.stringify({ ...backup, data: { ...backup.data, savedMeals: [{ id: 'x', name: 'Bad', items: [] }] } }))).toThrow(/savedMeals\[0\]/);
    await deleteAllData(b);
    expect(await b.savedMeals.count()).toBe(0);
  });
});
