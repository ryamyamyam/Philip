import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type {
  CycleRecord,
  FoodEntry,
  Profile,
  SavedFood,
  SavedMeal,
  SlotChoice,
  TargetPlan,
  TmRecord,
  TrainingProgram,
  WeightEntry,
  WorkoutSession,
  YMD,
} from '../db/types';
import { allSavedMeals, getMeta, META } from '../db/repo';
import type { GymContext } from '../lib/goal/gymDays';
import { todayYmd } from '../lib/date';

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

export function useWeightEntries(): WeightEntry[] | undefined {
  return useLiveQuery(() => db.weightEntries.orderBy('date').toArray(), []);
}

export function useSavedMeals(): SavedMeal[] | undefined {
  return useLiveQuery(() => allSavedMeals(), []);
}

/* ---------------- Training (Story 5) ---------------- */

/** The training program; null before setup. */
export function useTrainingProgram(): TrainingProgram | null | undefined {
  return useLiveQuery(async () => (await db.trainingProgram.get('me')) ?? null, []);
}

export function useTmHistory(): TmRecord[] | undefined {
  return useLiveQuery(() => db.tmHistory.toArray(), []);
}

export function useCycles(): CycleRecord[] | undefined {
  return useLiveQuery(() => db.cycles.orderBy('index').toArray(), []);
}

export function useWorkoutSessions(): WorkoutSession[] | undefined {
  return useLiveQuery(() => db.workoutSessions.orderBy('date').toArray(), []);
}

/**
 * Story 17 (OBS-F17324): what decides this week's gym days for carb-day plans: the training days, this
 * week's move and the workouts logged. Undefined while loading; null before training is set up.
 */
export function useGymContext(): GymContext | null | undefined {
  return useLiveQuery(async () => {
    const program = await db.trainingProgram.get('me');
    if (!program) return null;
    const sessions = (await db.workoutSessions.toArray()).map((s) => ({ date: s.date, status: s.status }));
    return { today: todayYmd(), trainingDays: program.trainingDays ?? null, weekDays: program.weekDays ?? null, sessions };
  }, []);
}

export function useWorkoutSession(id: string | undefined): WorkoutSession | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.workoutSessions.get(id)) ?? null) : null), [id]);
}

export function useSlotChoices(): SlotChoice[] | undefined {
  return useLiveQuery(() => db.slotChoices.toArray(), []);
}

/** Story 9: Philip's notes, newest first. */
export function useCoachNotes() {
  return useLiveQuery(() => db.coachNotes.orderBy('createdAt').reverse().toArray(), []);
}

/** Story 9: the Ask Philip chat, oldest first. */
export function useCoachMessages() {
  return useLiveQuery(() => db.coachMessages.orderBy('at').toArray(), []);
}
