/**
 * Story 16 §3.2: today's plan follows the playbook. Pure, tested.
 *
 * On the first launch of 0.16.1 the CURRENT target plan is re-checked under Philip's Playbook — same
 * goal, same phase, the fewest changes that make it follow the rules:
 * - PB-2.3 the calories' weekly pace must sit in the phase's band for his training age (and BF): if it
 *   doesn't, it moves to the nearest edge (kcal = maintenance + rate × kg × 7,700 ÷ 7);
 * - PB-3.1 protein into its band (cut 2.0–2.4, bulk 1.6–2.0 g/kg; LBM above 25% BF on a cut);
 * - PB-3.2 fat up to its floor max(0.6 g/kg, 20%) when it's under;
 * - PB-3.3 carbs fill the rest; PB-3.4 the gym-day / rest-day split is re-solved;
 * - PB-7.1 never under the calorie floor.
 * PB-1.1: if his BF now says "cut" while he's on another phase, that is only a suggestion; the phase
 * never changes automatically. Manual plans (his own typed numbers) are left alone.
 */
import type { IsoWeekday, Macros, Sex, TargetPlan, Weekday, YMD } from '../../db/types';
import { carbDays } from '../goal/carbDays';
import { leanMassKg, referenceWeightKg } from '../targets';
import { cutLine, fatFloorG, kcalForRatePct, KCAL_PER_KG, PB_GUARD, PB_PROTEIN, ratePctFor, type PbPhase } from './rules';

export type PlanField = 'calories' | 'proteinG' | 'fatG' | 'carbsG';

export interface PlanChangeLine {
  field: PlanField;
  before: number;
  after: number;
  pbIds: string[];
}

export interface SplitLine {
  gym: Macros;
  rest: Macros;
}

export interface PlaybookReplan {
  /** The new plan row to add (effective today), or null when nothing changes. */
  plan: Omit<TargetPlan, 'id'> | null;
  changes: PlanChangeLine[];
  splitBefore: SplitLine | null;
  splitAfter: SplitLine | null;
  /** The split was re-solved (PB-3.4). */
  splitChanged: boolean;
  /** PB-1.1: BF says a cut while he's on another phase (suggestion only). */
  suggestCut: boolean;
  /** The plan is his own numbers (manual): nothing recomputed. */
  manual: boolean;
}

export interface ReplanInput {
  plan: TargetPlan;
  today: YMD;
  now: number;
  sex: Sex | null;
  weightKg: number | null;
  heightCm: number | null;
  bodyFatPct: number | null;
  trainingYears: number | null;
  /** Maintenance kcal (calculator TDEE), or null when body stats are missing (calories then stay). */
  maintenanceKcal: number | null;
  trainingDays: readonly IsoWeekday[];
  /** Carb days switch (absent = on). */
  carbOn: boolean;
}

const r10 = (n: number) => Math.round(n / 10) * 10;
const sameMacros = (a: Macros, b: Macros) => a.calories === b.calories && a.proteinG === b.proteinG && a.fatG === b.fatG && a.carbsG === b.carbsG;

function splitOf(overrides: Partial<Record<Weekday, Macros>> | null | undefined, days: readonly IsoWeekday[]): SplitLine | null {
  if (!overrides) return null;
  const gymDay = days[0];
  const restDay = ([1, 2, 3, 4, 5, 6, 7] as IsoWeekday[]).find((d) => !days.includes(d));
  if (gymDay === undefined || restDay === undefined) return null;
  const gym = overrides[(gymDay % 7) as Weekday];
  const rest = overrides[(restDay % 7) as Weekday];
  return gym && rest ? { gym, rest } : null;
}

const phaseOf = (p: TargetPlan): PbPhase => {
  const g = p.inputsSnapshot?.goal;
  return g === 'lose' || g === 'gain' || g === 'maintain' ? g : 'maintain';
};

