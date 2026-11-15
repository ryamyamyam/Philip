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
import type { Basis, GoalChoice, GoalPlanItems, GoalProposalRecord, IsoWeekday, Sex } from '../../db/types';
import { CARDIO_MINUTES } from '../training/cardio';
import { exerciseFor, menuSlot, type ExerciseId } from '../training/exercises';
import { roundTo, type Block, type Day, type LiftId } from '../training/program';
import { roundToStep } from '../training/plates';
import { parseRemember, REMEMBER_RULE } from '../coach/memory';
import type { GoalWindow } from './window';
import { PROTEIN_PER_KG } from './carbDays';
import { fatRange, kcalForRate, UPDATE_RULES, updateKcalRange, type UpdateFrame } from './update';
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
  loads?: { exerciseId: string; kg: number; reps?: number | null; sets?: number | null }[];
  /** Story 15: an Update goals request (cycle kept): kcal from the safe pace, fat, 3–5 days, reps/sets. */
  update?: UpdateFrame;
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
  loads?: { exerciseId: string; kg: number; reps?: number | null; sets?: number | null }[];
  unit?: 'kg' | 'lb';
  update?: UpdateFrame;
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
  // Story 15: an Update goals request draws kcal from the phase's safe weekly pace around maintenance.
  if (i.update) kcal = updateKcalRange(i.update, i.sex);
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
    ...(i.update ? { update: i.update } : {}),
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

/**
 * Story 14 (OBS-92D8DB): Philip teaches while he plans, and is honest about what is science and what is
 * his judgment. Shared with Ask Philip's prompt.
 */
export const TEACH_RULE =
  'Teach while you plan: each "why" says what the change does for him in plain words. Each lever also gets "basis": "research" when a meta-analysis, systematic review or position stand supports that direction, "practice" when it is common coaching practice consistent with the evidence but the exact number is untested, "default" when it is simply the app\'s or your own starting number. Never invent a study, statistic or citation; if you are unsure, say "practice".';

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
  const u = r.update;
  if (u) return updatePrompt(p, u);
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
    TEACH_RULE,
    '',
    'Reply with JSON only, this shape:',
    '{"message": "2-4 sentences for him: what you saw, what you are changing and why it works", "kcal": {"value": 2900, "why": "...", "basis": "practice"}, "proteinG": {"value": 150, "why": "...", "basis": "research"}, "cardioMin": {"value": 20, "why": "...", "basis": "default"}, "days": {"value": [1,2,4,5], "why": "...", "basis": "practice"} or null, "swaps": [{"day": 2, "slot": "A1", "exerciseId": "...", "why": "..."}], "tms": [{"lift": "bench", "kg": 92.5, "why": "..."}], "loads": [{"exerciseId": "...", "kg": 22.5, "why": "..."}], "remember": []}',
    '',
    'His history (the brief):',
    p.brief,
  ].join('\n');
}

