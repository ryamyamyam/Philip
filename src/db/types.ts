/** Persistent data types. All nutrition values are metric (grams, kcal). */

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export const MEALS: readonly Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'veryActive';
export type Goal = 'lose' | 'maintain' | 'gain';

/** Local calendar date, YYYY-MM-DD. Never derived from UTC. */
export type YMD = string;

export interface Macros {
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
}

export interface UnitPrefs {
  weight: 'kg' | 'lb';
  height: 'cm' | 'in';
}

export interface Profile {
  id: 'me';
  sex: Sex | null;
  birthDate: YMD | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: ActivityLevel | null;
  trainingDaysPerWeek: number | null;
  goal: Goal | null;
  targetWeightKg: number | null;
  /** Signed: negative = loss per week, positive = gain per week. */
  weeklyRateKg: number | null;
  unitPrefs: UnitPrefs;
  locale: string;
  /** Stored only on this device. Never exported unless the user opts in. */
  geminiKey: string | null;
  geminiModel: string | null;
  adherenceEnabled: boolean;
}

export type TargetMethod = 'calculated' | 'manual';
/** 0 = Sunday … 6 = Saturday (matches Date#getDay). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface TargetPlan extends Macros {
  id?: number;
  effectiveFrom: YMD;
  method: TargetMethod;
  /** Inputs used by the calculator (null for manual plans). */
  inputsSnapshot: Record<string, unknown> | null;
  /** Optional weekly planning: per-weekday targets that replace the base values. */
  weekdayOverrides?: Partial<Record<Weekday, Macros>> | null;
  createdAt: number;
}

export type FoodSource = 'manual' | 'photo' | 'saved';

export interface EstimateItem extends Macros {
  name: string;
  description: string;
  grams: number | null;
  confidence: 'low' | 'medium' | 'high';
}

export interface FoodEstimate {
  provider: 'gemini' | 'claude-handoff';
  model: string;
  items: EstimateItem[];
  /** Values as returned by the AI for this entry, before user edits. */
  originalValues: Macros & { name: string; grams: number | null };
  analyzedAt: number;
}

export interface FoodEntry extends Macros {
  id: string;
  date: YMD;
  meal: Meal;
  name: string;
  grams: number | null;
  source: FoodSource;
  savedFoodId: string | null;
  estimate: FoodEstimate | null;
  createdAt: number;
  updatedAt: number;
}

export interface SavedFood extends Macros {
  id: string;
  name: string;
  grams: number | null;
  useCount: number;
  lastUsedAt: number | null;
  favorite: boolean;
  createdAt: number;
}

export interface MetaRow {
  key: string;
  value: unknown;
}
