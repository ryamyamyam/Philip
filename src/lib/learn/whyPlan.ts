/**
 * Story 14 (OBS-92D8DB): "Why this plan". Pure, tested.
 *
 * Builds the explanation of the owner's plan from the same constants the engine uses (never copies of
 * the numbers), so the lesson can't drift from what the app does. Each rule carries an evidence label
 * (`Basis`) and, when research-backed, its sources from `SOURCES` only. The rule → label → source table is
 * in docs/stories/STORY_14.md for the owner to audit.
 */
import type { Basis } from '../../db/types';
import { tl, type LearnKey } from '../../i18n/learn';
import { CARB_DAY_RULES, PROTEIN_PER_KG } from '../goal/carbDays';
import { PROPOSAL_RULES } from '../goal/proposal';
import { SAFETY } from '../targets';
import { CARDIO_MINUTES } from '../training/cardio';
import { CUT_AT_BF, LEAN_BULK_MAX_BF, RATE_PCT } from '../training/cycleGoal';
import { PB_FAT } from '../playbook/rules';
import { accessoryRules, DAY_LIFT, TM_INCREMENT_KG, TM_SHARE, type Phase } from '../training/program';
import { PHASE_ACCESSORY, SESSION_BUDGET_MIN } from '../training/session';

/**
 * The only studies "Why this plan" cites. Each is a meta-analysis, systematic review, position stand or
 * evidence review; check a rule matches what the source supports before labelling it research.
 */
export const SOURCES = {
  schoenfeld2017volume: 'Schoenfeld, Ogborn & Krieger, 2017, Journal of Sports Sciences (meta-analysis: weekly sets and muscle growth)',
  schoenfeld2017load: 'Schoenfeld et al., 2017, Journal of Strength and Conditioning Research (meta-analysis: light vs heavy loads)',
  morton2018: 'Morton et al., 2018, British Journal of Sports Medicine (meta-analysis: protein and muscle gain)',
  helms2014: 'Helms, Aragon & Fitschen, 2014, Journal of the International Society of Sports Nutrition (review: nutrition while dieting)',
  helms2015: 'Helms et al., 2015, Journal of Sports Medicine and Physical Fitness (review: training while dieting)',
  garthe2011: 'Garthe et al., 2011, International Journal of Sport Nutrition and Exercise Metabolism (trial: slow vs fast weight loss)',
  williams2017: 'Williams et al., 2017, Sports Medicine (meta-analysis: periodized vs non-periodized training)',
  wilson2012: 'Wilson et al., 2012, Journal of Strength and Conditioning Research (meta-analysis: cardio alongside lifting)',
  acsm2009: 'American College of Sports Medicine, 2009, Medicine & Science in Sports & Exercise (position stand: progression in resistance training)',
} as const;
export type SourceId = keyof typeof SOURCES;

export interface Rule {
  id: string;
  title: string;
  /** Phase rows: the cut and bulk versions, or one line when both are the same. */
  cut?: string;
  bulk?: string;
  both?: string;
  text?: string;
  why?: string;
  basis: Basis;
  sources: SourceId[];
}

export interface WhyPlanInput {
  phase: Phase;
  /** Training days a week (3–5). */
  days: number;
  /** Lifting minutes per session (Your time; default SESSION_BUDGET_MIN). */
  strengthMin?: number | null;
  sex?: 'male' | 'female' | null;
}

export interface WhyPlan {
  phase: Phase;
  intro: string;
  compare: Rule[];
  week: Rule[];
  adjust: Rule[];
}

const pct = (x: number) => String(Math.round(x * 100 * 100) / 100);
const n = (x: number) => String(Math.round(x * 100) / 100);
const r = (id: string, basis: Basis, sources: SourceId[], parts: Omit<Rule, 'id' | 'basis' | 'sources'>): Rule => ({ id, basis, sources, ...parts });
const k = (key: string) => key as LearnKey;