/** Story 15: the Update goals prompt. Same data and rules; kcal sets the date; fat, 3–5 days and reps/sets are levers. */
function updatePrompt(p: PromptInput, u: UpdateFrame): string {
  const r = p.ranges;
  const c = p.choice;
  const k = r.kcal;
  const fat = k ? fatRange(k.def, r.weightKg, r.heightCm) : null;
  const rate = RATE_PCT_TEXT[c.phase];
  return [
    "You are Philip, the lifter's coach. Short, warm, persuasive, never scolding, no emoji, no comments on body or looks. You plan and you teach.",
    'He updated his goals. Build his plan from HIS data below: a value for every numeric lever inside its range, one short reason each tied to the data.',
    '',
    `Now: ${u.nowKg} kg${c.startBfPct !== null ? `, ${c.startBfPct}% body fat` : ''}. Target: ${u.endKg} kg${c.bfLinePct !== null ? `, ${c.bfLinePct}% body fat` : ''}. Phase: ${PHASE_WORD[c.phase]}. The current cycle keeps going (no restart): food changes today, training from his next session.`,
    `Maintenance: about ${u.maintenanceKcal} kcal a day (${u.maintenanceSource === 'measured' ? 'measured from his food log and weight trend' : "the calculator's estimate; his log isn't complete enough to measure it"}).`,
    '',
    'What happened since this cycle started:',
    windowText(p.window),
    '',
    'Levers and allowed ranges (the app caps anything outside them):',
    k
      ? `- kcal: ${k.min}-${k.max} a day (${rate}; default ${k.def}). The app estimates the goal date from this: every 7,700 kcal of gap from maintenance is about 1 kg. For example ${kcalForRate(u, c.phase === 'lose' ? -0.5 : 0.25)} kcal is the slow end.`
      : '- kcal: not available (body stats missing); return null.',
    r.proteinG ? `- proteinG: ${r.proteinG.min}-${r.proteinG.max} g a day (${PROPOSAL_RULES.proteinPerKg[c.phase].join('-')} g/kg for this phase; default ${r.proteinG.def}).` : '- proteinG: not available; return null.',
    fat ? `- fatG: at least the safety floor (${SAFETY.minFatPct * 100}% of kcal and ${SAFETY.minFatGPerKg} g/kg; ${fat.min} g at ${k?.def} kcal), at most ${UPDATE_RULES.fatMaxPct * 100}% of kcal. Carbs fill the rest. The app shows P/F/C as %.` : '- fatG: return null.',
    '- carbDays: true = extra carbs on gym days and fewer on rest days (same weekly calories and protein), false = the same every day. His gym days are the training days.',
    `- cardioMin: ${r.cardioMin.min}-${r.cardioMin.max} minutes of incline walk after each session (default ${r.cardioMin.def}; he will not walk more than ${r.cardioCap ?? r.cardioMin.max}).`,
    `- days: ${UPDATE_RULES.days[0]}-${UPDATE_RULES.days[1]} training weekdays, 1 = Monday ... 7 = Sunday (now ${r.trainingDays.join(', ')}, ${r.trainingDays.length} a week). The 4-lift rotation stays; more days finish a cycle sooner. Null to keep.`,
    '- swaps: optional, at most 3, each one of the options for that slot below. Empty list to keep.',
    menuText(r, p.name),
    ...(r.tms?.length
      ? ['- tms: optional training-max changes (main-lift weights follow; their sets and reps follow the wave). Each within 10% of now; only when the logs support it. Now: ' + r.tms.map((x) => `${x.lift} ${x.kg} kg`).join(', ') + '.']
      : []),
    ...(r.loads?.length
      ? [
          `- loads: optional next orders for accessories: kg (dumbbells per hand, within 20% of the last weight), and optionally sets (${UPDATE_RULES.sets[0]}-${UPDATE_RULES.sets[1]}) and reps (${UPDATE_RULES.reps[0]}-${UPDATE_RULES.reps[1]}). Only when the logs or the goal support it. Last: ` +
            r.loads.map((x) => `${x.exerciseId} (${p.name(x.exerciseId)}) ${x.kg} kg${x.sets ? ` ${x.sets} sets` : ''}${x.reps ? ` x ${x.reps}` : ''}`).join(', ') +
            '.',
        ]
      : []),
    '',
    REMEMBER_RULE,
    '',
    TEACH_RULE,
    '',
    'Reply with JSON only, this shape:',
    '{"message": "2-4 sentences for him: what you saw, what you are changing, when he gets there and why it works", "kcal": {"value": 2900, "why": "...", "basis": "practice"}, "proteinG": {"value": 150, "why": "...", "basis": "research"}, "fatG": {"value": 80, "why": "..."}, "carbDays": {"value": true, "why": "..."}, "cardioMin": {"value": 20, "why": "...", "basis": "default"}, "days": {"value": [1,2,4,5], "why": "...", "basis": "practice"} or null, "swaps": [], "tms": [{"lift": "bench", "kg": 92.5, "why": "..."}], "loads": [{"exerciseId": "...", "kg": 22.5, "sets": 3, "reps": 12, "why": "..."}], "remember": []}',
    '',
    'His history (the brief):',
    p.brief,
  ].join('\n');
}

