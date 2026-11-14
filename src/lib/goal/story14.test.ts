/** Story 14: goal choices that work (OBS-0327E3) and Philip the educator (OBS-92D8DB). */
import { describe, expect, it } from 'vitest';
import { db } from '../../db/db';
import type { GoalChoice, PlanChange } from '../../db/types';
import { learnStrings } from '../../i18n/learn';
import { resumeWaiting, sendRequest } from '../../views/goal/request';
import { askPrompt } from '../coach/memory';
import { SAFETY } from '../targets';
import { CARDIO_MINUTES } from '../training/cardio';
import { RATE_PCT } from '../training/cycleGoal';
import { TM_INCREMENT_KG } from '../training/program';
import { buildSession, PHASE_ACCESSORY } from '../training/session';
import { SOURCES, whyPlan } from '../learn/whyPlan';
import { goalWindow } from './window';
import { basisOf, leverRanges, parseProposal, proposalPrompt } from './proposal';
import { askBlock, sameRequest } from './goalChoice';

const goal: GoalChoice = { phase: 'gain', startWeightKg: 73.6, startBfPct: 15, endWeightKg: 75, weeklyRatePct: 0.6, bfLinePct: 15, source: 'user', deadline: '2026-11-30' };
const ranges = leverRanges({
  choice: goal,
  calc: null,
  window: goalWindow({ start: '2026-11-02', today: '2026-11-12', startKg: 73, weights: [], food: [], targetOn: () => null, sessions: [], cycle: 1 }),
  sex: 'male',
  heightCm: 184,
  block: 'A',
  trainingDays: [1, 2, 4, 5],
  choices: {},
});

describe('OBS-0327E3: the open request belongs to one goal', () => {
  const open = { choice: goal, restart: false };
  it('same goal, same restart → the same request', () => {
    expect(sameRequest(open, { ...goal }, false)).toBe(true);
  });
  it('another goal, date, body fat line or a restart → not the same (asking again replaces it)', () => {
    expect(sameRequest(open, { ...goal, endWeightKg: 76 }, false)).toBe(false);
    expect(sameRequest(open, { ...goal, deadline: '2026-12-14' }, false)).toBe(false);
    expect(sameRequest(open, { ...goal, bfLinePct: 16 }, false)).toBe(false);
    expect(sameRequest(open, { ...goal, phase: 'lose' }, false)).toBe(false);
    expect(sameRequest(open, goal, true)).toBe(false);
    expect(sameRequest(null, goal, false)).toBe(false);
    expect(sameRequest(open, null, false)).toBe(false);
  });
  it('Ask says why it is disabled', () => {
    expect(askBlock({ mode: 'own', hasChoice: false, blocked: false, workoutOpen: false, restart: true })).toBe('needWeight');
    expect(askBlock({ mode: 'own', hasChoice: true, blocked: true, workoutOpen: false, restart: true })).toBe('invalid');
    expect(askBlock({ mode: 'philip', hasChoice: true, blocked: false, workoutOpen: true, restart: true })).toBe('workoutOpen');
    expect(askBlock({ mode: 'keep', hasChoice: true, blocked: false, workoutOpen: true, restart: false })).toBeNull();
    expect(askBlock({ mode: 'keep', hasChoice: true, blocked: false, workoutOpen: false, restart: false })).toBeNull();
  });
});

describe('OBS-0327E3 root cause: no way for Philip to answer must not leave the request waiting', () => {
  it('no cloud pairing and no Gemini key → "noAi", the request is marked failed and is not re-polled', async () => {
    await db.profile.clear();
    const row: Omit<PlanChange, 'id'> = {
      at: Date.now(),
      cycle: 1,
      event: 'manual',
      reason: 'manual',
      restart: false,
      choice: goal,
      status: 'waiting',
      prompt: 'P',
      jobId: null,
      ranges,
      proposal: null,
      accepted: null,
      undo: null,
      appliedAt: null,
    };
    const id = (await db.planChanges.add(row)) as number;
    expect(await sendRequest(id)).toBe('noAi');
    const after = await db.planChanges.get(id);
    // Before the fix this stayed { status: 'waiting', failed: undefined }: the sheet treated it as in
    // flight, disabled Keep this goal / Philip's pick / Set my own and said "You're offline".
    expect(after?.status).toBe('waiting');
    expect(after?.failed).toBe(true);
    expect(await resumeWaiting(id)).toBe('failed');
  });
});

