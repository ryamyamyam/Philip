import { describe, expect, it } from 'vitest';
import { freshDb } from '../test/helpers';
import { addFoodEntry, addSavedFood, addTargetPlan, updateProfile } from '../db/repo';
import { BackupError, createBackup, deleteAllData, parseBackup, restoreBackup } from './backup';
import type { PhilipDB } from '../db/db';

async function seed(db: PhilipDB) {
  await updateProfile({ sex: 'male', weightKg: 80, geminiKey: 'secret-key' }, db);
  await addTargetPlan({ effectiveFrom: '2026-01-01', calories: 2200, proteinG: 160, fatG: 70, carbsG: 230, method: 'manual', inputsSnapshot: null, weekdayOverrides: { 6: { calories: 2600, proteinG: 160, fatG: 80, carbsG: 300 } } }, db);
  await addSavedFood({ name: 'Oats', grams: 50, calories: 190, proteinG: 6.5, fatG: 3.5, carbsG: 33, favorite: true }, db);
  await addFoodEntry({ date: '2026-10-28', meal: 'lunch', name: 'Bowl', grams: 300, calories: 550.5, proteinG: 30.2, fatG: 12, carbsG: 70, source: 'photo', savedFoodId: null, estimate: { provider: 'gemini', model: 'm', items: [], originalValues: { name: 'Bowl', grams: 300, calories: 500, proteinG: 30, fatG: 12, carbsG: 70 }, analyzedAt: 1 } }, db);
  await addFoodEntry({ date: '2026-10-27', meal: 'snack', name: 'Apple', grams: 180, calories: 95, proteinG: 0.5, fatG: 0.3, carbsG: 25, source: 'manual', savedFoodId: null, estimate: null }, db);
}

describe('backup round trip', () => {
  it('export → replace import restores all data exactly', async () => {
    const a = await freshDb();
    await seed(a);
    const backup = await createBackup(a, { includeApiKey: true });
    const text = JSON.stringify(backup);

    const b = await freshDb();
    const parsed = parseBackup(text);
    await restoreBackup(b, parsed.file, 'replace');

    expect(await b.foodEntries.orderBy('id').toArray()).toEqual(await a.foodEntries.orderBy('id').toArray());
    expect(await b.savedFoods.toArray()).toEqual(await a.savedFoods.toArray());
    expect(await b.targetPlans.toArray()).toEqual(await a.targetPlans.toArray());
    expect(await b.profile.get('me')).toEqual(await a.profile.get('me'));
  });

  it('excludes the API key by default', async () => {
    const a = await freshDb();
    await seed(a);
    const backup = await createBackup(a);
    expect(backup.data.profile?.geminiKey).toBeNull();
    expect(JSON.stringify(backup)).not.toContain('secret-key');
  });

  it('merge adds missing records without duplicating existing ones', async () => {
    const a = await freshDb();
    await seed(a);
    const text = JSON.stringify(await createBackup(a));
    // Merge into itself: nothing should change
    const s1 = await restoreBackup(a, parseBackup(text).file, 'merge');
    expect(s1).toEqual({ entriesAdded: 0, entriesUpdated: 0, plansAdded: 0, savedAdded: 0 });
    expect(await a.foodEntries.count()).toBe(2);
    expect(await a.targetPlans.count()).toBe(1);

    const b = await freshDb();
    await addFoodEntry({ date: '2026-10-20', meal: 'dinner', name: 'Local', grams: null, calories: 300, proteinG: 20, fatG: 10, carbsG: 30, source: 'manual', savedFoodId: null, estimate: null }, b);
    const s2 = await restoreBackup(b, parseBackup(text).file, 'merge');
    expect(s2.entriesAdded).toBe(2);
    expect(await b.foodEntries.count()).toBe(3);
  });

  it('merge keeps the newer version of a conflicting entry', async () => {
    const a = await freshDb();
    await seed(a);
    const backup = await createBackup(a);
    const entry = backup.data.foodEntries[0]!;
    await a.foodEntries.update(entry.id, { calories: 111, updatedAt: entry.updatedAt + 1000 });
    await restoreBackup(a, parseBackup(JSON.stringify(backup)).file, 'merge');
    expect((await a.foodEntries.get(entry.id))?.calories).toBe(111);
  });
});

describe('backup validation', () => {
  const valid = async () => JSON.parse(JSON.stringify(await createBackup(await freshDb())));

  it('rejects invalid JSON', () => {
    expect(() => parseBackup('{nope')).toThrowError(BackupError);
    try {
      parseBackup('{nope');
    } catch (e) {
      expect((e as BackupError).code).toBe('json');
    }
  });
  it('rejects non-Philip files', () => {
    expect(() => parseBackup('{"hello":1}')).toThrow(/format/);
  });
  it('rejects unsupported schema versions', async () => {
    const b = await valid();
    b.schemaVersion = 99;
    expect(() => parseBackup(JSON.stringify(b))).toThrow(/version/);
  });
  it('rejects missing fields and unexpected values', async () => {
    const b = await valid();
    b.data.foodEntries = [{ id: 'x', date: '2026-02-30', meal: 'lunch', name: 'a', calories: 1, proteinG: 1, fatG: 1, carbsG: 1, source: 'manual', createdAt: 1, updatedAt: 1 }];
    expect(() => parseBackup(JSON.stringify(b))).toThrow(/date/);
    b.data.foodEntries[0].date = '2026-02-03';
    b.data.foodEntries[0].meal = 'brunch';
    expect(() => parseBackup(JSON.stringify(b))).toThrow(/meal/);
    b.data.foodEntries[0].meal = 'lunch';
    b.data.foodEntries[0].calories = -5;
    expect(() => parseBackup(JSON.stringify(b))).toThrow(/calories/);
    delete b.data.savedFoods;
    expect(() => parseBackup(JSON.stringify(b))).toThrow(/savedFoods/);
  });
  it('skips duplicate IDs inside the backup', async () => {
    const b = await valid();
    const e = { id: 'dup', date: '2026-02-03', meal: 'lunch', name: 'a', grams: null, calories: 1, proteinG: 1, fatG: 1, carbsG: 1, source: 'manual', savedFoodId: null, estimate: null, createdAt: 1, updatedAt: 1 };
    b.data.foodEntries = [e, { ...e, name: 'b' }];
    const parsed = parseBackup(JSON.stringify(b));
    expect(parsed.file.data.foodEntries).toHaveLength(1);
    expect(parsed.duplicatesSkipped).toBe(1);
  });
  it('a failed restore leaves existing data untouched', async () => {
    const a = await freshDb();
    await seed(a);
    const before = await a.foodEntries.count();
    const bad = await createBackup(a);
    // Force a constraint error mid-transaction: duplicate primary key inside bulkAdd.
    bad.data.foodEntries.push({ ...bad.data.foodEntries[0]! });
    await expect(restoreBackup(a, bad, 'replace')).rejects.toBeTruthy();
    expect(await a.foodEntries.count()).toBe(before);
    expect((await a.profile.get('me'))?.weightKg).toBe(80);
  });
});

describe('delete all', () => {
  it('clears everything and recreates an empty profile', async () => {
    const a = await freshDb();
    await seed(a);
    await deleteAllData(a);
    expect(await a.foodEntries.count()).toBe(0);
    expect(await a.targetPlans.count()).toBe(0);
    expect(await a.savedFoods.count()).toBe(0);
    expect((await a.profile.get('me'))?.weightKg).toBeNull();
  });
});
