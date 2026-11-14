/**
 * Story 11 §5: Philip's goal plan. Pure, tested.
 *
 * Two layers (owner, 2026-11-13: numbers are never "based on nothing", and Philip makes the call):
 * 1. The engine computes the allowed range for every lever from the owner's data: the targets
 *    calculator (lib/targets.ts, safety rules unchanged), the measured maintenance from his logs, the
 *    protein evidence band and Philip's cardio and menu rules.
 * 2. Philip (Gemini, or Claude by paste) picks a value for each lever and says why. Anything outside
 *    the range is clamped and shown as capped; invalid swaps or days are dropped, not guessed.
 *
 * Evidence labels:
 * - Established: body-weight change follows energy balance; ~7,700 kcal per kg is a rough average.
 * - Supported: about 1.6 g/kg protein a day captures most of the muscle benefit for people who lift;
 *   up to ~2.2 g/kg is a reasonable upper end (higher on a cut).
 * - Coaching defaults (hypotheses): the ±150 kcal margin, the cardio minutes, the menu.
 */
import type { CalcResult } from '../targets';
import { referenceWeightKg, SAFETY } from '../targets';
import type { GoalChoice, GoalPlanItems, GoalProposalRecord, IsoWeekday, Sex } from '../../db/types';
import { CARDIO_MINUTES } from '../training/cardio';
import { exerciseFor, menuSlot, type ExerciseId } from '../training/exercises';
import { roundTo, type Block, type Day, type LiftId } from '../training/program';
import { roundToStep } from '../training/plates';
import { parseRemember, REMEMBER_RULE } from '../coach/memory';
import type { GoalWindow } from './window';
import { PROTEIN_PER_KG } from './carbDays';
import { windowText } from './window';

export const PROPOSAL_RULES = {
  /** kcal around the formula and the measured target. */
  kcalMargin: 150,
  /** kcal around the formula when the food log can't be trusted. */
  kcalMarginUnreliable: 100,
  /** Widest the range may get either side of the formula. */
  kcalMaxSpread: 400,
  /** Story 12 update: by phase (lib/goal/carbDays.ts › PROTEIN_PER_KG). */
  proteinPerKg: PROTEIN_PER_KG,
  cardioMin: { gain: [15, 25], maintain: [15, 30], lose: [20, 40] } as const,
  /** 0.12.3: same bounds as the workout report (COACH_BOUNDS): TM ±10%, accessory next weight ±20%. */
  tmPct: 0.1,
  loadPct: 0.2,
  messageMax: 700,
  whyMax: 200,
} as const;

export interface Range {
  min: number;
  max: number;
  /** The engine's own value (shown as "formula"). */
  def: number;
}

export interface LeverRanges {
  /** Null when body stats are missing (then calories stay as they are). */
  kcal: Range | null;
  proteinG: Range | null;
  cardioMin: Range;
  /** The block whose menu the swaps come from (the new cycle's, or the current one). */
  block: Block;
  trainingDays: IsoWeekday[];
  choices: Readonly<Record<string, string>>;
  /** 0.12.3: current training maxes and accessory weights Philip may move (only while the cycle continues). */
  tms?: { lift: LiftId; kg: number }[];
  loads?: { exerciseId: string; kg: number }[];
  /** Plate / dumbbell unit for rounding. */
  unit?: 'kg' | 'lb';
  /** Story 12: the most cardio the owner will walk after a session, and his minutes for the lifts (his availability). */
  cardioCap?: number;
  strengthMin?: number;
  /** Fat and carbs follow from kcal and protein with the calculator's fat floor. */
  weightKg: number;
  heightCm: number | null;
  sex: Sex | null;
}