describe('OBS-92D8DB: evidence labels from Philip', () => {
  const reply = (extra: Record<string, unknown>) => ({
    message: 'On pace.',
    kcal: { value: 2800, why: 'a', ...extra },
    proteinG: { value: 140, why: 'b', basis: 'research' },
    cardioMin: { value: 15, why: 'c', basis: 'default' },
  });
  it('reads basis per lever; missing or unknown is "practice", never a rejection', () => {
    const p = parseProposal(reply({ basis: 'nonsense' }), ranges, { kind: 'claude-paste', model: null }, 1);
    expect(p.basis?.proteinG).toBe('research');
    expect(p.basis?.cardioMin).toBe('default');
    expect(p.basis?.kcal ?? 'practice').toBe('practice');
    expect(basisOf({ value: 1 })).toBe('practice');
    expect(basisOf(5)).toBe('practice');
  });
  it('the goal-plan and Ask prompts ask Philip to teach and never invent studies', () => {
    const p = proposalPrompt({ event: 'manual', reason: 'manual', restart: false, choice: goal, ranges, window: goalWindow({ start: '2026-11-02', today: '2026-11-12', startKg: 73, weights: [], food: [], targetOn: () => null, sessions: [], cycle: 1 }), brief: 'B', name: (x) => x });
    expect(p).toContain('"basis"');
    expect(p).toContain('Never invent a study');
    const a = askPrompt('B', [], 'Bulk vs cut?');
    expect(a).toContain('teach like a coach');
    expect(a).toContain('never invent studies');
  });
});

describe('OBS-92D8DB: Why this plan', () => {
  const plan = whyPlan({ phase: 'gain', days: 4, strengthMin: 60, sex: 'male' });
  const all = [...plan.compare, ...plan.week, ...plan.adjust];
  it('every rule has exactly one label; research rules name sources from the allowed list only', () => {
    for (const r of all) {
      expect(['research', 'practice', 'default']).toContain(r.basis);
      if (r.basis === 'research') expect(r.sources.length).toBeGreaterThan(0);
      else expect(r.sources).toEqual([]);
      for (const s of r.sources) expect(Object.keys(SOURCES)).toContain(s);
    }
  });
  it('the numbers come from the engine, not copies', () => {
    const row = (id: string) => plan.compare.find((r) => r.id === id)!;
    expect(row('pace').cut).toContain(`${-RATE_PCT.lose.max}`);
    expect(row('pace').bulk).toContain(`${RATE_PCT.gain.max}`);
    expect(row('cardio').cut).toContain(`${CARDIO_MINUTES.lose} minutes`);
    expect(row('tm').cut).toContain(`+${TM_INCREMENT_KG.lose.upper} kg`);
    expect(row('tm').bulk).toContain(`+${TM_INCREMENT_KG.gain.lower} kg`);
    expect(row('acc').cut).toContain(`${PHASE_ACCESSORY.cutSlotBSets} sets`);
    expect(plan.adjust.find((r) => r.id === 'safety')!.text).toContain(String(SAFETY.calorieFloor.male));
    expect(whyPlan({ phase: 'gain', days: 4, sex: 'female' }).adjust.find((r) => r.id === 'safety')!.text).toContain(String(SAFETY.calorieFloor.female));
    expect(whyPlan({ phase: 'gain', days: 3, strengthMin: 45 }).week.find((r) => r.id === 'budget')!.title).toContain('45 minutes');
  });
  it('the accessory rule matches what the session builder does on a cut and a bulk', () => {
    const tms = { squat: 100, bench: 80, rdl: 90, ohp: 45 };
    const sets = (phase: 'gain' | 'lose' | 'maintain', slot: string) =>
      buildSession({ cycle: 1, week: 1, day: 1, phase, tms, weightUnit: 'kg', budgetMin: 999 }).exercises.find((e) => e.slot === slot)!.prescription.length;
    const base = sets('maintain', 'B');
    expect(sets('lose', 'B')).toBe(PHASE_ACCESSORY.cutSlotBSets);
    expect(sets('gain', 'A1')).toBe(sets('maintain', 'A1') + PHASE_ACCESSORY.bulkExtraSets);
    expect(base).toBeGreaterThan(PHASE_ACCESSORY.cutSlotBSets);
  });
  it('says plainly what does not change between a cut and a bulk', () => {
    expect(plan.compare.find((r) => r.id === 'main')!.both).toContain('same reps on a cut and a bulk');
  });
  it('maintain gets its own line', () => {
    expect(whyPlan({ phase: 'maintain', days: 4 }).intro).toContain('maintaining');
  });
  it('no emoji in the learn pack', () => {
    for (const v of Object.values(learnStrings)) expect(v).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
