import { describe, expect, it } from 'vitest';
import { freshDb } from '../test/helpers';
import {
  addFoodEntry,
  addSavedFood,
  addTargetPlan,
  allTargetPlans,
  deleteFoodEntry,
  deleteSavedFood,
  duplicateFoodEntry,
  entriesForDate,
  logSavedFood,
  moveFoodEntry,
  restoreFoodEntry,
  saveEntryAsFood,
  updateFoodEntry,
  updateSavedFood,
  type NewFoodEntry,
} from './repo';
import { sumMacros, targetForDate } from '../lib/nutrition';

const food = (o: Partial<NewFoodEntry> = {}): NewFoodEntry => ({
  date: '2026-10-28',
  meal: 'lunch',
  name: 'Chicken rice',
  grams: 350,
  calories: 620.5,
  proteinG: 42.3,
  fatG: 14.1,
  carbsG: 78.9,
  source: 'manual',
  savedFoodId: null,
  estimate: null,
  ...o,
});

describe('food entries', () => {
  it('moves an entry to another day and meal without changing its values (OBS-3E7A73)', async () => {
    const db = await freshDb();
    const id = await addFoodEntry(food({ date: '2026-10-29', meal: 'lunch' }), db);
    const before = await db.foodEntries.get(id);
    const prev = await moveFoodEntry(id, { date: '2026-10-28', meal: 'dinner' }, db);
    expect(prev).toEqual({ date: '2026-10-29', meal: 'lunch' });
    expect(await entriesForDate('2026-10-29', db)).toHaveLength(0);
    const [moved] = await entriesForDate('2026-10-28', db);
    expect(moved).toMatchObject({ id, meal: 'dinner', name: before?.name, calories: before?.calories, proteinG: before?.proteinG });
    expect(moved?.createdAt).toBe(before?.createdAt);
    // Undo puts it back.
    await moveFoodEntry(id, prev!, db);
    expect((await db.foodEntries.get(id))?.date).toBe('2026-10-29');
    expect(await moveFoodEntry('missing', { date: '2026-10-28', meal: 'lunch' }, db)).toBeUndefined();
  });

  it('adds, edits, duplicates, deletes and restores', async () => {
    const db = await freshDb();
    const id = await addFoodEntry(food({ name: '  Chicken rice ' }), db);
    let day = await entriesForDate('2026-10-28', db);
    expect(day).toHaveLength(1);
    expect(day[0]!.name).toBe('Chicken rice');
    expect(sumMacros(day).calories).toBe(620.5);

    await updateFoodEntry(id, { calories: 700, meal: 'dinner' }, db);
    day = await entriesForDate('2026-10-28', db);
    expect(day[0]).toMatchObject({ calories: 700, meal: 'dinner' });
    expect(day[0]!.updatedAt).toBeGreaterThanOrEqual(day[0]!.createdAt);

    const dupId = await duplicateFoodEntry(id, undefined, db);
    expect(dupId).not.toBe(id);
    expect(sumMacros(await entriesForDate('2026-10-28', db)).calories).toBe(1400);

    const removed = await deleteFoodEntry(id, db);
    expect(await entriesForDate('2026-10-28', db)).toHaveLength(1);
    await restoreFoodEntry(removed!, db);
    expect(await entriesForDate('2026-10-28', db)).toHaveLength(2);
  });

  it('keeps entries on their own local date', async () => {
    const db = await freshDb();
    await addFoodEntry(food({ date: '2026-10-28' }), db);
    await addFoodEntry(food({ date: '2026-10-29' }), db);
    expect(await entriesForDate('2026-10-28', db)).toHaveLength(1);
    expect(await entriesForDate('2026-10-29', db)).toHaveLength(1);
  });

  it('moves an entry to another date via edit', async () => {
    const db = await freshDb();
    const id = await addFoodEntry(food(), db);
    await updateFoodEntry(id, { date: '2026-10-27' }, db);
    expect(await entriesForDate('2026-10-28', db)).toHaveLength(0);
    expect(await entriesForDate('2026-10-27', db)).toHaveLength(1);
  });
});

describe('target plans', () => {
  it('adding a plan never rewrites history', async () => {
    const db = await freshDb();
    await addTargetPlan({ effectiveFrom: '2026-01-01', calories: 2000, proteinG: 150, fatG: 60, carbsG: 200, method: 'manual', inputsSnapshot: null }, db);
    await addTargetPlan({ effectiveFrom: '2026-10-01', calories: 2400, proteinG: 170, fatG: 70, carbsG: 260, method: 'calculated', inputsSnapshot: {} }, db);
    const plans = await allTargetPlans(db);
    expect(plans).toHaveLength(2);
    expect(targetForDate(plans, '2026-09-30')?.calories).toBe(2000);
    expect(targetForDate(plans, '2026-10-28')?.calories).toBe(2400);
  });
});

describe('saved foods', () => {
  it('logging copies values; editing the saved food does not alter history', async () => {
    const db = await freshDb();
    const sid = await addSavedFood({ name: 'Oats', grams: 50, calories: 190, proteinG: 6.5, fatG: 3.5, carbsG: 33 }, db);
    const eid = await logSavedFood(sid, '2026-10-28', 'breakfast', undefined, db);
    await updateSavedFood(sid, { calories: 999 }, db);
    const e = await db.foodEntries.get(eid);
    expect(e).toMatchObject({ calories: 190, source: 'saved', savedFoodId: sid });
    const s = await db.savedFoods.get(sid);
    expect(s?.useCount).toBe(1);
    expect(s?.lastUsedAt).toBeTypeOf('number');
  });

  it('logs a scaled portion', async () => {
    const db = await freshDb();
    const sid = await addSavedFood({ name: 'Rice', grams: 100, calories: 130, proteinG: 2.7, fatG: 0.3, carbsG: 28 }, db);
    const eid = await logSavedFood(sid, '2026-10-28', 'lunch', 250, db);
    expect(await db.foodEntries.get(eid)).toMatchObject({ grams: 250, calories: 325, carbsG: 70 });
  });

  it('saves an entry as a food and unlinks on delete', async () => {
    const db = await freshDb();
    const eid = await addFoodEntry(food(), db);
    const sid = await saveEntryAsFood(eid, db);
    expect((await db.foodEntries.get(eid))?.savedFoodId).toBe(sid);
    await deleteSavedFood(sid, db);
    const e = await db.foodEntries.get(eid);
    expect(e?.savedFoodId).toBeNull();
    expect(e?.calories).toBe(620.5);
  });
});
