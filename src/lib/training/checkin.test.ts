import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../../db/types';
import { applyTodayChange, parseCoachReply, remainingWork, reviewSession, ruleChange } from './checkin';
import { DEFAULT_BAR_SETUP } from './plates';
import { buildSession } from './session';
import { copyOrder, createSession } from './sessionLog';

const TMS = { squat: 135, bench: 90, rdl: 103.5, ohp: 45 };
const fresh = (): WorkoutSession => createSession(buildSession({ cycle: 1, week: 1, day: 1, phase: 'maintain', tms: TMS }), 's', '2026-11-06', 0);

/** Logs the first `n` work sets of the main lift as ordered. */
function doneMain(s: WorkoutSession, n: number): WorkoutSession {
  const main = s.exercises[0]!;
  let left = n;
  main.actual = main.actual.map((a) => {
    const p = main.prescription.find((x) => x.order === a.order)!;
    if (p.kind === 'warmup' || left <= 0) return a;
    left--;
    return copyOrder(p, a);
  });
  return s;
}

describe('rules', () => {
  it('too heavy: −10% on the sets left; out of breath: +60 s rest and one set fewer', () => {
    const s = doneMain(fresh(), 1);
    expect(ruleChange('heavy', s.exercises[0]!)).toEqual({ loadFactor: 0.9, restExtraSec: 0, dropSets: 0 });
    expect(ruleChange('breath', s.exercises[0]!)).toEqual({ loadFactor: 1, restExtraSec: 60, dropSets: 1 });
    expect(ruleChange('easy', s.exercises[0]!)).toEqual({ loadFactor: 1, restExtraSec: 0, dropSets: 0 });
  });
});

describe('applyTodayChange', () => {
  it('changes only sets not yet done, keeps loads loadable, keeps the original orders', () => {
    const s = doneMain(fresh(), 1);
    const main = s.exercises[0]!;
    const before = remainingWork(main);
    const next = applyTodayChange(main, { loadFactor: 0.9, restExtraSec: 60, dropSets: 1 }, DEFAULT_BAR_SETUP, 'lb');
    expect(next.originalPrescription).toEqual(main.prescription);
    expect(remainingWork(next)).toHaveLength(before.length - 1);
    const doneOrder = main.actual.find((a) => a.done)!.order;
    expect(next.prescription.find((p) => p.order === doneOrder)).toEqual(main.prescription.find((p) => p.order === doneOrder));
    const changed = remainingWork(next)[0]!;
    const orig = before[0]!;
    expect(changed.kg!).toBeLessThan(orig.kg!);
    expect(changed.restSec).toBe(orig.restSec + 60);
  });
  it('never drops the last set left', () => {
    const s = doneMain(fresh(), 2);
    const next = applyTodayChange(s.exercises[0]!, { loadFactor: 1, restExtraSec: 0, dropSets: 2 }, DEFAULT_BAR_SETUP, 'lb');
    expect(remainingWork(next)).toHaveLength(1);
  });
});

describe('parseCoachReply', () => {
  it('clamps Gemini’s numbers and strips emoji', () => {
    expect(parseCoachReply({ loadPct: -40, restExtraSec: 500, dropSets: 5, stop: false, message: 'Breathe. 💨 Lighter.' })).toEqual({
      change: { loadFactor: 0.75, restExtraSec: 120, dropSets: 2 },
      stop: false,
      message: 'Breathe.  Lighter.',
    });
    expect(parseCoachReply({ message: 'hi' })).toBeNull();
    expect(parseCoachReply('nope')).toBeNull();
  });
});

describe('reviewSession', () => {
  it('a flagged main lift proposes −5% TM for the cycle; out of breath adds rest', () => {
    const s = doneMain(fresh(), 1);
    s.exercises[0]!.actual[3] = { ...s.exercises[0]!.actual[3]!, flag: 'breath', note: 'gassed' };
    expect(reviewSession(s)).toEqual([
      { kind: 'tm', lift: 'squat', factor: 0.95, why: 'flag' },
      { kind: 'rest', extraSec: 30 },
    ]);
  });
  it('nothing flagged and nothing missed → nothing to change', () => {
    expect(reviewSession(doneMain(fresh(), 3))).toEqual([]);
  });
});

describe('buildSession rest bonus', () => {
  it('adds the cycle’s extra rest to work sets only', () => {
    const base = buildSession({ cycle: 1, week: 1, day: 2, phase: 'maintain', tms: TMS });
    const more = buildSession({ cycle: 1, week: 1, day: 2, phase: 'maintain', tms: TMS, restBonusSec: 30 });
    const w = (x: typeof base) => x.exercises[0]!.prescription;
    expect(w(more).find((p) => p.kind === 'warmup')!.restSec).toBe(w(base).find((p) => p.kind === 'warmup')!.restSec);
    expect(w(more).find((p) => p.kind === 'main')!.restSec).toBeGreaterThanOrEqual(w(base).find((p) => p.kind === 'main')!.restSec);
  });
});
