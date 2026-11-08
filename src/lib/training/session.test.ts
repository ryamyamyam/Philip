import { describe, expect, it } from 'vitest';
import { exerciseInfo, MENU, slotKey, type ExerciseId, type Slot } from './exercises';
import { buildSession, SESSION_BUDGET_MIN } from './session';
import type { Day, LiftId, Phase, Week } from './program';

const TMS: Record<LiftId, number> = { squat: 135, bench: 90, rdl: 103.5, ohp: 45 };
const PHASES: Phase[] = ['lose', 'maintain', 'gain'];
const WEEKS: Week[] = [1, 2, 3, 4];
const DAYS: Day[] = [1, 2, 3, 4];
const SLOTS: Slot[] = ['A1', 'A2', 'B'];

describe('buildSession', () => {
  it('Day 2, cycle 1, week 1: bench 85% of TM 90 is loaded as 76.7 kg', () => {
    const s = buildSession({ cycle: 1, week: 1, day: 2, phase: 'gain', tms: TMS });
    const top = s.exercises[0]?.prescription.at(-1);
    expect(s.block).toBe('A');
    expect(s.exercises[0]?.exerciseId).toBe('bench');
    expect(top?.kind).toBe('amrap');
    expect(top?.kg).toBeCloseTo(76.7, 1);
  });

  it('block D uses the paused or tempo variant, but the deload week uses the normal lift', () => {
    expect(buildSession({ cycle: 4, week: 1, day: 3, phase: 'maintain', tms: TMS }).exercises[0]?.exerciseId).toBe('pause-rdl');
    expect(buildSession({ cycle: 4, week: 4, day: 3, phase: 'maintain', tms: TMS }).exercises[0]?.exerciseId).toBe('rdl');
  });

  it('phase: a cut gives slot B 2 sets; a bulk adds a round to A1/A2 when it fits', () => {
    const cut = buildSession({ cycle: 1, week: 1, day: 2, phase: 'lose', tms: TMS });
    expect(cut.exercises.find((e) => e.slot === 'B')?.prescription).toHaveLength(2);
    const bulk = buildSession({ cycle: 1, week: 1, day: 2, phase: 'gain', tms: TMS });
    expect(bulk.trims).toEqual([]);
    expect(bulk.exercises.find((e) => e.slot === 'A1')?.prescription).toHaveLength(4);
  });

  it('accessories progress from the last logged sets and start from Philip\'s estimate without history', () => {
    const first = buildSession({ cycle: 1, week: 1, day: 2, phase: 'maintain', tms: TMS, weightUnit: 'kg' });
    const a1 = first.exercises.find((e) => e.slot === 'A1')?.prescription[0];
    expect(a1).toMatchObject({ kg: 22.5, estimate: true, targetReps: 10 }); // chest-supported DB row: 0.25 × bench TM 90, per hand
    const next = buildSession({
      cycle: 1, week: 2, day: 2, phase: 'maintain', tms: TMS, weightUnit: 'kg',
      lastSets: (id) => (id === 'cs-db-row' ? [12, 12, 12].map((r) => ({ kg: 30, reps: r, done: true })) : null),
    });
    const a1next = next.exercises.find((e) => e.slot === 'A1')?.prescription[0];
    expect(a1next?.kg).toBe(32.5);
    expect(a1next?.estimate).toBeUndefined();
    expect(a1next?.targetReps).toBe(8); // weight went up → bottom of the range
  });

  it('only approved swaps are honoured', () => {
    const ok = buildSession({ cycle: 1, week: 1, day: 1, phase: 'maintain', tms: TMS, choices: { 'D1-A1-A': 'hack-squat' } });
    expect(ok.exercises.find((e) => e.slot === 'A1')?.exerciseId).toBe('hack-squat');
    const bad = buildSession({ cycle: 1, week: 1, day: 1, phase: 'maintain', tms: TMS, choices: { 'D1-A1-A': 'db-curl' } });
    expect(bad.exercises.find((e) => e.slot === 'A1')?.exerciseId).toBe('bulgarian-split-squat');
  });

  it('every block × week × phase × day × swap combination fits in 45 minutes (AC 6)', () => {
    let worst = 0;
    for (let cycle = 1; cycle <= 4; cycle++) for (const week of WEEKS) for (const phase of PHASES) for (const day of DAYS) {
      const block = (['A', 'B', 'C', 'D'] as const)[cycle - 1]!;
      const options = SLOTS.map((slot) => {
        const m = MENU.find((x) => x.day === day && x.slot === slot && x.block === block)!;
        return [m.pick, ...m.swaps] as ExerciseId[];
      });
      for (const a1 of options[0]!) for (const a2 of options[1]!) for (const b of options[2]!) {
        const choices = { [slotKey(day, 'A1', block)]: a1, [slotKey(day, 'A2', block)]: a2, [slotKey(day, 'B', block)]: b };
        const s = buildSession({ cycle, week, day, phase, tms: TMS, choices });
        worst = Math.max(worst, s.estMinutes);
        expect(s.estMinutes, `${block} W${week} D${day} ${phase} ${a1}/${a2}/${b}`).toBeLessThanOrEqual(SESSION_BUDGET_MIN);
      }
    }
    expect(worst).toBeGreaterThan(30);
  });

  it('Philip’s picks on maintain land in the spec’s ~36–42 min band for build weeks', () => {
    for (let cycle = 1; cycle <= 4; cycle++) for (const day of DAYS) {
      const s = buildSession({ cycle, week: 1, day, phase: 'maintain', tms: TMS });
      expect(s.estMinutes).toBeGreaterThanOrEqual(30);
      expect(s.estMinutes).toBeLessThanOrEqual(43);
      expect(s.trims).toEqual([]);
    }
  });
});

describe('menu', () => {
  it('has 48 slots, each with a pick and 2 different swaps', () => {
    expect(MENU).toHaveLength(48);
    for (const m of MENU) {
      expect(new Set([m.pick, ...m.swaps]).size).toBe(3);
      expect(m.repMin).toBeLessThanOrEqual(m.repMax);
    }
  });
  it('no slot repeats its exercise in two cycles in a row (AC 4)', () => {
    const order = ['A', 'B', 'C', 'D'] as const;
    for (const m of MENU) {
      const nextBlock = order[(order.indexOf(m.block) + 1) % 4];
      const next = MENU.find((x) => x.day === m.day && x.slot === m.slot && x.block === nextBlock)!;
      expect(next.pick, slotKey(m.day, m.slot, m.block)).not.toBe(m.pick);
    }
  });
  it('timed holds are flagged and listed in seconds', () => {
    for (const m of MENU) if (exerciseInfo(m.pick).timed) expect(m.repMax).toBeGreaterThanOrEqual(20);
  });
});

describe('liftOutlook', () => {
  it('lists all 4 weeks of this cycle and next cycle’s week 1 at TM + the phase increment', async () => {
    const { liftOutlook } = await import('./session');
    const o = liftOutlook('squat', 135, 1, 'gain');
    expect(o.weeks.map((w) => w.week)).toEqual([1, 2, 3, 4]);
    expect(o.weeks[0]?.sets.map((s) => [Math.round(s.kg * 10) / 10, s.reps, s.plus])).toEqual([[88, 5, false], [101.6, 5, false], [115.3, 5, true]]);
    expect(o.weeks[3]?.sets.every((s) => !s.plus && s.reps === 5)).toBe(true);
    expect(o.next).toMatchObject({ block: 'B', tmKg: 140 });
    expect(o.next.sets).toHaveLength(4);
  });
});
