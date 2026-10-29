import { describe, expect, it } from 'vitest';
import type { FoodEntry } from '../db/types';
import { frequentFoods, matchesQuery, recentFoods } from './recents';

const e = (name: string, createdAt: number, calories = 100, savedFoodId: string | null = null): FoodEntry => ({
  id: `${name}-${createdAt}`,
  date: '2026-10-28',
  meal: 'lunch',
  name,
  grams: null,
  calories,
  proteinG: 1,
  fatG: 1,
  carbsG: 1,
  source: 'manual',
  savedFoodId,
  estimate: null,
  createdAt,
  updatedAt: createdAt,
});

describe('recents', () => {
  const entries = [e('Oats', 1), e('oats ', 5), e('Eggs', 3), e('Eggs', 4, 200), e('Coffee', 2)];
  it('dedupes by normalized name + calories, newest first', () => {
    expect(recentFoods(entries, []).map((f) => `${f.name}:${f.calories}`)).toEqual(['Oats:100', 'Eggs:200', 'Eggs:100', 'Coffee:100']);
  });
  it('frequent requires ≥2 uses', () => {
    expect(frequentFoods(entries, []).map((f) => f.name)).toEqual(['Oats']);
  });
  it('drops links to deleted saved foods', () => {
    expect(recentFoods([e('X', 1, 10, 'gone')], [])[0]!.savedFoodId).toBeNull();
  });
  it('matches multi-word queries', () => {
    expect(matchesQuery('Greek yogurt, plain', 'yog gre')).toBe(true);
    expect(matchesQuery('Greek yogurt', 'milk')).toBe(false);
  });
});
