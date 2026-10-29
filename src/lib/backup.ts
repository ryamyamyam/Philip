/**
 * JSON backup format (documented in docs/ARCHITECTURE.md → "Backup format").
 *
 * {
 *   "format": "philip-backup",
 *   "schemaVersion": 1,
 *   "exportedAt": "2026-10-28T21:15:00.000Z",
 *   "data": { "profile": {...} | null, "targetPlans": [...], "foodEntries": [...], "savedFoods": [...] }
 * }
 */
import type { PhilipDB } from '../db/db';
import { defaultProfile } from '../db/db';
import {
  MEALS,
  type ActivityLevel,
  type FoodEntry,
  type FoodEstimate,
  type Goal,
  type Macros,
  type Profile,
  type SavedFood,
  type Sex,
  type TargetPlan,
  type Weekday,
} from '../db/types';
import { isValidYmd } from './date';

export const BACKUP_FORMAT = 'philip-backup';
export const BACKUP_SCHEMA_VERSION = 1;

export interface BackupData {
  profile: Profile | null;
  targetPlans: TargetPlan[];
  foodEntries: FoodEntry[];
  savedFoods: SavedFood[];
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  data: BackupData;
}

export type BackupErrorCode = 'json' | 'format' | 'version' | 'invalid';

export class BackupError extends Error {
  constructor(
    readonly code: BackupErrorCode,
    readonly detail = '',
    readonly version: number | null = null,
  ) {
    super(`${code}${detail ? `: ${detail}` : ''}`);
    this.name = 'BackupError';
  }
}

/* ---------------- Export ---------------- */

export async function createBackup(database: PhilipDB, opts: { includeApiKey?: boolean; now?: Date } = {}): Promise<BackupFile> {
  return database.transaction('r', [database.profile, database.targetPlans, database.foodEntries, database.savedFoods], async () => {
    const profile = (await database.profile.get('me')) ?? null;
    return {
      format: BACKUP_FORMAT,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: (opts.now ?? new Date()).toISOString(),
      data: {
        profile: profile ? { ...profile, geminiKey: opts.includeApiKey ? profile.geminiKey : null } : null,
        targetPlans: await database.targetPlans.orderBy('effectiveFrom').toArray(),
        foodEntries: await database.foodEntries.orderBy('date').toArray(),
        savedFoods: await database.savedFoods.toArray(),
      },
    };
  });
}

