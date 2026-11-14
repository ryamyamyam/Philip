import { MEALS, type Meal, type SavedMeal } from '../db/types';

/** Sensible default meal for the current time of day. */
export function defaultMealFor(now: Date = new Date()): Meal {
  const h = now.getHours() + now.getMinutes() / 60;
  if (h >= 4 && h < 10.5) return 'breakfast';
  if (h >= 10.5 && h < 14.5) return 'lunch';
  if (h >= 17 && h < 21.5) return 'dinner';
  return 'snack';
}

/**
 * OBS-A0308B: the everyday saved meals to offer on a day, in meal order — one per meal, and only
 * for meals with nothing logged yet (once breakfast is logged, the usual breakfast offer goes away).
 */
export function everydayToOffer(meals: readonly SavedMeal[], loggedMeals: ReadonlySet<Meal>): SavedMeal[] {
  return MEALS.flatMap((slot) => {
    if (loggedMeals.has(slot)) return [];
    const m = meals.find((x) => x.everyday === slot);
    return m ? [m] : [];
  });
}
