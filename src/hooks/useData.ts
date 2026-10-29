import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { FoodEntry, Profile, SavedFood, TargetPlan, YMD } from '../db/types';
import { getMeta, META } from '../db/repo';

export function useEntriesForDate(date: YMD): FoodEntry[] | undefined {
  return useLiveQuery(() => db.foodEntries.where('date').equals(date).toArray(), [date]);
}

export function useEntriesInRange(start: YMD, end: YMD): FoodEntry[] | undefined {
  return useLiveQuery(() => db.foodEntries.where('date').between(start, end, true, true).toArray(), [start, end]);
}

export function useTargetPlans(): TargetPlan[] | undefined {
  return useLiveQuery(() => db.targetPlans.orderBy('effectiveFrom').toArray(), []);
}

export function useProfile(): Profile | undefined {
  return useLiveQuery(() => db.profile.get('me'), []);
}

export function useSavedFoods(): SavedFood[] | undefined {
  return useLiveQuery(() => db.savedFoods.toArray(), []);
}

export function useEntry(id: string | undefined): FoodEntry | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.foodEntries.get(id)) ?? null) : null), [id]);
}

export function useLastBackupAt(): number | null | undefined {
  return useLiveQuery(async () => (await getMeta<number>(META.lastBackupAt)) ?? null, []);
}

export function useMeta<T>(key: string): T | null | undefined {
  return useLiveQuery(async () => (await getMeta<T>(key)) ?? null, [key]);
}

/** Most recent entries (for "Recent" foods). */
export function useRecentEntries(limit = 300): FoodEntry[] | undefined {
  return useLiveQuery(() => db.foodEntries.orderBy('createdAt').reverse().limit(limit).toArray(), [limit]);
}
