import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../../db/types';
import { e1rmPoints, inProgress } from './progress';
import { buildSession } from './session';

const TMS = { squat: 135, bench: 90, rdl: 103.5, ohp: 45 };

function done(id: string, date: string, reps: number | null, status: WorkoutSession['status'] = 'done'): WorkoutSession {
  const plan = buildSession({ cycle: 1, week: 1, day: 2, phase: 'gain', tms: TMS });
  return {
    id, date, cycle: 1, block: 'A', week: 1, day: 2, status, estMinutes: plan.estMinutes, startedAt: Date.parse(date), finishedAt: null,
    exercises: plan.exercises.map((e) => ({
      slot: e.slot, exerciseId: e.exerciseId, swappedFrom: null, note: '', prescription: e.prescription,
      actual: e.prescription.map((p) => ({
        order: p.order,
        kg: p.kind === 'amrap' ? p.kg : null,
        reps: p.kind === 'amrap' ? reps : null,
        done: p.kind === 'amrap' && reps !== null,
        pain: false,
        copiedFromOrder: false,
      })),
    })),
  };
}

const liftOf = (id: string) => (id === 'bench' || id === 'pause-bench' ? 'bench' : null);

describe('e1rmPoints', () => {
  it('uses the + set of finished sessions (Epley) and skips sets above 10 reps', () => {
    const pts = e1rmPoints([done('a', '2026-11-06', 8), done('b', '2026-11-13', 12), done('c', '2026-11-20', 8, 'in_progress')], liftOf);
    expect(pts).toHaveLength(1);
    expect(pts[0]?.lift).toBe('bench');
    expect(pts[0]?.e1rmKg).toBeCloseTo(76.7 * (1 + 8 / 30), 0);
  });
});

describe('inProgress', () => {
  it('returns the latest unfinished session', () => {
    expect(inProgress([done('a', '2026-11-06', 8), done('b', '2026-11-07', null, 'in_progress')])?.id).toBe('b');
    expect(inProgress([done('a', '2026-11-06', 8)])).toBeNull();
  });
});

describe('workoutCardState', () => {
  const T = '2026-12-01';
  it('setup → briefing → next day → resume → cycle done', async () => {
    const { workoutCardState } = await import('./progress');
    expect(workoutCardState(null, [], T).kind).toBe('setup');
    expect(workoutCardState({ currentCycle: 0 }, [], T)).toEqual({ kind: 'briefing', cycle: 1 });
    expect(workoutCardState({ currentCycle: 1 }, [], T)).toEqual({ kind: 'next', cycle: 1, week: 1, day: 1 });
    const open = done('x', '2026-11-06', null, 'in_progress');
    expect(workoutCardState({ currentCycle: 1 }, [open], T).kind).toBe('resume');
    const all = ([1, 2, 3, 4] as const).flatMap((week) =>
      ([1, 2, 3, 4] as const).map((day) => ({ ...done(`${week}${day}`, '2026-11-06', 5), week, day })),
    );
    expect(workoutCardState({ currentCycle: 1 }, all, T)).toEqual({ kind: 'cycleDone', cycle: 1 });
  });
});

describe('workoutCardState: one workout a day (Story 6 §2)', () => {
  it('a done session dated today blocks the next day until tomorrow', async () => {
    const { workoutCardState } = await import('./progress');
    // Fri 6 Nov 2026: Day 1 done today → doneToday, next is W1 D2 on Mon 9 Nov (default days Mon/Tue/Thu/Fri).
    const d1 = { ...done('d1', '2026-11-06', 5), day: 1 as const };
    const st = workoutCardState({ currentCycle: 1 }, [d1], '2026-11-06');
    expect(st.kind).toBe('doneToday');
    if (st.kind !== 'doneToday') return;
    expect(st.next).toEqual({ week: 1, day: 2 });
    expect(st.nextDate).toBe('2026-11-09');
    expect(st.cycleDone).toBe(false);
    // Tomorrow the next day is offered.
    expect(workoutCardState({ currentCycle: 1 }, [d1], '2026-11-07')).toEqual({ kind: 'next', cycle: 1, week: 1, day: 2 });
  });

  it('a skipped session today does not block; an in-progress one still resumes', async () => {
    const { workoutCardState } = await import('./progress');
    const skipped = { ...done('s', '2026-11-06', null, 'skipped'), day: 1 as const };
    expect(workoutCardState({ currentCycle: 1 }, [skipped], '2026-11-06').kind).toBe('next');
    const d1 = { ...done('d1', '2026-11-06', 5), day: 1 as const };
    const open = { ...done('o', '2026-11-06', null, 'in_progress'), day: 2 as const };
    expect(workoutCardState({ currentCycle: 1 }, [d1, open], '2026-11-06').kind).toBe('resume');
  });

  it('finishing the last day of the cycle today → doneToday with cycleDone', async () => {
    const { workoutCardState } = await import('./progress');
    const all = ([1, 2, 3, 4] as const).flatMap((week) =>
      ([1, 2, 3, 4] as const).map((day) => ({ ...done(`${week}${day}`, week === 4 && day === 4 ? '2026-11-27' : '2026-11-02', 5), week, day })),
    );
    const st = workoutCardState({ currentCycle: 1 }, all, '2026-11-27');
    expect(st.kind).toBe('doneToday');
    if (st.kind === 'doneToday') {
      expect(st.cycleDone).toBe(true);
      expect(st.nextDate).toBeNull();
    }
  });
});
