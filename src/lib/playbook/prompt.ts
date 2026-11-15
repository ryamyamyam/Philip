/**
 * PB-0: what every coaching prompt carries (Story 16). Kept out of rules.ts so the first screen doesn't
 * load prompt text.
 */
import { KCAL_PER_KG, PB_FAT, PB_GUARD, PB_LOADS, PB_PHASE, PB_PROTEIN, PB_RATE } from './rules';

/** The label every answer from outside the playbook must start with (PB-0.3). */
export const OUTSIDE_PREFIX = 'Outside my core playbook:';

/** PB-0.3: advice from outside the playbook carries the label (added when Philip forgot it). */
export function labelOutside(message: string, raw: unknown): string {
  const flagged = typeof raw === 'object' && raw !== null && (raw as Record<string, unknown>).outside === true;
  if (!flagged || message.trimStart().toLowerCase().startsWith(OUTSIDE_PREFIX.toLowerCase())) return message;
  return `${OUTSIDE_PREFIX} ${message}`;
}

/** PB-0: the compact summary every coaching prompt carries (IDs + one line each; keep it short). */
export const PLAYBOOK_PROMPT = [
  "Philip's Playbook (your core rules; the app's code computes every number from them):",
  `PB-1.1 cut recommended at BF >= ${PB_PHASE.cutAtBf.male}% (men) / ${PB_PHASE.cutAtBf.female}% (women); below it any phase is fine. PB-1.4 a bulk above the line: suggest a ${PB_PHASE.miniCutWeeks[0]}-${PB_PHASE.miniCutWeeks[1]} week mini-cut first, his choice.`,
  `PB-2.3 kcal from the weekly rate: rate% x kg x ${KCAL_PER_KG} / 7. Cut ${PB_RATE.cut.max} to ${PB_RATE.cut.min}%/wk (to ${PB_RATE.cutHighBf.min}% above ${PB_RATE.highBf}% BF). Bulk by training age: <1 yr +${PB_RATE.bulk.lt1.min}-${PB_RATE.bulk.lt1.max}%, 1-3 yrs +${PB_RATE.bulk['1to3'].min}-${PB_RATE.bulk['1to3'].max}%, >3 yrs +${PB_RATE.bulk.gt3.min}-${PB_RATE.bulk.gt3.max}%.`,
  `PB-3.1 protein bulk ${PB_PROTEIN.gain.min}-${PB_PROTEIN.gain.max} g/kg, cut ${PB_PROTEIN.lose.min}-${PB_PROTEIN.lose.max} g/kg. PB-3.2 fat never below max(${PB_FAT.floorGPerKg} g/kg, ${PB_FAT.floorPct * 100}% kcal). PB-3.4 carb cycling: gym days carbs up and fat at the floor, rest days fat ${PB_FAT.restDayGPerKg.min}-${PB_FAT.restDayGPerKg.max} g/kg and carbs down, same weekly kcal.`,
  'PB-4.4 Big 4 run the 4-week %TM wave with a deload. PB-4.5 accessories: double progression; dumbbells per hand.',
  `PB-7 guardrails: kcal floor ${PB_GUARD.calorieFloor.male} (m) / ${PB_GUARD.calorieFloor.female} (f); energy availability >= ${PB_GUARD.energyAvailabilityMin} kcal/kg lean mass; max loss ${PB_GUARD.maxLossPct}%/wk; PB-7.4 sharp, radiating or joint pain: stop that exercise and see a professional; never diagnose.`,
  `PB-8.1 e1RM = kg x (1 + (reps + RIR) / 30), only sets with reps + RIR <= ${PB_LOADS.e1rmMaxRepsPlusRir}. PB-8.4 every load is checked for plausibility by the app; adjust by RIR (too heavy = +${PB_LOADS.pushbackRir} RIR), never by a flat percent.`,
  `PB-0 hierarchy: these rules first. Any advice not from them must start with "${OUTSIDE_PREFIX}" and set "outside": true in your JSON. Never state a number the app did not give you.`,
].join('\n');
