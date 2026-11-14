import { describe, expect, it } from 'vitest';
import { freshDb } from '../test/helpers';
import { allSavedMeals, saveMeal, setSavedMealEveryday } from './repo';
import { createBackup, parseBackup, restoreBackup } from '../lib/backup';
import { everydayToOffer } from '../lib/meals';
import type { SavedMeal } from './types';

const OATS = { name: 'Oatmeal', grams: 50, calories: 190, proteinG: 6.5, fatG: 3.5, carbsG: 33 };
const EGGS = { name: 'Eggs', grams: 100, calories: 143, proteinG: 12.6, fatG: 9.5, carbsG: 0.7 };

describe('OBS-A0308B: everyday meals', () => {
  it('one saved meal per meal; setting another clears the first; null stops it', async () => {
    const db = await freshDb();
    const a = await saveMeal('Usual breakfast', [OATS], db);
    const b = await saveMeal('Eggs breakfast', [EGGS], db);
    await setSavedMealEveryday(a, 'breakfast', db);
    expect((await db.savedMeals.get(a))?.everyday).toBe('breakfast');
    await setSavedMealEveryday(b, 'breakfast', db);
    expect((await db.savedMeals.get(a))?.everyday).toBeNull();
    expect((await db.savedMeals.get(b))?.everyday).toBe('breakfast');
    await setSavedMealEveryday(a, 'snack', db);
    expect((await db.savedMeals.get(b))?.everyday).toBe('breakfast'); // other meal untouched
    await setSavedMealEveryday(b, null, db);
    expect((await db.savedMeals.get(b))?.everyday).toBeNull();
    await setSavedMealEveryday('missing', 'lunch', db); // no throw
  });

  it('replacing a saved meal by name keeps its everyday flag', async () => {
    const db = await freshDb();
    const id = await saveMeal('Usual breakfast', [OATS], db);
    await setSavedMealEveryday(id, 'breakfast', db);
    await saveMeal('usual breakfast', [OATS, EGGS], db);
    expect((await allSavedMeals(db))[0]).toMatchObject({ everyday: 'breakfast' });
  });

  it('offers only meals still empty that day, in meal order', () => {
    const m = (id: string, everyday: SavedMeal['everyday']): SavedMeal => ({ id, name: id, items: [{ ...OATS }], useCount: 0, lastUsedAt: null, createdAt: 1, updatedAt: 1, everyday });
    const meals = [m('snack', 'snack'), m('none', null), m('old', undefined), m('bf', 'breakfast')];
    expect(everydayToOffer(meals, new Set()).map((x) => x.id)).toEqual(['bf', 'snack']);
    expect(everydayToOffer(meals, new Set(['breakfast'])).map((x) => x.id)).toEqual(['snack']);
    expect(everydayToOffer([], new Set())).toEqual([]);
  });

  it('survives a backup round trip; older backups without it still import', async () => {
    const a = await freshDb();
    const id = await saveMeal('Usual breakfast', [OATS], a);
    await setSavedMealEveryday(id, 'breakfast', a);
    const text = JSON.stringify(await createBackup(a));
    const b = await freshDb();
    await restoreBackup(b, parseBackup(text).file, 'replace');
    expect((await b.savedMeals.get(id))?.everyday).toBe('breakfast');
    const old = JSON.parse(text) as { data: { savedMeals: Record<string, unknown>[] } };
    delete old.data.savedMeals[0]!.everyday;
    expect(parseBackup(JSON.stringify(old)).file.data.savedMeals[0]!.everyday ?? null).toBeNull();
    const bad = JSON.parse(text) as { data: { savedMeals: Record<string, unknown>[] } };
    bad.data.savedMeals[0]!.everyday = 'brunch';
    expect(() => parseBackup(JSON.stringify(bad))).toThrow();
  });
});
