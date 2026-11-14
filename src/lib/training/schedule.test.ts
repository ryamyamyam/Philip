import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../../db/types';
import { DEFAULT_TRAINING_DAYS, goalDay, isoWeekday, planDates, squatRdlTooClose, trainingDaysOrDefault } from './schedule';

type Ref = { week: 1 | 2 | 3 | 4; day: 1 | 2 | 3 | 4; date: string; status?: WorkoutSession['status'] };
const s = ({ week, day, date, status = 'done' }: Ref): WorkoutSession => ({
  id: `${week}-${day}-${date}`, date, cycle: 1, block: 'A', week, day, status, estMinutes: 40,
  startedAt: Date.parse(`${date}T18:00:00`), finishedAt: status === 'done' ? Date.parse(`${date}T19:00:00`) : null, exercises: [],
});

describe('schedule helpers', () => {
  it('ISO weekdays and Philip\'s default pick', () => {
    expect(isoWeekday('2026-11-02')).toBe(1); // Monday
    expect(isoWeekday('2026-11-08')).toBe(7); // Sunday
    expect(DEFAULT_TRAINING_DAYS).toEqual([1, 2, 4, 5]);
    expect(trainingDaysOrDefault(undefined)).toEqual([1, 2, 4, 5]);
    expect(trainingDaysOrDefault([5, 1, 3, 2])).toEqual([1, 2, 3, 5]);
    expect(trainingDaysOrDefault([1, 2])).toEqual([1, 2, 4, 5]); // outside 3–5 days → default
    expect(trainingDaysOrDefault([1, 3, 5])).toEqual([1, 3, 5]); // Story 12: 3–5 days are his own
  });

  it('flags squat and RDL only 2 days apart (three training days in a row), in any rotation', () => {
    expect(squatRdlTooClose([1, 2, 4, 5])).toBe(false);
    expect(squatRdlTooClose([1, 3, 5, 7])).toBe(false);
    expect(squatRdlTooClose([1, 2, 3, 5])).toBe(true);
    expect(squatRdlTooClose([1, 2, 3, 4])).toBe(true);
  });
});

describe('planDates (Story 6 §3.2)', () => {
  it('default days from Mon 2 Nov → 16 dates ending Fri 27 Nov (goal day)', () => {
    const p = planDates({ today: '2026-11-02', sessions: [], cycle: 1 });
    expect(p).toHaveLength(16);
    expect(p.slice(0, 4).map((d) => d.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06']);
    expect(p.slice(0, 4).map((d) => d.lift)).toEqual(['squat', 'bench', 'rdl', 'ohp']);
    expect(p.at(-1)).toMatchObject({ date: '2026-11-27', week: 4, day: 4, isGoalDay: true });
    expect(p.filter((d) => d.isGoalDay)).toHaveLength(1);
  });

  it('missing Thu 5 Nov pushes the goal day to Mon 30 Nov', () => {
    const sessions = [s({ week: 1, day: 1, date: '2026-11-02' }), s({ week: 1, day: 2, date: '2026-11-03' })];
    const p = planDates({ today: '2026-11-06', sessions, cycle: 1 });
    expect(p[0]).toMatchObject({ date: '2026-11-06', week: 1, day: 3 });
    expect(goalDay({ today: '2026-11-06', sessions, cycle: 1 })).toBe('2026-11-30');
  });

  it('done today → the first planned date is the next training day', () => {
    const sessions = [s({ week: 1, day: 1, date: '2026-11-02' })];
    expect(planDates({ today: '2026-11-02', sessions, cycle: 1 })[0]).toMatchObject({ date: '2026-11-03', day: 2 });
  });

  it('in progress today → the first planned date is today, even on an off day', () => {
    const sessions = [s({ week: 1, day: 1, date: '2026-11-04', status: 'in_progress' })]; // Wednesday
    expect(planDates({ today: '2026-11-04', sessions, cycle: 1 })[0]).toMatchObject({ date: '2026-11-04', day: 1 });
  });

  it('training on a Wednesday pulls the later dates back', () => {
    const sessions = [s({ week: 1, day: 1, date: '2026-11-02' }), s({ week: 1, day: 2, date: '2026-11-03' }), s({ week: 1, day: 3, date: '2026-11-04' })];
    const p = planDates({ today: '2026-11-04', sessions, cycle: 1 });
    expect(p[0]).toMatchObject({ date: '2026-11-05', week: 1, day: 4 });
    expect(p.at(-1)?.date).toBe('2026-11-26');
  });

  it('a cycle starting mid-week (Thu) and custom days', () => {
    expect(planDates({ today: '2026-11-05', sessions: [], cycle: 1 }).slice(0, 3).map((d) => d.date)).toEqual(['2026-11-05', '2026-11-06', '2026-11-09']);
    const p = planDates({ today: '2026-11-02', trainingDays: [1, 3, 5, 7], sessions: [], cycle: 1 });
    expect(p.slice(0, 4).map((d) => d.date)).toEqual(['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-08']);
  });

  it('no cycle running → nothing planned; other cycles\' sessions are ignored', () => {
    expect(planDates({ today: '2026-11-02', sessions: [], cycle: 0 })).toEqual([]);
    expect(planDates({ today: '2026-11-02', sessions: [], cycle: null })).toEqual([]);
    const old = { ...s({ week: 1, day: 1, date: '2026-10-05' }), cycle: 0 };
    expect(planDates({ today: '2026-11-02', sessions: [old], cycle: 1 })).toHaveLength(16);
  });
});
