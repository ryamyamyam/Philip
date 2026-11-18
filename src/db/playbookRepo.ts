/**
 * Story 16 §3.2–3.3: the one-time playbook update on 0.16.1 (D-039). Every write goes through here.
 *
 * Apply (one transaction): re-check today's plan under Philip's Playbook (`lib/playbook/replan.ts`) and
 * append the new plan, effective today (food already logged stays); sweep the accessory next orders
 * (`lib/playbook/sweep.ts`). The record (META `playbookUpdate`) keeps the before → after lines, the
 * PB IDs, the fixed loads and what Undo needs. Undo, for 24 hours, appends a copy of the plan that was
 * in force and puts the stored next orders back. Target plans stay append-only.
 *
 * Story 17 (0.17.1, D-040): the same re-check runs once more as `kind: 'tdee'` (META `tdeeUpdate`): the
 * maintenance multiplier now follows PB-2.2, so today's calories move if their pace left the band. No
 * load sweep on that run.
 */
import { db, type PhilipDB } from './db';
import { META } from './repo';
import type { AccessoryOverride, TargetPlan, YMD } from './types';
import { ageOn } from '../lib/date';
import { planForDate } from '../lib/nutrition';
import { calculateTargets } from '../lib/targets';
import { playbookReplan, type PlanChangeLine, type SplitLine } from '../lib/playbook/replan';
import { sweepNextOrders, type SweepFix } from '../lib/playbook/sweep';
import { loadProfileFrom } from '../lib/playbook/loadContext';
import { tmsForCycle } from '../lib/training/progress';
import { trainingDaysOrDefault } from '../lib/training/schedule';
import { blockForCycle } from '../lib/training/program';
import { DEFAULT_BAR_SETUP } from '../lib/training/plates';

/** Undo is offered for this long (same as Update goals). */
export const PLAYBOOK_UNDO_MS = 24 * 60 * 60 * 1000;

export interface PlaybookUpdateRecord {
  version: string;
  at: number;
  /** 'fresh' = nothing to migrate (new install); 'applied' / 'undone'. */
  status: 'fresh' | 'applied' | 'undone';
  changes: PlanChangeLine[];
  splitBefore: SplitLine | null;
  splitAfter: SplitLine | null;
  splitChanged: boolean;
  suggestCut: boolean;
  manual: boolean;
  /** The plan in force before (copied back on Undo). Null when no plan was added. */
  planBefore: Omit<TargetPlan, 'id'> | null;
  planAddedId: number | null;
  loads: SweepFix[];
  overridesBefore: AccessoryOverride[] | null;
}

export const PLAYBOOK_VERSION = '0.16.1';
/** Story 17: the maintenance (PB-2.2) re-check. */
export const TDEE_VERSION = '0.17.1';

/** Which one-time update: Story 16's playbook re-check, or Story 17's maintenance re-check. */
export type UpdateKind = 'playbook' | 'tdee';
const keyOf = (kind: UpdateKind) => (kind === 'tdee' ? META.tdeeUpdate : META.playbookUpdate);
const versionOf = (kind: UpdateKind) => (kind === 'tdee' ? TDEE_VERSION : PLAYBOOK_VERSION);

export async function getPlaybookUpdate(database: PhilipDB = db, kind: UpdateKind = 'playbook'): Promise<PlaybookUpdateRecord | null> {
  const v = (await database.meta.get(keyOf(kind)))?.value;
  return v && typeof v === 'object' ? (v as PlaybookUpdateRecord) : null;
}

/** A new install: nothing to migrate, never show the sheet. */
export async function markPlaybookFresh(database: PhilipDB = db, kind: UpdateKind = 'playbook'): Promise<void> {
  if (await getPlaybookUpdate(database, kind)) return;
  const rec: PlaybookUpdateRecord = { version: versionOf(kind), at: Date.now(), status: 'fresh', changes: [], splitBefore: null, splitAfter: null, splitChanged: false, suggestCut: false, manual: false, planBefore: null, planAddedId: null, loads: [], overridesBefore: null };
  await database.meta.put({ key: keyOf(kind), value: rec });
}

/** Does this install have anything for the update to re-check? (Story 17: the maintenance re-check needs a plan.) */
export async function needsPlaybookUpdate(database: PhilipDB = db, kind: UpdateKind = 'playbook'): Promise<boolean> {
  if (await getPlaybookUpdate(database, kind)) return false;
  if (kind === 'tdee') return (await database.targetPlans.count()) > 0;
  return (await database.targetPlans.count()) > 0 || !!(await database.trainingProgram.get('me'));
}

