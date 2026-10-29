import type { FoodEntry, SavedFood } from '../db/types';

export interface QuickFood {
  key: string;
  name: string;
  grams: number | null;
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  savedFoodId: string | null;
  count: number;
  lastUsedAt: number;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Same food = same normalized name and same calories (portion). */
function keyOf(e: Pick<FoodEntry, 'name' | 'calories'>): string {
  return `${norm(e.name)}|${Math.round(e.calories)}`;
}

/** Groups entries into distinct foods, newest first. */
export function groupFoods(entries: readonly FoodEntry[], saved: readonly SavedFood[]): QuickFood[] {
  const savedIds = new Set(saved.map((s) => s.id));
  const map = new Map<string, QuickFood>();
  for (const e of entries) {
    const k = keyOf(e);
    const existing = map.get(k);
    if (existing) {
      existing.count += 1;
      if (e.createdAt > existing.lastUsedAt) existing.lastUsedAt = e.createdAt;
      if (!existing.savedFoodId && e.savedFoodId && savedIds.has(e.savedFoodId)) existing.savedFoodId = e.savedFoodId;
      continue;
    }
    map.set(k, {
      key: k,
      name: e.name,
      grams: e.grams,
      calories: e.calories,
      proteinG: e.proteinG,
      fatG: e.fatG,
      carbsG: e.carbsG,
      savedFoodId: e.savedFoodId && savedIds.has(e.savedFoodId) ? e.savedFoodId : null,
      count: 1,
      lastUsedAt: e.createdAt,
    });
  }
  return [...map.values()];
}

export function recentFoods(entries: readonly FoodEntry[], saved: readonly SavedFood[], limit = 25): QuickFood[] {
  return groupFoods(entries, saved)
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, limit);
}

export function frequentFoods(entries: readonly FoodEntry[], saved: readonly SavedFood[], limit = 25): QuickFood[] {
  return groupFoods(entries, saved)
    .filter((f) => f.count >= 2)
    .sort((a, b) => b.count - a.count || b.lastUsedAt - a.lastUsedAt)
    .slice(0, limit);
}

export function savedToQuick(s: SavedFood): QuickFood {
  return {
    key: `saved:${s.id}`,
    name: s.name,
    grams: s.grams,
    calories: s.calories,
    proteinG: s.proteinG,
    fatG: s.fatG,
    carbsG: s.carbsG,
    savedFoodId: s.id,
    count: s.useCount,
    lastUsedAt: s.lastUsedAt ?? s.createdAt,
  };
}

export function matchesQuery(name: string, query: string): boolean {
  const q = norm(query);
  if (!q) return true;
  const n = norm(name);
  return q.split(' ').every((part) => n.includes(part));
}
