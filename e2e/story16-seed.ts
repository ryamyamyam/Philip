/**
 * Story 16 e2e test data (test data only; never the owner's real numbers in app code): a lifter with a
 * finished block-A cycle (3 weeks of all four days, the main lifts trending up) and the current cycle 3
 * (block C). His walking lunges were logged at 80 lb per hand (a total typed as per hand) and a report
 * set the next order at 85 lb per hand, the Story 16 bug.
 */
import { buildSession } from '../src/lib/training/session';
import { createSession } from '../src/lib/training/sessionLog';
import type { CycleRecord, TmRecord, TrainingProgram, WorkoutSession } from '../src/db/types';

export const KG_PER_LB = 0.45359237;
export const TMS = { squat: 135, bench: 90, rdl: 103.5, ohp: 45 };
/** Cycle 3's training maxes: two cycles of bulk progression (+5 kg lower, +2.5 kg upper each). */
export const TMS3 = { squat: 145, bench: 95, rdl: 113.5, ohp: 50 };

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

const ms = (ymd: string) => new Date(`${ymd}T12:00:00`).getTime();

export interface Seed {
  program: TrainingProgram;
  cycles: CycleRecord[];
  tmHistory: TmRecord[];
  sessions: WorkoutSession[];
  slotChoices: { slotKey: string; exerciseId: string; chosenAt: number }[];
}

export function strengthSeed(today: string): Seed {
  const start1 = addDays(today, -40);
  const sessions: WorkoutSession[] = [];
  let lastDay3 = '';
  for (const week of [1, 2, 3] as const)
    for (const day of [1, 2, 3, 4] as const) {
      const date = addDays(start1, (week - 1) * 7 + day);
      const id = `c1w${week}d${day}`;
      const plan = buildSession({ cycle: 1, week, day, phase: 'gain', tms: TMS, weightUnit: 'lb', bodyWeightKg: 73 });
      const s = createSession(plan, id, date, ms(date));
      const scale = 1 + (week - 1) * 0.02;
      sessions.push({
        ...s,
        status: 'done',
        finishedAt: ms(date) + 50 * 60000,
        reviewed: true,
        exercises: s.exercises.map((e) => ({
          ...e,
          actual: e.actual.map((a) => {
            const p = e.prescription.find((x) => x.order === a.order)!;
            const lunge = e.exerciseId === 'walking-lunge';
            const kg = lunge ? 80 * KG_PER_LB : p.kg === null ? null : e.slot === 'main' && p.kind !== 'warmup' ? Math.round(p.kg * scale * 10) / 10 : p.kg;
            // The + sets go past their minimum, as they do in real training.
            const reps = lunge ? 10 : p.kind === 'amrap' ? p.repMin + 3 : (p.targetReps ?? p.repMin);
            return { ...a, kg, reps, done: true };
          }),
        })),
      });
      if (day === 3) lastDay3 = id;
    }
  const now = Date.now();
  const goal = (startKg: number, deadline: string) => ({ startWeightKg: startKg, startBfPct: 15, endWeightKg: startKg + 1.5, weeklyRatePct: 0.25, bfLinePct: 16, source: 'philip' as const, targetPlanId: null, weeks: 8, deadline });
  return {
    program: {
      id: 'me',
      startedAt: ms(start1),
      bar: { barKg: 20, plateUnit: 'lb', plates: [45, 35, 25, 10, 5, 2.5] },
      weightUnit: 'lb',
      unavailableEquipment: [],
      currentCycle: 3,
      nextOverrides: [{ exerciseId: 'walking-lunge', afterSessionId: lastDay3, kg: 85 * KG_PER_LB, reps: 10, sets: 3 }],
      createdAt: ms(start1),
      updatedAt: now,
    },
    cycles: [
      { index: 1, block: 'A', startedAt: ms(start1), phase: 'gain', tms: TMS, goal: goal(73, addDays(start1, 28)) },
      { index: 3, block: 'C', startedAt: ms(addDays(today, -1)), phase: 'gain', tms: TMS3, goal: goal(73.5, addDays(today, 55)) },
    ],
    tmHistory: [
      ...(['squat', 'bench', 'rdl', 'ohp'] as const).map((lift, i) => ({ id: i + 1, lift, tmKg: TMS[lift], effectiveCycle: 1, reason: 'setup' as const, createdAt: ms(start1) })),
      ...(['squat', 'bench', 'rdl', 'ohp'] as const).map((lift, i) => ({ id: i + 5, lift, tmKg: TMS3[lift], effectiveCycle: 3, reason: 'cycle' as const, createdAt: ms(addDays(today, -1)) })),
    ],
    sessions,
    // Today (cycle 3, block C, day 1) his A1 is the walking lunge.
    slotChoices: [{ slotKey: 'D1-A1-C', exerciseId: 'walking-lunge', chosenAt: now }],
  };
}