export interface RangeInput {
  choice: GoalChoice;
  calc: CalcResult | null;
  window: GoalWindow;
  sex: Sex | null;
  heightCm: number | null;
  block: Block;
  trainingDays: IsoWeekday[];
  choices: Readonly<Record<string, string>>;
  /** Days left to reach the goal (a new cycle: 28; off track, same cycle: what's left of it). */
  goalDays?: number;
  cardioCap?: number;
  strengthMin?: number;
  tms?: { lift: LiftId; kg: number }[];
  loads?: { exerciseId: string; kg: number }[];
  unit?: 'kg' | 'lb';
}

const r10 = (n: number) => Math.round(n / 10) * 10;

export function leverRanges(i: RangeInput): LeverRanges {
  const { choice: c, calc, window: w } = i;
  let kcal: Range | null = null;
  if (calc) {
    const formula = calc.calories;
    let lo = formula;
    let hi = formula;
    if (w.reliable && w.maintenanceKcal !== null) {
      const kgPerDay = (c.endWeightKg - c.startWeightKg) / Math.max(7, i.goalDays ?? 28);
      const measured = r10(w.maintenanceKcal + kgPerDay * 7700);
      lo = Math.min(lo, measured) - PROPOSAL_RULES.kcalMargin;
      hi = Math.max(hi, measured) + PROPOSAL_RULES.kcalMargin;
    } else {
      lo -= PROPOSAL_RULES.kcalMarginUnreliable;
      hi += PROPOSAL_RULES.kcalMarginUnreliable;
    }
    lo = Math.max(lo, formula - PROPOSAL_RULES.kcalMaxSpread);
    hi = Math.min(hi, formula + PROPOSAL_RULES.kcalMaxSpread);
    const floor = i.sex ? SAFETY.calorieFloor[i.sex] : SAFETY.calorieFloor.female;
    lo = Math.max(r10(lo), floor);
    hi = Math.min(r10(hi), SAFETY.calorieCeiling);
    kcal = { min: lo, max: Math.max(lo, hi), def: formula };
  }
  const ref = i.heightCm ? referenceWeightKg(c.startWeightKg, i.heightCm) : c.startWeightKg;
  const [pMin, pMax] = PROPOSAL_RULES.proteinPerKg[c.phase];
  const proteinG: Range = {
    min: Math.round(ref * pMin),
    max: Math.round(ref * pMax),
    def: calc ? Math.min(Math.round(ref * pMax), Math.max(Math.round(ref * pMin), calc.proteinG)) : Math.round(ref * ((pMin + pMax) / 2)),
  };
  const [cMin0, cMax0] = PROPOSAL_RULES.cardioMin[c.phase];
  // Story 12: his time is a ceiling; the phase's range never pushes him past it.
  const cMax = i.cardioCap !== undefined ? Math.max(1, Math.min(cMax0, i.cardioCap)) : cMax0;
  const cMin = Math.min(cMin0, cMax);
  return {
    kcal,
    proteinG,
    cardioMin: { min: cMin, max: cMax, def: Math.min(cMax, Math.max(cMin, CARDIO_MINUTES[c.phase])) },
    block: i.block,
    trainingDays: [...i.trainingDays],
    choices: i.choices,
    weightKg: c.startWeightKg,
    heightCm: i.heightCm,
    sex: i.sex,
    ...(i.cardioCap !== undefined ? { cardioCap: i.cardioCap } : {}),
    ...(i.tms?.length ? { tms: i.tms } : {}),
    ...(i.loads?.length ? { loads: i.loads } : {}),
    ...(i.unit ? { unit: i.unit } : {}),
    ...(i.strengthMin !== undefined ? { strengthMin: i.strengthMin } : {}),
  };
}

/** Fat at the calculator's floor, carbs from what's left (never below 0). */
export function macrosFor(kcal: number, proteinG: number, weightKg: number, heightCm: number | null): { calories: number; proteinG: number; fatG: number; carbsG: number } {
  const ref = heightCm ? referenceWeightKg(weightKg, heightCm) : weightKg;
  const fatG = Math.round(Math.max((kcal * SAFETY.minFatPct) / 9, ref * SAFETY.minFatGPerKg));
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  return { calories: kcal, proteinG, fatG, carbsG };
}