export function playbookReplan(i: ReplanInput): PlaybookReplan {
  const empty: PlaybookReplan = { plan: null, changes: [], splitBefore: null, splitAfter: null, splitChanged: false, suggestCut: false, manual: false };
  const phase = phaseOf(i.plan);
  const suggestCut = phase !== 'lose' && i.bodyFatPct !== null && i.bodyFatPct >= cutLine(i.sex);
  if (i.plan.method === 'manual') return { ...empty, manual: true, suggestCut };
  const snapKg = typeof i.plan.inputsSnapshot?.weightKg === 'number' ? (i.plan.inputsSnapshot.weightKg as number) : null;
  const kg = i.weightKg ?? snapKg;
  if (kg === null || kg <= 0) return { ...empty, suggestCut };
  const ref = i.heightCm ? referenceWeightKg(kg, i.heightCm) : kg;
  const before: Macros = { calories: i.plan.calories, proteinG: i.plan.proteinG, fatG: i.plan.fatG, carbsG: i.plan.carbsG };
  const changes: PlanChangeLine[] = [];
  const floor = PB_GUARD.calorieFloor[i.sex ?? 'female'];

  // PB-2.3: the pace into its band (calories from rate × kg × 7,700 ÷ 7).
  let kcal = before.calories;
  if (i.maintenanceKcal !== null && phase !== 'maintain') {
    const band = ratePctFor(phase, { trainingYears: i.trainingYears, bfPct: i.bodyFatPct, sex: i.sex });
    const implied = (((kcal - i.maintenanceKcal) * 7) / KCAL_PER_KG / kg) * 100;
    const clamped = Math.min(band.max, Math.max(band.min, implied));
    if (Math.abs(clamped - implied) > 0.005) kcal = r10(i.maintenanceKcal + kcalForRatePct(clamped, kg));
  }
  if (kcal < floor) kcal = floor;
  if (kcal !== before.calories) changes.push({ field: 'calories', before: before.calories, after: kcal, pbIds: kcal === floor && floor !== before.calories ? ['PB-2.3', 'PB-7.1'] : ['PB-2.3'] });

  // PB-3.1: protein into its band.
  const lbm = phase === 'lose' && i.bodyFatPct !== null && i.bodyFatPct > PB_PROTEIN.lbmAboveBf;
  const pBase = lbm && i.bodyFatPct !== null ? leanMassKg(kg, i.bodyFatPct) : ref;
  const pBand = lbm ? PB_PROTEIN.loseLbm : PB_PROTEIN[phase];
  const protein = Math.round(Math.min(pBand.max * pBase, Math.max(pBand.min * pBase, before.proteinG)));
  if (protein !== before.proteinG) changes.push({ field: 'proteinG', before: before.proteinG, after: protein, pbIds: ['PB-3.1'] });

  // PB-3.2: fat never under its floor.
  const fatFloor = Math.ceil(fatFloorG(kcal, ref));
  const fat = Math.max(before.fatG, fatFloor);
  if (fat !== before.fatG) changes.push({ field: 'fatG', before: before.fatG, after: fat, pbIds: ['PB-3.2'] });

  // PB-3.3: carbs are the remainder.
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const base: Macros = { calories: kcal, proteinG: protein, fatG: fat, carbsG: carbs };
  if (changes.length && carbs !== before.carbsG) changes.push({ field: 'carbsG', before: before.carbsG, after: carbs, pbIds: ['PB-3.3'] });
  // Only when something else moved does the carb remainder count as a change: an off-by-rounding plan stays.
  const finalBase = changes.length ? base : before;

  // PB-3.4: the split, re-solved for his days so the week equals the flat plan.
  const splitBefore = splitOf(i.plan.weekdayOverrides, i.trainingDays);
  const solved = i.carbOn ? carbDays(finalBase, i.trainingDays, i.sex, ref) : null;
  const splitAfter = solved ? { gym: solved.train, rest: solved.rest } : null;
  const splitChanged = (splitBefore === null) !== (splitAfter === null) || (!!splitBefore && !!splitAfter && (!sameMacros(splitBefore.gym, splitAfter.gym) || !sameMacros(splitBefore.rest, splitAfter.rest)));

  if (!changes.length && !splitChanged) return { ...empty, splitBefore, splitAfter, suggestCut };
  const plan: Omit<TargetPlan, 'id'> = {
    effectiveFrom: i.today,
    ...finalBase,
    method: 'calculated',
    inputsSnapshot: { ...(i.plan.inputsSnapshot ?? {}), playbook: 'v1', carbDays: !!solved },
    weekdayOverrides: solved?.overrides ?? null,
    createdAt: i.now,
  };
  return { plan, changes, splitBefore, splitAfter, splitChanged, suggestCut, manual: false };
}
