import Dexie, { type EntityTable } from 'dexie';
import type {
  CycleRecord,
  FoodEntry,
  MetaRow,
  Profile,
  SavedFood,
  SavedMeal,
  SlotChoice,
  TargetPlan,
  TmRecord,
  TrainingProgram,
  WeightEntry,
  WorkoutSession,
} from './types';

export class PhilipDB extends Dexie {
  profile!: EntityTable<Profile, 'id'>;
  targetPlans!: EntityTable<TargetPlan, 'id'>;
  foodEntries!: EntityTable<FoodEntry, 'id'>;
  savedFoods!: EntityTable<SavedFood, 'id'>;
  meta!: EntityTable<MetaRow, 'key'>;
  weightEntries!: EntityTable<WeightEntry, 'date'>;
  savedMeals!: EntityTable<SavedMeal, 'id'>;
  trainingProgram!: EntityTable<TrainingProgram, 'id'>;
  tmHistory!: EntityTable<TmRecord, 'id'>;
  cycles!: EntityTable<CycleRecord, 'index'>;
  workoutSessions!: EntityTable<WorkoutSession, 'id'>;
  slotChoices!: EntityTable<SlotChoice, 'slotKey'>;

  constructor(name = 'philip') {
    super(name);
    this.version(1).stores({
      profile: 'id',
      targetPlans: '++id, effectiveFrom',
      foodEntries: 'id, date, createdAt, savedFoodId, name',
      savedFoods: 'id, name, lastUsedAt, useCount',
      meta: 'key',
    });
    // v2 (QA round 2): weight log keyed by date (one entry per day), and optional profile body fat.
    // Every v1 table and record is kept as is.
    this.version(2)
      .stores({ weightEntries: 'date' })
      .upgrade(async (tx) => {
        await tx
          .table('profile')
          .toCollection()
          .modify((p: Partial<Profile>) => {
            if (p.bodyFatPct === undefined) p.bodyFatPct = null;
          });
      });
    // v3 (Story 3): saved meals — named combinations of foods. Purely additive; no record changes.
    this.version(3).stores({ savedMeals: 'id, name, lastUsedAt' });
    // v4 (Story 5): training program, append-only TM history, cycles, workout sessions and the owner's
    // menu swaps; profile gains an optional long-term body-fat target. Every earlier record is kept.
    this.version(4)
      .stores({
        trainingProgram: 'id',
        tmHistory: '++id, lift, effectiveCycle',
        cycles: 'index',
        workoutSessions: 'id, date, [cycle+week+day], status',
        slotChoices: 'slotKey',
      })
      .upgrade(async (tx) => {
        await tx
          .table('profile')
          .toCollection()
          .modify((p: Partial<Profile>) => {
            if (p.targetBodyFatPct === undefined) p.targetBodyFatPct = null;
          });
      });
  }
}

export const db = new PhilipDB();

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Fallback for older engines.
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function defaultProfile(): Profile {
  return {
    id: 'me',
    sex: null,
    birthDate: null,
    heightCm: null,
    weightKg: null,
    bodyFatPct: null,
    activityLevel: null,
    trainingDaysPerWeek: null,
    goal: null,
    targetWeightKg: null,
    weeklyRateKg: null,
    targetBodyFatPct: null,
    unitPrefs: { weight: 'lb', height: 'in' },
    locale: 'en-US',
    geminiKey: null,
    geminiModel: null,
    adherenceEnabled: false,
  };
}

/** Ensures the singleton profile exists. Safe to call repeatedly. */
export async function initDatabase(database: PhilipDB = db): Promise<void> {
  await database.open();
  await database.transaction('rw', database.profile, async () => {
    const existing = await database.profile.get('me');
    if (!existing) await database.profile.put(defaultProfile());
  });
}
