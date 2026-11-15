/** Story 16 §3.4 (AC 8, unit): notes are read, answered and turned into yes/no proposals. */
import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../../db/types';
import { contextText, reportPrompt, type CoachContext } from '../training/coach';
import { buildSession } from '../training/session';
import { createSession } from '../training/sessionLog';
import { buildBrief } from '../coach/brief';
import { noteSignal, reviewDay as reviewSession, sessionNotes } from './notes';

const TMS = { squat: 135, bench: 90, rdl: 103.5, ohp: 45 };

function day2(notes: { a1?: string; a2?: string; day?: string }): WorkoutSession {
  const s = createSession(buildSession({ cycle: 1, week: 1, day: 2, phase: 'gain', tms: TMS, weightUnit: 'kg', bodyWeightKg: 73 }), 's1', '2026-11-14', 1000);
  return {
    ...s,
    status: 'done',
    finishedAt: 2000,
    ...(notes.day ? { note: notes.day, noteSavedAt: 1500 } : {}),
    exercises: s.exercises.map((e) => ({
      ...e,
      actual: e.actual.map((a, i) => ({ ...a, kg: e.prescription[i]?.kg ?? null, reps: e.prescription[i]?.targetReps ?? 8, done: true })),
      note: e.slot === 'A1' ? (notes.a1 ?? '') : e.slot === 'A2' ? (notes.a2 ?? '') : '',
    })),
  };
}

describe('note signals', () => {
  it.each([
    ['sharp pain in my left shoulder', 'pain'],
    ['knee felt off', 'pain'],
    ['way too heavy, form broke', 'heavy'],
    ['too easy honestly', 'light'],
    ['the machine was taken', 'machine'],
    ['gym has no seal row bench', 'machine'],
    ['loved this one', null],
  ] as const)('“%s” → %s', (text, signal) => {
    expect(noteSignal(text)).toBe(signal);
  });
});

describe('the day review reads every note (with or without Gemini)', () => {
  const ctx = {
    pushback: (_id: string, d: 'heavy' | 'light') => ({ fromKg: 25, kg: d === 'heavy' ? 22.5 : 27.5, corrected: false }),
    swapFor: () => ({ day: 2 as const, slot: 'A1' as const, to: 'seal-row' }),
  };
  it('pain → the PB-7.4 safety line plus a lighter and a swap proposal', () => {
    const items = reviewSession(day2({ a1: 'Sharp pain in my elbow on the last set' }), ctx);
    expect(items.find((i) => i.kind === 'safety')).toBeTruthy();
    expect(items.find((i) => i.kind === 'next')).toMatchObject({ why: 'pain', kg: 22.5 });
    expect(items.find((i) => i.kind === 'swap')).toMatchObject({ why: 'pain', to: 'seal-row' });
  });
  it('“too heavy” → the pushback flow’s next weight', () => {
    const items = reviewSession(day2({ a1: 'way too heavy' }), ctx);
    expect(items.find((i) => i.kind === 'next')).toMatchObject({ why: 'heavy', fromKg: 25, kg: 22.5 });
  });
  it('a taken machine → a swap from the menu; anything else is acknowledged', () => {
    const items = reviewSession(day2({ a1: 'machine was taken', a2: 'felt great today', day: 'slept 5 hours' }), ctx);
    expect(items.find((i) => i.kind === 'swap')).toMatchObject({ why: 'machine' });
    const acks = items.filter((i) => i.kind === 'noteAck');
    expect(acks.map((a) => (a.kind === 'noteAck' ? a.text : ''))).toEqual(['slept 5 hours', 'felt great today']);
  });
  it('notes are collected from the session, each exercise and each set', () => {
    const s = day2({ a1: 'too heavy', day: 'tired' });
    s.exercises[2]!.actual[0] = { ...s.exercises[2]!.actual[0]!, note: 'shoulder pinch' };
    expect(sessionNotes(s).map((n) => n.signal)).toEqual([null, 'heavy', 'pain']);
  });
});

describe('notes reach Philip', () => {
  it('the report prompt carries the session note, the exercise notes and the rule to answer each one', () => {
    const s = day2({ a1: 'too heavy', day: 'short on sleep' });
    const c: CoachContext = { session: s, phase: 'gain', tms: TMS, trainingDays: [1, 2, 4, 5], choices: {}, unit: 'kg', name: (id) => id };
    expect(contextText(c)).toContain('His note for the whole session: "short on sleep"');
    expect(contextText(c)).toContain('Note: "too heavy"');
    expect(reportPrompt(c)).toContain('every note he typed today');
  });
  it('the memory brief keeps them', () => {
    const s = day2({ a1: 'too heavy', day: 'short on sleep' });
    const brief = buildBrief({ today: '2026-11-15', profile: null, weights: [], food: null, currentCycle: 1, cycles: [], tmHistory: [], sessions: [s], notes: [], chat: [], name: (id) => id });
    expect(brief).toContain('whole session: "short on sleep"');
    expect(brief).toContain('"too heavy"');
  });
});