export function whyPlan(i: WhyPlanInput): WhyPlan {
  const lose = RATE_PCT.lose;
  const gain = RATE_PCT.gain;
  const base = accessoryRules('A', 1).sets;
  const [cMin, cMax] = PROPOSAL_RULES.cardioMin.lose;
  const [bMin, bMax] = PROPOSAL_RULES.cardioMin.gain;
  const phaseRow = (id: string, basis: Basis, sources: SourceId[], vars: { cut?: Record<string, string | number>; bulk?: Record<string, string | number>; both?: Record<string, string | number>; why?: Record<string, string | number> } = {}): Rule =>
    r(id, basis, sources, {
      title: tl(k(`learn.row.${id}.title`)),
      ...(vars.both ? { both: tl(k(`learn.row.${id}.both`), vars.both) } : { cut: tl(k(`learn.row.${id}.cut`), vars.cut), bulk: tl(k(`learn.row.${id}.bulk`), vars.bulk) }),
      why: tl(k(`learn.row.${id}.why`), vars.why),
    });

  const compare: Rule[] = [
    // Slow loss keeps lean mass (Garthe 2011; Helms 2014 recommend 0.5–1%/wk). The bulk range is practice.
    phaseRow('pace', 'research', ['garthe2011', 'helms2014'], {
      cut: { min: n(-lose.max), max: n(-lose.min), def: n(-lose.def) },
      bulk: { min: n(gain.min), max: n(gain.max), def: n(gain.def) },
    }),
    phaseRow('protein', 'research', ['morton2018', 'helms2014'], {
      cut: { min: PROTEIN_PER_KG.lose[0], max: PROTEIN_PER_KG.lose[1] },
      bulk: { min: PROTEIN_PER_KG.gain[0], max: PROTEIN_PER_KG.gain[1] },
    }),
    phaseRow('carbs', 'default', [], { why: { pct: pct(SAFETY.minFatPct), gkg: SAFETY.minFatGPerKg } }),
    phaseRow('carbDays', 'practice', [], { both: { pct: pct(CARB_DAY_RULES.restCarbDown), restFat: PB_FAT.restDayGPerKg.def } }),
    // Keep the load on a cut (Helms 2015); a wide range of loads builds muscle when sets are hard (Schoenfeld 2017).
    phaseRow('main', 'research', ['helms2015', 'schoenfeld2017load'], { both: {} }),
    // More weekly sets → more growth up to a point (Schoenfeld 2017). The one-set step is Philip's number.
    phaseRow('acc', 'research', ['schoenfeld2017volume'], { cut: { cutB: PHASE_ACCESSORY.cutSlotBSets, base }, bulk: { bulkA: base + PHASE_ACCESSORY.bulkExtraSets, base } }),
    phaseRow('tm', 'practice', [], {
      cut: { cutU: TM_INCREMENT_KG.lose.upper, cutL: TM_INCREMENT_KG.lose.lower },
      bulk: { bulkU: TM_INCREMENT_KG.gain.upper, bulkL: TM_INCREMENT_KG.gain.lower },
    }),
    phaseRow('cardio', 'practice', [], {
      cut: { def: CARDIO_MINUTES.lose, min: cMin, max: cMax },
      bulk: { def: CARDIO_MINUTES.gain, min: bMin, max: bMax },
    }),
    phaseRow('phasePick', 'default', [], { both: { cutAt: CUT_AT_BF, leanMax: LEAN_BULK_MAX_BF } }),
  ];

  const sessions = Object.keys(DAY_LIFT).length * 4;
  const week: Rule[] = [
    r('split', 'default', [], { title: tl('learn.week.split.title', { days: i.days }), text: tl('learn.week.split.text', { sessions }) }),
    r('wave', 'research', ['williams2017'], { title: tl('learn.week.wave.title'), text: tl('learn.week.wave.text') }),
    r('deload', 'practice', [], { title: tl('learn.week.deload.title'), text: tl('learn.week.deload.text', { tm: pct(TM_SHARE) }) }),
    r('overload', 'research', ['acsm2009'], { title: tl('learn.week.overload.title'), text: tl('learn.week.overload.text') }),
    r('budget', 'default', [], { title: tl('learn.week.budget.title', { min: i.strengthMin ?? SESSION_BUDGET_MIN }), text: tl('learn.week.budget.text') }),
    r('cardioAfter', 'research', ['wilson2012'], { title: tl('learn.week.cardioAfter.title'), text: tl('learn.week.cardioAfter.text') }),
  ];

  const adjust: Rule[] = [
    r('avg', 'practice', [], { title: tl('learn.adjust.avg.title'), text: tl('learn.adjust.avg.text') }),
    r('maint', 'practice', [], { title: tl('learn.adjust.maint.title'), text: tl('learn.adjust.maint.text') }),
    r('safety', 'default', [], {
      title: tl('learn.adjust.safety.title'),
      text: tl('learn.adjust.safety.text', { floor: SAFETY.calorieFloor[i.sex ?? 'male'], loss: pct(SAFETY.maxLossPctPerWeek), gain: pct(SAFETY.maxGainPctPerWeek) }),
    }),
    r('yes', 'default', [], { title: tl('learn.adjust.yes.title'), text: tl('learn.adjust.yes.text') }),
  ];

  const intro = i.phase === 'maintain' ? tl('learn.youAreMaintain') : tl('learn.youAre', { phase: tl(i.phase === 'lose' ? 'learn.cut' : 'learn.bulk').toLowerCase() });
  return { phase: i.phase, intro, compare, week, adjust };
}