export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `philip-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

/* ---------------- Validation ---------------- */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

class V {
  constructor(private path: string) {}
  fail(msg: string): never {
    throw new BackupError('invalid', `${this.path}: ${msg}`);
  }
  str(o: Obj, k: string, opts: { max?: number; allowEmpty?: boolean } = {}): string {
    const v = o[k];
    if (typeof v !== 'string') this.fail(`${k} must be text`);
    if (!opts.allowEmpty && !v.trim()) this.fail(`${k} is empty`);
    if (v.length > (opts.max ?? 500)) this.fail(`${k} is too long`);
    return v;
  }
  num(o: Obj, k: string, min: number, max: number): number {
    const v = o[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) this.fail(`${k} must be a number`);
    if (v < min || v > max) this.fail(`${k} is out of range`);
    return v;
  }
  numOrNull(o: Obj, k: string, min: number, max: number): number | null {
    return o[k] == null ? null : this.num(o, k, min, max);
  }
  ymd(o: Obj, k: string): string {
    const v = o[k];
    if (!isValidYmd(v)) this.fail(`${k} must be a YYYY-MM-DD date`);
    return v;
  }
  oneOf<T extends string>(o: Obj, k: string, allowed: readonly T[]): T {
    const v = o[k];
    if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) this.fail(`${k} has an unexpected value`);
    return v as T;
  }
  oneOfOrNull<T extends string>(o: Obj, k: string, allowed: readonly T[]): T | null {
    return o[k] == null ? null : this.oneOf(o, k, allowed);
  }
}

function macros(v: V, o: Obj): Macros {
  return {
    calories: v.num(o, 'calories', 0, 20000),
    proteinG: v.num(o, 'proteinG', 0, 2000),
    fatG: v.num(o, 'fatG', 0, 2000),
    carbsG: v.num(o, 'carbsG', 0, 3000),
  };
}

function validateEstimate(v: V, raw: unknown): FoodEstimate | null {
  if (raw == null) return null;
  if (!isObj(raw)) v.fail('estimate must be an object');
  // Estimates are informational; keep them if well-formed, otherwise drop silently.
  const provider = raw.provider === 'gemini' || raw.provider === 'claude-handoff' ? raw.provider : null;
  if (!provider || typeof raw.model !== 'string' || !Array.isArray(raw.items) || !isObj(raw.originalValues)) return null;
  return {
    provider,
    model: raw.model.slice(0, 120),
    items: raw.items.filter(isObj) as unknown as FoodEstimate['items'],
    originalValues: raw.originalValues as unknown as FoodEstimate['originalValues'],
    analyzedAt: typeof raw.analyzedAt === 'number' ? raw.analyzedAt : 0,
  };
}

function validateEntry(raw: unknown, i: number): FoodEntry {
  const v: V = new V(`foodEntries[${i}]`);
  if (!isObj(raw)) v.fail('not an object');
  return {
    id: v.str(raw, 'id', { max: 100 }),
    date: v.ymd(raw, 'date'),
    meal: v.oneOf(raw, 'meal', MEALS),
    name: v.str(raw, 'name', { max: 200 }),
    grams: v.numOrNull(raw, 'grams', 0, 10000),
    ...macros(v, raw),
    source: v.oneOf(raw, 'source', ['manual', 'photo', 'saved'] as const),
    savedFoodId: raw.savedFoodId == null ? null : v.str(raw, 'savedFoodId', { max: 100 }),
    estimate: validateEstimate(v, raw.estimate),
    createdAt: v.num(raw, 'createdAt', 0, 1e14),
    updatedAt: v.num(raw, 'updatedAt', 0, 1e14),
  };
}

function validateSaved(raw: unknown, i: number): SavedFood {
  const v: V = new V(`savedFoods[${i}]`);
  if (!isObj(raw)) v.fail('not an object');
  return {
    id: v.str(raw, 'id', { max: 100 }),
    name: v.str(raw, 'name', { max: 200 }),
    grams: v.numOrNull(raw, 'grams', 0, 10000),
    ...macros(v, raw),
    useCount: v.num(raw, 'useCount', 0, 1e9),
    lastUsedAt: v.numOrNull(raw, 'lastUsedAt', 0, 1e14),
    favorite: raw.favorite === true,
    createdAt: v.num(raw, 'createdAt', 0, 1e14),
  };
}

function validatePlan(raw: unknown, i: number): TargetPlan {
  const v: V = new V(`targetPlans[${i}]`);
  if (!isObj(raw)) v.fail('not an object');
  let weekdayOverrides: TargetPlan['weekdayOverrides'] = null;
  if (raw.weekdayOverrides != null) {
    if (!isObj(raw.weekdayOverrides)) v.fail('weekdayOverrides must be an object');
    weekdayOverrides = {};
    for (const [k, val] of Object.entries(raw.weekdayOverrides)) {
      const d = Number(k);
      if (!Number.isInteger(d) || d < 0 || d > 6 || !isObj(val)) v.fail('weekdayOverrides has an unexpected value');
      weekdayOverrides[d as Weekday] = macros(new V(`targetPlans[${i}].weekdayOverrides.${k}`), val);
    }
  }
  return {
    ...(typeof raw.id === 'number' && Number.isInteger(raw.id) && raw.id > 0 ? { id: raw.id } : {}),
    effectiveFrom: v.ymd(raw, 'effectiveFrom'),
    ...macros(v, raw),
    method: v.oneOf(raw, 'method', ['calculated', 'manual'] as const),
    inputsSnapshot: isObj(raw.inputsSnapshot) ? raw.inputsSnapshot : null,
    weekdayOverrides,
    createdAt: v.num(raw, 'createdAt', 0, 1e14),
  };
}

function validateProfile(raw: unknown): Profile | null {
  if (raw == null) return null;
  const v: V = new V('profile');
  if (!isObj(raw)) v.fail('not an object');
  const d = defaultProfile();
  const units = isObj(raw.unitPrefs) ? raw.unitPrefs : {};
  return {
    id: 'me',
    sex: v.oneOfOrNull<Sex>(raw, 'sex', ['male', 'female']),
    birthDate: raw.birthDate == null ? null : v.ymd(raw, 'birthDate'),
    heightCm: v.numOrNull(raw, 'heightCm', 50, 260),
    weightKg: v.numOrNull(raw, 'weightKg', 20, 400),
    activityLevel: v.oneOfOrNull<ActivityLevel>(raw, 'activityLevel', ['sedentary', 'light', 'moderate', 'active', 'veryActive']),
    trainingDaysPerWeek: v.numOrNull(raw, 'trainingDaysPerWeek', 0, 7),
    goal: v.oneOfOrNull<Goal>(raw, 'goal', ['lose', 'maintain', 'gain']),
    targetWeightKg: v.numOrNull(raw, 'targetWeightKg', 20, 400),
    weeklyRateKg: v.numOrNull(raw, 'weeklyRateKg', -5, 5),
    unitPrefs: {
      weight: units.weight === 'kg' ? 'kg' : units.weight === 'lb' ? 'lb' : d.unitPrefs.weight,
      height: units.height === 'cm' ? 'cm' : units.height === 'in' ? 'in' : d.unitPrefs.height,
    },
    locale: typeof raw.locale === 'string' && raw.locale.length < 20 ? raw.locale : d.locale,
    geminiKey: typeof raw.geminiKey === 'string' && raw.geminiKey.length < 200 ? raw.geminiKey : null,
    geminiModel: typeof raw.geminiModel === 'string' && raw.geminiModel.length < 100 ? raw.geminiModel : null,
    adherenceEnabled: raw.adherenceEnabled === true,
  };
}

function dedupe<T extends { id: string }>(items: T[]): { items: T[]; skipped: number } {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return { items: out, skipped: items.length - out.length };
}

export interface ParsedBackup {
  file: BackupFile;
  duplicatesSkipped: number;
}

/** Parses and fully validates a backup. Throws BackupError; never touches the database. */
export function parseBackup(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('json');
  }
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT || !isObj(raw.data)) throw new BackupError('format');
  const version = raw.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1 || version > BACKUP_SCHEMA_VERSION) {
    throw new BackupError('version', '', typeof version === 'number' ? version : null);
  }
  const d = raw.data;
  for (const k of ['targetPlans', 'foodEntries', 'savedFoods'] as const) {
    if (!Array.isArray(d[k])) throw new BackupError('invalid', `${k} is missing`);
  }
  const entries = dedupe((d.foodEntries as unknown[]).map(validateEntry));
  const saved = dedupe((d.savedFoods as unknown[]).map(validateSaved));
  const plansRaw = (d.targetPlans as unknown[]).map(validatePlan);
  // Duplicate numeric plan IDs: keep the first, strip the id from later ones so they get new IDs.
  const planIds = new Set<number>();
  let planDupes = 0;
  const plans = plansRaw.map((p) => {
    if (p.id == null) return p;
    if (planIds.has(p.id)) {
      planDupes++;
      const { id: _id, ...rest } = p;
      return rest;
    }
    planIds.add(p.id);
    return p;
  });
  return {
    file: {
      format: BACKUP_FORMAT,
      schemaVersion: version,
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
      data: { profile: validateProfile(d.profile), targetPlans: plans, foodEntries: entries.items, savedFoods: saved.items },
    },
    duplicatesSkipped: entries.skipped + saved.skipped + planDupes,
  };
}

/* ---------------- Restore ---------------- */

export type RestoreMode = 'merge' | 'replace';

export interface RestoreSummary {
  entriesAdded: number;
  entriesUpdated: number;
  plansAdded: number;
  savedAdded: number;
}

const planKey = (p: TargetPlan) =>
  [p.effectiveFrom, p.createdAt, p.calories, p.proteinG, p.fatG, p.carbsG, p.method].join('|');

/**
 * Restores inside one transaction: any failure rolls back everything.
 *  - replace: clears all tables, then writes the backup exactly. Keeps this device's Gemini key
 *    if the backup has none (keys are excluded from backups by default).
 *  - merge: keeps local data; adds missing records. When an ID exists on both sides, the record
 *    with the newer updatedAt (entries) / lastUsedAt (saved foods) wins. Local profile is kept.
 */
export async function restoreBackup(database: PhilipDB, backup: BackupFile, mode: RestoreMode): Promise<RestoreSummary> {
  const { data } = backup;
  return database.transaction('rw', [database.profile, database.targetPlans, database.foodEntries, database.savedFoods], async () => {
    if (mode === 'replace') {
      const localKey = (await database.profile.get('me'))?.geminiKey ?? null;
      await Promise.all([database.profile.clear(), database.targetPlans.clear(), database.foodEntries.clear(), database.savedFoods.clear()]);
      const profile = data.profile ?? defaultProfile();
      await database.profile.put({ ...profile, geminiKey: profile.geminiKey ?? localKey });
      await database.targetPlans.bulkAdd(data.targetPlans);
      await database.foodEntries.bulkAdd(data.foodEntries);
      await database.savedFoods.bulkAdd(data.savedFoods);
      return {
        entriesAdded: data.foodEntries.length,
        entriesUpdated: 0,
        plansAdded: data.targetPlans.length,
        savedAdded: data.savedFoods.length,
      };
    }

    // merge
    let entriesAdded = 0;
    let entriesUpdated = 0;
    const localEntries = new Map((await database.foodEntries.bulkGet(data.foodEntries.map((e) => e.id))).map((e, i) => [data.foodEntries[i]!.id, e]));
    const entryWrites: FoodEntry[] = [];
    for (const e of data.foodEntries) {
      const local = localEntries.get(e.id);
      if (!local) {
        entryWrites.push(e);
        entriesAdded++;
      } else if (e.updatedAt > local.updatedAt) {
        entryWrites.push(e);
        entriesUpdated++;
      }
    }
    await database.foodEntries.bulkPut(entryWrites);

    let savedAdded = 0;
    const savedWrites: SavedFood[] = [];
    for (const s of data.savedFoods) {
      const local = await database.savedFoods.get(s.id);
      if (!local) {
        savedWrites.push(s);
        savedAdded++;
      } else if ((s.lastUsedAt ?? 0) > (local.lastUsedAt ?? 0)) {
        savedWrites.push({ ...s, useCount: Math.max(s.useCount, local.useCount) });
      }
    }
    await database.savedFoods.bulkPut(savedWrites);

    const existingPlanKeys = new Set((await database.targetPlans.toArray()).map(planKey));
    const newPlans = data.targetPlans
      .filter((p) => !existingPlanKeys.has(planKey(p)))
      .map(({ id: _id, ...rest }) => rest as TargetPlan);
    await database.targetPlans.bulkAdd(newPlans);

    if (!(await database.profile.get('me')) && data.profile) await database.profile.put(data.profile);

    return { entriesAdded, entriesUpdated, plansAdded: newPlans.length, savedAdded };
  });
}

/** Deletes every record. Used by "Delete all data". */
export async function deleteAllData(database: PhilipDB): Promise<void> {
  await database.transaction('rw', [database.profile, database.targetPlans, database.foodEntries, database.savedFoods, database.meta], async () => {
    await Promise.all([
      database.profile.clear(),
      database.targetPlans.clear(),
      database.foodEntries.clear(),
      database.savedFoods.clear(),
      database.meta.where('key').notEqual('storagePersisted').delete(),
    ]);
    await database.profile.put(defaultProfile());
  });
}