const SLOTS = ['A1', 'A2', 'B'] as const;

function menuText(r: LeverRanges, name: (id: string) => string): string {
  const lines: string[] = [];
  for (const day of [1, 2, 3, 4] as const) {
    for (const slot of SLOTS) {
      const m = menuSlot(day, slot, r.block);
      const now = exerciseFor(day, slot, r.block, r.choices as Record<string, ExerciseId>);
      const opts = [m.pick, ...m.swaps].map((id) => `${id} (${name(id)})${id === now ? ' [current]' : ''}`).join(', ');
      lines.push(`Day ${day} ${slot}: ${opts}`);
    }
  }
  return lines.join('\n');
}

export interface PromptInput {
  event: 'reached' | 'offtrack' | 'manual';
  reason: string;
  restart: boolean;
  choice: GoalChoice;
  ranges: LeverRanges;
  window: GoalWindow;
  brief: string;
  name: (id: string) => string;
}

const PHASE_WORD = { gain: 'bulk', maintain: 'maintain', lose: 'cut' } as const;

/** The full prompt (also what "Ask Philip in Claude" copies). */
export function proposalPrompt(p: PromptInput): string {
  const r = p.ranges;
  const c = p.choice;
  const situation =
    p.event === 'reached'
      ? `The lifter just reached this cycle's goal (${p.reason}). The cycle ends now and a new one starts with the goal below.`
      : p.event === 'manual'
        ? `The lifter asked for a fresh look mid-cycle; he may be on track. ${p.restart ? 'He picked a new goal (below), so the cycle restarts with it.' : 'He keeps the current goal (below); the cycle continues and the levers change now.'} Change only what his data supports. "Keep everything as it is, it is working" is a valid answer: still return every lever, inside its range, at today's value.`
        : `The lifter is off track this cycle (${p.reason}).${p.restart ? ' He chose to restart the cycle with the goal below.' : ' The cycle continues; nutrition and the listed training levers change now.'}`;
  const weeks = p.choice.weeks ?? 4;
  const lengthText = p.choice.deadline ? `by ${p.choice.deadline} (${weeks} weeks)` : `in ${weeks} weeks`;
  const dayCount = r.trainingDays.length;
  return [
    "You are Philip, the lifter's coach. Short, warm, persuasive, never scolding, no emoji, no comments on body or looks.",
    'Decide his plan for this goal from HIS data below. Pick a value for every numeric lever inside its range and give one short reason tied to the data.',
    '',
    situation,
    `New goal: ${PHASE_WORD[c.phase]}, ${c.startWeightKg} kg -> ${c.endWeightKg} kg ${lengthText} (${c.weeklyRatePct}% of body weight a week)${c.bfLinePct !== null ? `, body fat line ${c.bfLinePct}%` : ''}.`,
    '',
    'What happened over the goal window:',
    windowText(p.window),
    '',
    'Levers and allowed ranges (the app caps anything outside them):',
    r.kcal ? `- kcal: ${r.kcal.min}-${r.kcal.max} a day (formula ${r.kcal.def}).` : '- kcal: not available (body stats missing); return null.',
    r.proteinG ? `- proteinG: ${r.proteinG.min}-${r.proteinG.max} g a day (${PROPOSAL_RULES.proteinPerKg[c.phase].join('-')} g/kg for this phase; formula ${r.proteinG.def}).` : '- proteinG: not available; return null.',
    `- cardioMin: ${r.cardioMin.min}-${r.cardioMin.max} minutes of incline walk after each session (default ${r.cardioMin.def}; outside the ${r.strengthMin ?? 60}-minute lifting budget, and he will not walk more than ${r.cardioCap ?? r.cardioMin.max}).`,
    `- days: exactly ${dayCount} training weekdays, 1 = Monday ... 7 = Sunday (now ${r.trainingDays.join(', ')}). Null to keep.`,
    '- swaps: optional, at most 3, each one of the options for that slot below. Use them to aim training at his goals and his notes (e.g. a weak spot). Empty list to keep.',
    menuText(r, p.name),
    ...(r.tms?.length
      ? [
          '- tms: optional training-max changes; every main-lift working weight is a % of it. Each within 10% of now; only when the logs support it (key sets hit easily or missed). Now: ' +
            r.tms.map((x) => `${x.lift} ${x.kg} kg`).join(', ') +
            '.',
        ]
      : []),
    ...(r.loads?.length
      ? [
          '- loads: optional next weights for accessories (dumbbells per hand), each within 20% of the last weight; only when the logs support it. Last: ' +
            r.loads.map((x) => `${x.exerciseId} (${p.name(x.exerciseId)}) ${x.kg} kg`).join(', ') +
            '.',
        ]
      : []),
    '',
    'Food: fat stays on the safety floor and carbs fill the rest. The app splits the day by training: more carbs on training days, fewer on rest days, same weekly calories and protein. Give kcal as the daily average.',
    '',
    REMEMBER_RULE,
    '',
    'Reply with JSON only, this shape:',
    '{"message": "2-4 sentences for him: what you saw and what you are changing", "kcal": {"value": 2900, "why": "..."}, "proteinG": {"value": 150, "why": "..."}, "cardioMin": {"value": 20, "why": "..."}, "days": {"value": [1,2,4,5], "why": "..."} or null, "swaps": [{"day": 2, "slot": "A1", "exerciseId": "...", "why": "..."}], "tms": [{"lift": "bench", "kg": 92.5, "why": "..."}], "loads": [{"exerciseId": "...", "kg": 22.5, "why": "..."}], "remember": []}',
    '',
    'His history (the brief):',
    p.brief,
  ].join('\n');
}

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu;
const clean = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(EMOJI, '').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const numOf = (v: unknown): number | null => {
  const x = isObj(v) ? v.value : v;
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
};
const whyOf = (v: unknown): string => (isObj(v) ? clean(v.why, PROPOSAL_RULES.whyMax) : '');

