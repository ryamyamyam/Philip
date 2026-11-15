/**
 * Story 16 §3.3: the one-time sweep on update. Every accessory's next order (a stored report/Update goals
 * override, or the one double progression computes from the last log) passes the PB-8.4 check;
 * implausible ones are fixed (overrides rewritten; computed ones are corrected by the session builder
 * from now on) and listed for the owner. Pure, tested.
 */
import type { AccessoryOverride, WorkoutSession } from '../../db/types';
import { exerciseFor, exerciseInfo, menuSlot, type ExerciseId, type Slot } from '../training/exercises';
import { incrementKg, type BarSetup, type PlateUnit } from '../training/plates';
import { accessoryRules, nextAccessoryKg, nextTargetReps, type Block, type Day } from '../training/program';
import { lastSessionIdFor, lastSetsFor } from '../training/sessionLog';
import { startRule } from '../training/startLoad';
import { checkLoad, type LoadProfile, type LoadReason } from './loads';
import { historyFor, roundingFor, traitsOf } from './loadContext';

export interface SweepFix {
  exerciseId: string;
  fromKg: number;
  toKg: number;
  reason: LoadReason;
  /** 'override' = a stored next order was rewritten; 'next' = the computed next order will be corrected. */
  source: 'override' | 'next';
}

export interface SweepInput {
  overrides: readonly AccessoryOverride[];
  sessions: readonly WorkoutSession[];
  block: Block;
  choices: Readonly<Record<string, string>>;
  profile: LoadProfile;
  unit: PlateUnit;
  bar: BarSetup;
}

export function sweepNextOrders(i: SweepInput): { overrides: AccessoryOverride[]; fixes: SweepFix[] } {
  const fixes: SweepFix[] = [];
  const overrides = i.overrides.map((o) => ({ ...o }));
  const rules = accessoryRules(i.block, 1);
  const seen = new Set<string>();
  for (const day of [1, 2, 3, 4] as Day[])
    for (const slot of ['A1', 'A2', 'B'] as Slot[]) {
      const id = exerciseFor(day, slot, i.block, i.choices as Record<string, ExerciseId>);
      if (seen.has(id)) continue;
      seen.add(id);
      const kind = startRule(id).kind;
      if (kind !== 'load' || exerciseInfo(id).timed) continue;
      const m = menuSlot(day, slot, i.block);
      const { round, step } = roundingFor(id, i.unit, i.bar);
      const history = historyFor(i.sessions, id);
      const last = lastSetsFor(i.sessions, id);
      const o = overrides.find((x) => x.exerciseId === id && x.afterSessionId === lastSessionIdFor(i.sessions, id));
      if (o && o.kg !== null) {
        const reps = o.reps ?? m.repMin;
        const v = checkLoad(id, o.kg, reps, rules.rir, i.profile, history, round, step, traitsOf(id));
        if (v.status === 'corrected' && v.kg !== null && v.reason) {
          fixes.push({ exerciseId: id, fromKg: o.kg, toKg: v.kg, reason: v.reason, source: 'override' });
          o.kg = v.kg;
        }
        continue;
      }
      const next = nextAccessoryKg(last, rules.sets, m.repMax, incrementKg(i.unit), m.repMin, rules.rir);
      if (next.kg === null) continue;
      const kg = round(next.kg);
      const reps = nextTargetReps(last, m.repMin, m.repMax, next.change);
      const v = checkLoad(id, kg, reps, rules.rir, i.profile, history, round, step, traitsOf(id));
      if (v.status === 'corrected' && v.kg !== null && v.reason) fixes.push({ exerciseId: id, fromKg: kg, toKg: v.kg, reason: v.reason, source: 'next' });
    }
  return { overrides, fixes };
}
