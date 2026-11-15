/**
 * Story 14 (OBS-92D8DB) strings: "Why this plan" and the evidence labels. A lazy pack like goal.ts
 * (loaded with the plan screens, the goal sheet and Ask Philip), so the first screen's size budget
 * doesn't move. Same rules as en.ts: words only (no emoji), Philip's voice for his lines, plain words for
 * labels and sources. Never comment on body, weight or appearance.
 */
import type { Vars } from './index';

export const learnStrings = {
  'learn.title': 'Why this plan',
  'learn.open': 'Why this plan',
  'learn.cardLine': 'Every number in your plan has a reason. Want the lesson, with what’s science and what’s my call?',
  'learn.line': 'Here’s how I build you, and how sure I am about each part. Science where it exists, my judgment where it doesn’t, and I tell you which is which.',
  'learn.legend.title': 'How sure I am',
  'learn.legend.research': 'Research-backed: a meta-analysis, systematic review or position stand supports the direction.',
  'learn.legend.practice': 'Reasonable practice: common coaching practice that fits the evidence; the exact number isn’t tested.',
  'learn.legend.default': 'Philip’s default: a number I picked as a starting point. Many you can change.',
  'basis.research': 'Research-backed',
  'basis.practice': 'Reasonable practice',
  'basis.default': 'Philip’s default',
  'learn.source': 'Source: {cite}',

  'learn.sec.phase': 'Cut vs bulk: what changes',
  'learn.sec.week': 'Your week',
  'learn.sec.adjust': 'How I adjust',
  'learn.youAre': 'You’re on a {phase} now.',
  'learn.youAreMaintain': 'You’re maintaining now: food sits at maintenance and training is the bulk version without the extra sets.',
  'learn.cut': 'Cut',
  'learn.bulk': 'Bulk',
  'learn.both': 'Both',
  'learn.now': 'now',

  'learn.row.pace.title': 'Weekly pace',
  'learn.row.pace.cut': 'Lose {min}–{max}% of body weight a week (I start at {def}%).',
  'learn.row.pace.bulk': 'Gain {min}–{max}% a week at your training age (I start at {def}%). Newer lifters grow faster, so their band is higher (PB-2.3).',
  'learn.row.pace.why': 'Losing slower keeps more muscle and strength than losing fast. The bulk range keeps the gain mostly muscle; that range is common practice, tested less tightly.',

  'learn.row.protein.title': 'Protein',
  'learn.row.protein.cut': '{min}–{max} g per kg a day.',
  'learn.row.protein.bulk': '{min}–{max} g per kg a day.',
  'learn.row.protein.why': 'Around 1.6 g per kg is where extra protein stops adding muscle for most lifters. In a deficit, more protein protects muscle, so the cut starts higher.',

  'learn.row.carbs.title': 'Fat and carbs',
  'learn.row.carbs.cut': 'Fat sits around a quarter of calories, never under its floor; carbs take what’s left, so they get squeezed.',
  'learn.row.carbs.bulk': 'Fat sits around a quarter of calories, never under its floor; carbs take what’s left, so there are plenty.',
  'learn.row.carbs.why': 'Fat never drops under the higher of {gkg} g per kg and {pct}% of calories (PB-3.2). Carbs fuel hard training, so they get the rest.',

  'learn.row.carbDays.title': 'Training-day carbs',
  'learn.row.carbDays.both': 'Rest days: carbs down about {pct}% and fat up to about {restFat} g per kg. Training days: fat to its floor and carbs up by what the week needs. Same weekly calories and protein (PB-3.4).',
  'learn.row.carbDays.why': 'Fuelling the work you do is sound practice for training quality. With calories and protein matched, it hasn’t beaten steady eating for fat loss or muscle, so I don’t sell it as a fat-loss trick.',

  'learn.row.main.title': 'Main lifts',
  'learn.row.main.both': 'Same lifts, same waves, same % of your training max and the same reps on a cut and a bulk.',
  'learn.row.main.why': 'On a cut, hard lifting is what tells your body to keep its muscle, so I keep the main work as it is. Heavy and moderate loads both build muscle when the sets are hard.',

  'learn.row.acc.title': 'Accessory volume',
  'learn.row.acc.cut': 'The last accessory drops to {cutB} sets (from {base}).',
  'learn.row.acc.bulk': 'The paired accessories get {bulkA} sets (from {base}).',
  'learn.row.acc.why': 'More hard sets build more muscle, up to a point, so the bulk adds work where you can recover from it. Recovery is shorter on a cut, so I trim the least important slot. The one-set step is my number.',

  'learn.row.tm.title': 'Training max steps',
  'learn.row.tm.cut': 'Upper-body lifts +{cutU} kg, lower-body +{cutL} kg per cycle when the key sets are hit.',
  'learn.row.tm.bulk': 'Upper-body +{bulkU} kg, lower-body +{bulkL} kg per cycle when the key sets are hit.',
  'learn.row.tm.why': 'Strength still climbs on a cut, just slower, so the steps are smaller. The step sizes follow common percentage-based programs.',

  'learn.row.cardio.title': 'Incline walk',
  'learn.row.cardio.cut': '{def} minutes to start; I can set {min}–{max}.',
  'learn.row.cardio.bulk': '{def} minutes to start; I can set {min}–{max}.',
  'learn.row.cardio.why': 'On a cut the walk burns energy without eating into recovery. On a bulk it stays short: it’s there for your heart and habit, not to burn the surplus.',

  'learn.row.phasePick.title': 'Which phase I pick',
  'learn.row.phasePick.both': 'Body fat {cutAt}% or more: I recommend a cut. Under that any phase is fine; my own pick is a bulk at {leanMax}% or less and maintain in between (PB-1.1, PB-1.2).',
  'learn.row.phasePick.why': 'Those cut-offs are coaching rules of thumb from my playbook, not hard science. You can always pick the phase yourself; a bulk above the line gets a mini-cut suggestion, never a block.',

  'learn.week.split.title': '{days} days a week, four lifts',
  'learn.week.split.text': 'Squat, bench, Romanian deadlift and overhead press rotate, one per session. A cycle is {sessions} sessions however many days you train.',
  'learn.week.wave.title': 'A wave, not a straight line',
  'learn.week.wave.text': 'Weeks 1–3 build on percentages of your training max; the block style rotates each cycle.',
  'learn.week.deload.title': 'Week 4 is light, on purpose',
  'learn.week.deload.text': 'The deload lets fatigue drop so the next cycle starts fresh. Your training max is {tm}% of your best single, so the work stays crisp, not grinding.',
  'learn.week.overload.title': 'You earn every step up',
  'learn.week.overload.text': 'Your key sets (the + sets and top sets) decide the next training max: hit them and it goes up, miss and it holds or drops. That’s progressive overload.',
  'learn.week.budget.title': '{min} minutes of lifting',
  'learn.week.budget.text': 'Your time, your number. When a session runs long I trim rest and the least important sets; I never add work to fill it.',
  'learn.week.cardioAfter.title': 'Walk after you lift',
  'learn.week.cardioAfter.text': 'Cardio slows muscle gain only a little, and mostly with lots of running. An incline walk after lifting is about as gentle as cardio gets.',

  'learn.adjust.avg.title': 'I read averages, not single weigh-ins',
  'learn.adjust.avg.text': 'I use the 7-day average of your weigh-ins. Day-to-day swings are mostly water and food in transit.',
  'learn.adjust.maint.title': 'Your real maintenance',
  'learn.adjust.maint.text': 'With enough food logged, I compare what you ate with how your weight moved, and trust that over the formula.',
  'learn.adjust.safety.title': 'Safety limits I can’t cross',
  'learn.adjust.safety.text': 'Never under {floor} kcal a day, never losing more than {loss}% or gaining more than {gain}% a week. If I ask for more, the app caps it and shows you.',
  'learn.adjust.yes.title': 'You say yes to every change',
  'learn.adjust.yes.text': 'Re-plan, the weigh-in and the workout report all show each change with a switch. Nothing applies until you tap yes, and Undo is there.',

  'ask.chip.bulkCut': 'Bulk vs cut training',
  'ask.chip.bulkCutQ': 'How do you design my training differently on a bulk and on a cut, and why? Which parts are research and which are your call?',
  'ask.chip.why': 'Why this plan',
} as const;

export type LearnKey = keyof typeof learnStrings;

export function tl(key: LearnKey, vars?: Vars): string {
  const s: string = learnStrings[key];
  return vars ? s.replace(/\{(\w+)\}/g, (m, n: string) => (n in vars ? String(vars[n]) : m)) : s;
}