const RATE_PCT_TEXT = { gain: 'a lean gain of 0.25-0.5% of body weight a week', lose: 'a loss of 0.5-1% of body weight a week', maintain: 'within 100 kcal of maintenance' } as const;

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu;
const clean = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(EMOJI, '').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const numOf = (v: unknown): number | null => {
  const x = isObj(v) ? v.value : v;
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
};
const whyOf = (v: unknown): string => (isObj(v) ? clean(v.why, PROPOSAL_RULES.whyMax) : '');
const BASES: readonly Basis[] = ['research', 'practice', 'default'];
export const basisOf = (v: unknown): Basis => (isObj(v) && typeof v.basis === 'string' && (BASES as readonly string[]).includes(v.basis) ? (v.basis as Basis) : 'practice');

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
  // Story 15: fat (Update goals), inside the floor and the cap for the chosen calories; carbs fill the rest.
  let fatG: number | null = null;
  if (r.update && kcal !== null) {
    const fr = fatRange(kcal, r.weightKg, r.heightCm);
    const asked = numOf(raw.fatG);
    fatG = asked === null ? fr.min : Math.round(Math.min(fr.max, Math.max(fr.min, asked)));
    if (asked !== null && Math.abs(fatG - asked) >= 1) clamps.push({ lever: 'fatG', asked, used: fatG });
  }
  const cdRaw = isObj(raw.carbDays) ? raw.carbDays.value : raw.carbDays;
  const carbDays = r.update && typeof cdRaw === 'boolean' ? cdRaw : null;

  let days: IsoWeekday[] | null = null;
  const dRaw = isObj(raw.days) ? raw.days.value : raw.days;
  if (Array.isArray(dRaw)) {
    const ds = [...new Set(dRaw.filter((d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b);
    // Story 15: an Update goals plan may set 3–5 days; other plans keep the count.
    const countOk = r.update ? ds.length >= UPDATE_RULES.days[0] && ds.length <= UPDATE_RULES.days[1] : ds.length === r.trainingDays.length;
    if (countOk && ds.join() !== [...r.trainingDays].sort((a, b) => a - b).join()) days = ds as IsoWeekday[];
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
      // The same weight stays exactly as it is (rounding it to the plate step would look like a change).
      const toKg = Math.abs(kg - cur.kg) < 0.01 ? cur.kg : Math.max(0, roundToStep(Math.min(cur.kg * (1 + PROPOSAL_RULES.loadPct), Math.max(cur.kg * (1 - PROPOSAL_RULES.loadPct), kg)), r.unit ?? 'kg'));
      if (toKg <= 0) continue;
      // Story 15: sets and reps too (Update goals only), clamped; unchanged ones dropped.
      const int = (v: unknown, [lo, hi]: readonly [number, number]) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v))) : null);
      const sets = r.update ? int(x.sets, UPDATE_RULES.sets) : null;
      const reps = r.update ? int(x.reps, UPDATE_RULES.reps) : null;
      const newSets = sets !== null && sets !== (cur.sets ?? null) ? sets : null;
      const newReps = reps !== null && reps !== (cur.reps ?? null) ? reps : null;
      if (toKg === cur.kg && newSets === null && newReps === null) continue;
      loads.push({ exerciseId: cur.exerciseId, fromKg: cur.kg, toKg, ...(newSets !== null || newReps !== null ? { sets: newSets, reps: newReps, fromSets: cur.sets ?? null, fromReps: cur.reps ?? null } : {}) });
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
  if (fatG !== null && whyOf(raw.fatG)) why.fatG = whyOf(raw.fatG);
  if (carbDays !== null && whyOf(raw.carbDays)) why.carbDays = whyOf(raw.carbDays);
  // Story 14: an evidence label per lever. Missing or unknown = "practice"; never a reason to reject a plan.
  const basis: NonNullable<GoalProposalRecord['basis']> = {};
  if (kcal !== null) basis.kcal = basisOf(raw.kcal);
  if (proteinG !== null) basis.proteinG = basisOf(raw.proteinG);
  if (cardioMin !== null) basis.cardioMin = basisOf(raw.cardioMin);
  if (days) basis.days = basisOf(raw.days);
  return { message, kcal, proteinG, cardioMin, days, swaps, ...(r.update ? { fatG, carbDays } : {}), ...(tms.length ? { tms } : {}), ...(loads.length ? { loads } : {}), why, basis, clamps, remember: parseRemember(raw), source, at };
}
