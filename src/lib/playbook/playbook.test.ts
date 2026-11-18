/**
 * Story 16 (D-039): Philip's Playbook as code. Acceptance criteria 1–4, 6 and 13.
 */
import { describe, expect, it } from 'vitest';
import { carbDays } from '../goal/carbDays';
import { calculateTargets, type CalcInputs } from '../targets';
import { checkUserGoal, coachPhase, recommendPhase } from '../training/cycleGoal';
import { parseAskReply } from '../coach/memory';
import { parseCoachTurn, reportPrompt, type CoachContext } from '../training/coach';
import { buildSession } from '../training/session';
import { createSession } from '../training/sessionLog';
import { checkLoad, plausibleBand, pushback, rirShift } from './loads';
import { loadProfileFrom, roundingFor, sessionLoadCheck, traitsOf } from './loadContext';
import { DEFAULT_BAR_SETUP, KG_PER_LB } from '../training/plates';
import { fatFloorG, KCAL_PER_KG, PB_RATE, ratePctFor } from './rules';
import { OUTSIDE_PREFIX, PLAYBOOK_PROMPT } from './prompt';

// Every source file as text (Vite's glob; tests and the portable QA module excluded).
const SOURCES = import.meta.glob(['../../**/*.ts', '../../**/*.tsx', '!../../**/*.test.ts', '!../../modules/**', '!../../test/**'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const files = (): [string, string][] => Object.entries(SOURCES);

describe('AC 1: the changed values live only in rules.ts', () => {
  // Patterns for the numbers the playbook changed (or that used to be duplicated), as code literals.
  const STRAY: [RegExp, string][] = [
    [/CUT_AT_BF\s*=\s*\d/, 'cut line'],
    [/LEAN_BULK_MAX_BF\s*=\s*\d/, 'bulk line'],
    [/minFatPct:\s*0\.\d/, 'fat floor %'],
    [/minFatGPerKg:\s*0\.\d/, 'fat floor g/kg'],
    [/calorieFloor:\s*\{\s*male:\s*\d/, 'calorie floor'],
    [/(max|default)(Loss|Gain)PctPerWeek:\s*0\.\d/, 'weekly pace'],
    [/(gain|lose):\s*\{\s*min:\s*-?\d/, 'rate band'],
    [/(lose|gain|maintain):\s*\[\s*\d\.\d+,\s*\d\.\d+\s*\]/, 'protein band'],
    [/\b7700\b/, 'kcal per kg'],
    [/shiftPct/, 'carb shift %'],
    [/'[a-z-]+':\s*L\('(squat|bench|rdl|ohp|bw)',\s*0?\.\d+\)/, 'accessory ratio'],
    // Story 17 (D-040): PB-2.2 multipliers, PB-4.8 bodyweight progression, PB-6.4 today's-line bands.
    [/sedentary:\s*1\.\d+,\s*light:/, 'activity factors'],
    [/\b1\.45\b|\b1\.65\b/, 'PB-2.2 multiplier'],
    [/maxSets:\s*\d/, 'bodyweight max sets'],
    [/weightKg:\s*0\.5,\s*bfPts/, 'today line bands'],
  ];
  it('no stray literals of the playbook numbers outside lib/playbook/rules.ts', () => {
    const offenders: string[] = [];
    expect(files().length).toBeGreaterThan(100);
    for (const [f, text] of files()) {
      if (f === './rules.ts' || f.endsWith('/playbook/rules.ts')) continue;
      for (const [re, what] of STRAY) if (re.test(text)) offenders.push(`${f}: ${what}`);
    }
    expect(offenders).toEqual([]);
  });
  it('AC 6: no flat-percent load adjustments remain anywhere', () => {
    const FLAT: RegExp[] = [/loadFactor:\s*(0\.\d+|1\.\d*[1-9])/, /nextKgPct/, /loadPct\b/, /LOAD_PCT_PER_MISSED_REP/, /MAX_LOAD_DROP_PCT/, /dropForShort/, /loadDropPct/, /kg\s*\*\s*\(1\s*[-+]\s*0\.\d+\)/];
    const offenders: string[] = [];
    for (const [f, text] of files()) for (const re of FLAT) if (re.test(text)) offenders.push(`${f}: ${re}`);
    expect(offenders).toEqual([]);
  });
});

describe('AC 2: phase lines (PB-1.1, PB-1.2, PB-1.4)', () => {
  it('17.9% BF bulk → no flag; 18% bulk → mini-cut warning; Philip’s pick at 18% = cut', () => {
    expect(checkUserGoal(73, 'gain', 74, null, 4, { bfPct: 17.9, sex: 'male' }).issues).toEqual([]);
    expect(checkUserGoal(73, 'gain', 74, null, 4, { bfPct: 18, sex: 'male' }).issues.map((i) => i.code)).toEqual(['miniCut']);
    expect(recommendPhase(18, null, null, { sex: 'male' })).toBe('lose');
    expect(coachPhase(18, null, 'gain').phase).toBe('lose');
    expect(recommendPhase(24, null, null, { sex: 'female' })).toBe('lose');
  });
});

describe('AC 3: calories follow rate × kg × 7,700 ÷ 7 for each training-age band (PB-2.3)', () => {
  const base: CalcInputs = { sex: 'male', ageYears: 28, heightCm: 178, weightKg: 73, activityLevel: 'moderate', trainingDaysPerWeek: 4, goal: 'gain', targetWeightKg: null, weeklyRateKg: null };
  it.each([
    [0.5, PB_RATE.bulk.lt1.def],
    [2, PB_RATE.bulk['1to3'].def],
    [5, PB_RATE.bulk.gt3.def],
    [null, PB_RATE.bulk['1to3'].def],
  ] as const)('training years %s → %s%%/week', (years, pct) => {
    const r = calculateTargets({ ...base, trainingYears: years });
    const rateKg = Math.round(((pct / 100) * 73) * 100) / 100;
    expect(r.adjustment).toBe(Math.round((rateKg * KCAL_PER_KG) / 7));
    expect(ratePctFor('gain', { trainingYears: years }).def).toBe(pct);
  });
  it('a cut: standard −0.5%, above 25% BF faster, lean slower', () => {
    expect(ratePctFor('lose').def).toBe(-0.5);
    expect(ratePctFor('lose', { bfPct: 27 }).min).toBe(-1.0);
    expect(ratePctFor('lose', { bfPct: 10, sex: 'male' }).max).toBe(-0.25);
  });
});

describe('AC 4: fat floor and carb cycling (PB-3.2, PB-3.4)', () => {
  it('fat never below max(0.6 g/kg, 20%)', () => {
    for (const kcal of [1500, 2000, 2600, 3400, 4200])
      for (const kg of [55, 73, 95]) {
        const r = calculateTargets({ sex: 'male', ageYears: 30, heightCm: 180, weightKg: kg, activityLevel: 'moderate', trainingDaysPerWeek: 4, goal: 'maintain', targetWeightKg: null, weeklyRateKg: null });
        expect(r.fatG).toBeGreaterThanOrEqual(Math.floor(fatFloorG(r.calories, kg)));
        void kcal;
      }
  });
  it.each([[[1, 3, 5]], [[1, 2, 4, 5]], [[1, 2, 3, 4, 5]]] as const)('carb cycling keeps the week equal for %j gym days', (days) => {
    const base = { calories: 2700, proteinG: 146, fatG: 75, carbsG: 359 };
    const s = carbDays(base, days, 'male', 73)!;
    expect(s).not.toBeNull();
    const week = Object.values(s.overrides).reduce((a, m) => a + m!.calories, 0);
    // Equal within gram rounding (at most half a gram of carbs, 2 kcal, per gym day).
    expect(Math.abs(week - base.calories * 7)).toBeLessThanOrEqual(2 * days.length);
    // Gym days: fat at the floor; rest days: fat ≈ 1.0 g/kg; protein the same every day.
    expect(s.train.fatG).toBe(Math.round(fatFloorG(s.train.calories, 73)));
    expect(s.rest.fatG).toBe(73);
    expect(s.train.proteinG).toBe(s.rest.proteinG);
    expect(s.train.carbsG).toBeGreaterThan(base.carbsG);
    expect(s.rest.carbsG).toBeLessThan(base.carbsG);
    for (const m of [s.train, s.rest]) expect(m.fatG).toBeGreaterThanOrEqual(Math.floor(fatFloorG(m.calories, 73)));
  });
});

describe('AC 6: the plausibility check (PB-8.4)', () => {
  const profile = loadProfileFrom({ squat: 135, bench: 90, rdl: 103.5, ohp: 45 }, 73); // 150 kg squat 1RM
  const lb = roundingFor('walking-lunge', 'lb', DEFAULT_BAR_SETUP);
  it('85 lb per hand walking lunge for a 73 kg lifter with a 150 kg squat → corrected into the band', () => {
    const kg = 85 * KG_PER_LB;
    const v = checkLoad('walking-lunge', kg, 10, 1, profile, [], lb.round, lb.step, traitsOf('walking-lunge'));
    expect(v.status).toBe('corrected');
    expect(v.pbId).toBe('PB-8.4');
    expect(v.reason).toBe('overBodyWeight');
    expect(v.kg!).toBeLessThanOrEqual(v.band!.max + 1e-6);
    expect(v.kg!).toBeGreaterThanOrEqual(v.band!.min - lb.step);
    expect(Math.round(v.kg! / KG_PER_LB)).toBe(35);
  });
  it('an own log typed as both dumbbells is ignored as an anchor, not trusted', () => {
    const history = [10, 10, 10].map((r) => ({ kg: 36, reps: r, done: true }));
    const band = plausibleBand('walking-lunge', 10, 1, profile, history, traitsOf('walking-lunge'))!;
    expect(band.anchor).toBe('ratio');
    expect(band.ownIgnored).toBe(true);
  });
  it('a plausible load + "too heavy" → the +2 RIR load, not −10%', () => {
    const kg = roundingFor('hack-squat', 'kg', DEFAULT_BAR_SETUP);
    const ok = checkLoad('hack-squat', 60, 10, 1, profile, [], kg.round, kg.step, traitsOf('hack-squat'));
    expect(ok.status).toBe('ok');
    const r = pushback('heavy', 'hack-squat', 60, 10, 1, profile, [], kg.round, kg.step);
    expect(r.corrected).toBe(false);
    expect(r.kg).toBe(kg.round(rirShift(60, 10, 1, 2)));
    expect(r.kg).toBe(57.5);
    expect(r.kg).not.toBe(kg.round(60 * 0.9));
  });
  it('an implausible load + pushback → corrected from scratch', () => {
    const r = pushback('heavy', 'walking-lunge', 85 * KG_PER_LB, 10, 1, profile, [], lb.round, lb.step, traitsOf('walking-lunge'));
    expect(r.corrected).toBe(true);
    expect(Math.round(r.kg / KG_PER_LB)).toBe(35);
  });
  it('the session builder checks every accessory: an absurd last log is corrected and marked', () => {
    const plan = buildSession({
      cycle: 1, week: 1, day: 3, phase: 'maintain', tms: { squat: 135, bench: 90, rdl: 103.5, ohp: 45 }, weightUnit: 'lb', bodyWeightKg: 73,
      lastSets: (id) => (id === 'walking-lunge' ? [10, 10, 10].map((r) => ({ kg: 80 * KG_PER_LB, reps: r, done: true })) : null),
      loadCheck: sessionLoadCheck({ squat: 135, bench: 90, rdl: 103.5, ohp: 45 }, 73, [], 'lb', DEFAULT_BAR_SETUP),
    });
    const a2 = plan.exercises.find((e) => e.exerciseId === 'walking-lunge')!;
    const first = a2.prescription[0]!;
    expect(first.corrected?.reason).toBeDefined();
    expect(first.kg!).toBeLessThan(30);
  });
});

describe('AC 13: outside-playbook answers are labelled', () => {
  it('the prompts carry the playbook summary and the hierarchy', () => {
    expect(PLAYBOOK_PROMPT).toContain('PB-1.1');
    expect(PLAYBOOK_PROMPT).toContain(OUTSIDE_PREFIX);
    expect(PLAYBOOK_PROMPT.length).toBeLessThan(2000);
    const session = createSession(buildSession({ cycle: 1, week: 1, day: 2, phase: 'gain', tms: { squat: 135, bench: 90, rdl: 103.5, ohp: 45 } }), 's', '2026-11-14', 0);
    const c: CoachContext = { session, phase: 'gain', tms: { squat: 135, bench: 90, rdl: 103.5, ohp: 45 }, trainingDays: [1, 2, 4, 5], choices: {}, unit: 'kg', name: (id) => id };
    expect(reportPrompt(c)).toContain("Philip's Playbook");
  });
  it('a mocked reply flagged outside gets the prefix (chat, report)', () => {
    const ask = parseAskReply({ message: 'Creatine is well studied for strength.', outside: true, remember: [] });
    expect(ask?.message.startsWith(OUTSIDE_PREFIX)).toBe(true);
    const inside = parseAskReply({ message: 'Protein stays at 2.2 g/kg on your cut.', outside: false });
    expect(inside?.message.startsWith(OUTSIDE_PREFIX)).toBe(false);
    const already = parseAskReply({ message: `${OUTSIDE_PREFIX} sauna is fine.`, outside: true });
    expect(already?.message.split(OUTSIDE_PREFIX).length).toBe(2);
    const session = createSession(buildSession({ cycle: 1, week: 1, day: 2, phase: 'gain', tms: { squat: 135, bench: 90, rdl: 103.5, ohp: 45 } }), 's', '2026-11-14', 0);
    const c: CoachContext = { session, phase: 'gain', tms: { squat: 135, bench: 90, rdl: 103.5, ohp: 45 }, trainingDays: [1, 2, 4, 5], choices: {}, unit: 'kg', name: (id) => id };
    expect(parseCoachTurn({ message: 'Sleep more.', outside: true, changes: [] }, c)?.message).toBe(`${OUTSIDE_PREFIX} Sleep more.`);
  });
});