export class ProposalError extends Error {
  constructor(public readonly code: 'notJson' | 'missing') {
    super(code);
    this.name = 'ProposalError';
  }
}

/**
 * Validates Philip's reply. A missing message or a missing numeric lever (when it has a range) is a
 * bad reply (thrown, so the caller can retry or offer Claude): the plan is never filled with defaults.
 */
export function parseProposal(raw: unknown, r: LeverRanges, source: GoalProposalRecord['source'], at: number): GoalProposalRecord {
  if (!isObj(raw)) throw new ProposalError('notJson');
  const message = clean(raw.message, PROPOSAL_RULES.messageMax);
  if (!message) throw new ProposalError('missing');
  const clamps: GoalProposalRecord['clamps'] = [];
  const pick = (lever: 'kcal' | 'proteinG' | 'cardioMin', range: Range | null, step: number): number | null => {
    if (!range) return null;
    const asked = numOf(raw[lever]);
    if (asked === null) throw new ProposalError('missing');
    const used = Math.round(Math.min(range.max, Math.max(range.min, asked)) / step) * step;
    if (Math.abs(used - asked) >= step / 2) clamps.push({ lever, asked, used });
    return used;
  };
  const kcal = pick('kcal', r.kcal, 10);
  const proteinG = pick('proteinG', r.proteinG, 1);
  const cardioMin = pick('cardioMin', r.cardioMin, 1);

  let days: IsoWeekday[] | null = null;
  const dRaw = isObj(raw.days) ? raw.days.value : raw.days;
  if (Array.isArray(dRaw)) {
    const ds = [...new Set(dRaw.filter((d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b);
    if (ds.length === r.trainingDays.length && ds.join() !== [...r.trainingDays].sort((a, b) => a - b).join()) days = ds as IsoWeekday[];
  }
  const swaps: GoalPlanItems['swaps'] = [];
  const swapWhy: string[] = [];
  if (Array.isArray(raw.swaps)) {
    for (const s of raw.swaps) {
      if (!isObj(s) || swaps.length >= 3) continue;
      const day = s.day;
      const slot = s.slot;
      if (typeof day !== 'number' || ![1, 2, 3, 4].includes(day) || (slot !== 'A1' && slot !== 'A2' && slot !== 'B')) continue;
      const m = menuSlot(day as Day, slot, r.block);
      const id = s.exerciseId;
      if (typeof id !== 'string' || ![m.pick, ...m.swaps].includes(id as ExerciseId)) continue;
      if (exerciseFor(day as Day, slot, r.block, r.choices as Record<string, ExerciseId>) === id) continue;
      if (swaps.some((x) => x.day === day && x.slot === slot)) continue;
      swaps.push({ day: day as Day, slot, exerciseId: id });
      const w = clean(s.why, PROPOSAL_RULES.whyMax);
      if (w) swapWhy.push(w);
    }
  }
  // 0.12.3: lift weights. Clamped to the report's bounds, rounded to what can be loaded; unchanged ones dropped.
  const tms: NonNullable<GoalPlanItems['tms']> = [];
  const loads: NonNullable<GoalPlanItems['loads']> = [];
  const tmWhy: Record<string, string> = {};
  const loadWhy: Record<string, string> = {};
  if (Array.isArray(raw.tms) && r.tms) {
    for (const x of raw.tms) {
      if (!isObj(x)) continue;
      const cur = r.tms.find((t) => t.lift === x.lift);
      const kg = numOf(x.kg);
      if (!cur || kg === null || tms.some((t) => t.lift === cur.lift)) continue;
      const toKg = roundTo(Math.min(cur.kg * (1 + PROPOSAL_RULES.tmPct), Math.max(cur.kg * (1 - PROPOSAL_RULES.tmPct), kg)), 0.5);
      if (toKg === cur.kg) continue;
      tms.push({ lift: cur.lift, fromKg: cur.kg, toKg });
      tmWhy[cur.lift] = clean(x.why, PROPOSAL_RULES.whyMax);
    }
  }
  if (Array.isArray(raw.loads) && r.loads) {
    for (const x of raw.loads) {
      if (!isObj(x)) continue;
      const cur = r.loads.find((l) => l.exerciseId === x.exerciseId);
      const kg = numOf(x.kg);
      if (!cur || kg === null || cur.kg <= 0 || loads.some((l) => l.exerciseId === cur.exerciseId)) continue;
      const toKg = Math.max(0, roundToStep(Math.min(cur.kg * (1 + PROPOSAL_RULES.loadPct), Math.max(cur.kg * (1 - PROPOSAL_RULES.loadPct), kg)), r.unit ?? 'kg'));
      if (toKg === cur.kg || toKg <= 0) continue;
      loads.push({ exerciseId: cur.exerciseId, fromKg: cur.kg, toKg });
      loadWhy[cur.exerciseId] = clean(x.why, PROPOSAL_RULES.whyMax);
    }
  }

  const why: GoalProposalRecord['why'] = {};
  if (tms.length) why.tms = tmWhy;
  if (loads.length) why.loads = loadWhy;
  if (kcal !== null) why.kcal = whyOf(raw.kcal);
  if (proteinG !== null) why.proteinG = whyOf(raw.proteinG);
  if (cardioMin !== null) why.cardioMin = whyOf(raw.cardioMin);
  if (days) why.days = whyOf(raw.days);
  if (swapWhy.length) why.swaps = swapWhy.join(' ');
  return { message, kcal, proteinG, cardioMin, days, swaps, ...(tms.length ? { tms } : {}), ...(loads.length ? { loads } : {}), why, clamps, remember: parseRemember(raw), source, at };
}