/** Runs the update once (later calls return the stored record). */
export async function runPlaybookUpdate(today: YMD, database: PhilipDB = db, kind: UpdateKind = 'playbook'): Promise<PlaybookUpdateRecord> {
  return database.transaction('rw', [database.meta, database.targetPlans, database.profile, database.trainingProgram, database.workoutSessions, database.tmHistory, database.cycles, database.slotChoices], async () => {
    const existing = await getPlaybookUpdate(database, kind);
    if (existing) return existing;
    const now = Date.now();
    const profile = await database.profile.get('me');
    const plans = await database.targetPlans.toArray();
    const program = await database.trainingProgram.get('me');
    const current = planForDate(plans, today);
    const days = trainingDaysOrDefault(program?.trainingDays);
    let maintenance: number | null = null;
    if (profile?.sex && profile.birthDate && profile.heightCm && profile.weightKg && profile.activityLevel) {
      try {
        maintenance = calculateTargets({
          sex: profile.sex,
          ageYears: ageOn(profile.birthDate, today),
          heightCm: profile.heightCm,
          weightKg: profile.weightKg,
          activityLevel: profile.activityLevel,
          trainingDaysPerWeek: days.length,
          goal: 'maintain',
          targetWeightKg: null,
          weeklyRateKg: null,
          bodyFatPct: profile.bodyFatPct,
        }).tdee;
      } catch {
        maintenance = null;
      }
    }
    const rp = current
      ? playbookReplan({
          plan: current,
          today,
          now,
          sex: profile?.sex ?? null,
          weightKg: profile?.weightKg ?? null,
          heightCm: profile?.heightCm ?? null,
          bodyFatPct: profile?.bodyFatPct ?? null,
          trainingYears: profile?.trainingYears ?? null,
          maintenanceKcal: maintenance,
          trainingDays: days,
          carbOn: program?.carbDays !== false,
        })
      : null;
    let planAddedId: number | null = null;
    if (rp?.plan) planAddedId = (await database.targetPlans.add(rp.plan)) as number;

    // The sweep: stored and computed next orders through PB-8.4.
    let loads: SweepFix[] = [];
    let overridesBefore: AccessoryOverride[] | null = null;
    if (kind === 'playbook' && program && program.currentCycle > 0) {
      const sessions = await database.workoutSessions.toArray();
      const tms = tmsForCycle(await database.tmHistory.toArray(), program.currentCycle);
      const cycle = await database.cycles.get(program.currentCycle);
      const choices = Object.fromEntries((await database.slotChoices.toArray()).map((c) => [c.slotKey, c.exerciseId]));
      const res = sweepNextOrders({
        overrides: program.nextOverrides ?? [],
        sessions,
        block: cycle?.block ?? blockForCycle(program.currentCycle),
        choices,
        profile: loadProfileFrom(tms, profile?.weightKg ?? null),
        unit: program.weightUnit,
        bar: program.bar ?? DEFAULT_BAR_SETUP,
      });
      loads = res.fixes;
      if (res.fixes.some((f) => f.source === 'override')) {
        overridesBefore = (program.nextOverrides ?? []).map((o) => ({ ...o }));
        await database.trainingProgram.put({ ...program, nextOverrides: res.overrides, updatedAt: now });
      }
    }

    const { id: _id, ...before } = current ?? ({} as TargetPlan);
    const rec: PlaybookUpdateRecord = {
      version: versionOf(kind),
      at: now,
      status: 'applied',
      // Story 17: on the maintenance re-check a calorie move comes from PB-2.2 first.
      changes: (rp?.changes ?? []).map((c) => (kind === 'tdee' && c.field === 'calories' ? { ...c, pbIds: ['PB-2.2', ...c.pbIds] } : c)),
      splitBefore: rp?.splitBefore ?? null,
      splitAfter: rp?.splitAfter ?? null,
      splitChanged: rp?.splitChanged ?? false,
      suggestCut: rp?.suggestCut ?? false,
      manual: rp?.manual ?? false,
      planBefore: current && planAddedId !== null ? before : null,
      planAddedId,
      loads,
      overridesBefore,
    };
    await database.meta.put({ key: keyOf(kind), value: rec });
    return rec;
  });
}

export function canUndoPlaybook(rec: PlaybookUpdateRecord | null, now: number): boolean {
  return !!rec && rec.status === 'applied' && now - rec.at <= PLAYBOOK_UNDO_MS && (rec.planBefore !== null || rec.overridesBefore !== null);
}

/** Undo: the old plan comes back (as a new row, effective today) and the stored next orders are restored. */
export async function undoPlaybookUpdate(today: YMD, database: PhilipDB = db, kind: UpdateKind = 'playbook'): Promise<void> {
  await database.transaction('rw', [database.meta, database.targetPlans, database.trainingProgram], async () => {
    const rec = await getPlaybookUpdate(database, kind);
    const now = Date.now();
    if (!canUndoPlaybook(rec, now) || !rec) throw new Error('stale');
    if (rec.planBefore) await database.targetPlans.add({ ...rec.planBefore, effectiveFrom: today, createdAt: now });
    if (rec.overridesBefore) {
      const program = await database.trainingProgram.get('me');
      if (program) await database.trainingProgram.put({ ...program, nextOverrides: rec.overridesBefore, updatedAt: now });
    }
    await database.meta.put({ key: keyOf(kind), value: { ...rec, status: 'undone' } });
  });
}
