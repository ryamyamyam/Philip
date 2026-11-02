import Dexie, { type EntityTable } from 'dexie';
import type { FoodEntry, MetaRow, Profile, SavedFood, TargetPlan, WeightEntry } from './types';

export class PhilipDB extends Dexie {
  profile!: EntityTable<Profile, 'id'>;
  targetPlans!: EntityTable<TargetPlan, 'id'>;
  foodEntries!: EntityTable<FoodEntry, 'id'>;
  savedFoods!: EntityTable<SavedFood, 'id'>;
  meta!: EntityTable<MetaRow, 'key'>;
  weightEntries!: EntityTable<WeightEntry, 'date'>;

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
