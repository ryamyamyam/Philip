import type { Meal } from '../db/types';

/** Sensible default meal for the current time of day. */
export function defaultMealFor(now: Date = new Date()): Meal {
  const h = now.getHours() + now.getMinutes() / 60;
  if (h >= 4 && h < 10.5) return 'breakfast';
  if (h >= 10.5 && h < 14.5) return 'lunch';
  if (h >= 17 && h < 21.5) return 'dinner';
  return 'snack';
}
