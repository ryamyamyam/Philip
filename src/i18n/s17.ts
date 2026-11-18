/**
 * Story 17 strings (D-040): moving a workout for one week, swapping lift days, the treadmill read-out,
 * bodyweight progression, today's line on Home and the 0.17.1 maintenance update. A lazy pack like
 * goal.ts, learn.ts and playbook.ts, so the first screen's size budget doesn't move. Same rules as en.ts:
 * words only (no emoji), Philip's voice for his lines, plain words for data and safety. Never comment on
 * body, weight or appearance.
 */
import type { Vars } from './index';

export const s17Strings = {
  // OBS-F17324: move one workout this week
  'move.title': 'Move this workout',
  'move.hint': 'This week only. Next week goes back to your usual days. Your food follows: gym-day numbers move with the workout.',
  'move.to': 'Move to {weekday}',
  'move.none': 'No free day left this week to move it to.',
  'move.done': 'Moved to {weekday}. Your food targets moved with it.',
  'move.reset': 'Back to my usual days this week',
  'move.resetDone': 'This week is back on your usual days.',
  'move.active': 'This week is on moved days: {days}.',
  'move.close': 'Squat and RDL end up two days apart this week. Your call, but your hamstrings will have opinions.',
  'training.daysSavedFood': 'Training days saved. Your gym-day and rest-day food moved with them from this week.',

  // OBS-4DC2DF: swap lift days
  'swap.title': 'Swap lift days',
  'swap.hint': 'Change which lift comes next. Each lift keeps its own week in the wave, so nothing about the weights changes.',
  'swap.order': 'This week: {order}',
  'swap.with': 'Swap {a} with {b}',
  'swap.scope': 'For how long?',
  'swap.week': 'This week only',
  'swap.always': 'From now on',
  'swap.cancel': 'Cancel',
  'swap.done': 'Swapped. {first} comes first now.',
  'swap.reset': 'Back to Squat, Bench, RDL, OHP',
  'swap.resetDone': 'Back to the usual order.',
  'swap.close': 'This puts squat and RDL on back-to-back training days. Allowed, just leave your ego at the door on the second one.',

  // OBS-A4F4B9: treadmill incline and speed during the workout
  'tread.machine': 'Treadmill (brand, model)',
  'tread.inclineShown': 'Incline as shown',
  'tread.inclinePct': 'About {pct}% incline',
  'tread.read': 'Ask Philip to read it',
  'tread.reading': 'Reading your machine…',
  'tread.result': '{machine}: {incline}% incline, {mph} mph.',
  'tread.resultNote': 'Your machine already shows incline in %, so I kept it.',
  'tread.low': 'This is my best guess for that machine. Check it before you trust it.',
  'tread.use': 'Use these',
  'tread.out': 'That gives {what} outside what I can log ({min}–{max}). Check the numbers on the machine and type them again.',
  'tread.noAi': 'I can’t reach my brain right now. Type the incline % and speed yourself.',
  'tread.failed': 'I couldn’t read that machine. Type the incline % and speed yourself.',

  // OBS-0E95EF: bodyweight moves
  'bw.plus': 'Bodyweight + {w}',
  'bw.now.reps': 'Body weight stays. You beat it with reps: {reps} on every set today.',
  'bw.now.set': 'You owned the top of the range last time, so today you get one more set.',
  'bw.now.offer': 'You own {sets} × {reps} at this weight. Want {kg} more next time? Your call, never automatic.',
  'bw.addLoad': 'Add {kg} next time',
  'bw.keepBw': 'Keep it as is',
  'bw.added': 'Done. Next time: {kg} more, back to {reps} reps.',
  'bw.assisted': 'Last time was well under {reps} reps. Swap to the assisted version (tap the name) and build up to it.',

  // N-2 / N-3: today's line on Home
  'line.title': 'Today’s line',
  'line.body': 'Body',
  'line.strength': 'Strength',
  'line.weight': 'Weight',
  'line.bf': 'Body fat',
  'line.expected': 'plan {v}',
  'line.now': 'now {v}',
  'line.avg': 'avg {v}',
  'line.latest': '{v} ({date})',
  'line.old': '{v} · old reading',
  'line.status.onTrack': 'On track',
  'line.status.ahead': 'Ahead',
  'line.status.aheadFast': 'Ahead (fast)',
  'line.status.behind': 'Behind',
  'line.status.above': 'Above line',
  'line.status.holding': 'Holding',
  'line.status.dropping': 'Dropping',
  'line.status.weighBf': 'Weigh in BF',
  'line.status.noData': 'No data yet',
  'line.noGoal': 'Set a goal and I’ll draw today’s line.',
  'line.setGoal': 'Update goals',
  'line.noBfGoal': 'No body-fat goal set',
  'line.fewWeighIns': 'Three weigh-ins and I’ll draw your trend.',
  'line.goalEnd': '{v} · {date}',
  'line.window.goal': 'Goal',
  'line.window.4wk': '4 wk',
  'line.windowLabel': 'Chart window',
  'line.dot': 'Show {name}',
  'line.combined': 'All four on target by about {date}',
  'line.combinedNone': 'Three sessions per lift and I can date it.',
  'line.today': 'Today',
  'line.plan': 'Plan',
  'line.lift.squat': 'Squat',
  'line.lift.bench': 'Bench',
  'line.lift.rdl': 'RDL',
  'line.lift.ohp': 'OHP',
  'line.tileNums': 'Plan {exp} · {now}',
  'line.aria.weight': 'Weight: expected {exp}, now {now}, {status}.',
  'line.aria.bf': 'Body fat: expected {exp}, now {now}, {status}.',
  'line.aria.lift': '{lift}: expected {exp}, latest {now}, {status}.',

  // 0.17.1: maintenance by the playbook (PB-2.2)
  'tdee.title': 'Your maintenance, by the playbook',
  'tdee.line': 'I fixed how I count your daily burn. Same goal, same phase. Here is what moved and why.',
  'tdee.lineNone': 'Your plan already sits on the right maintenance. Nothing had to move.',
  'tdee.ask.title': 'Outside the gym, your day is…',
  'tdee.ask.why': 'Together with your lifting days this sets your maintenance (PB-2.2). Change it later in Settings › Targets.',
  'tdee.ask.sedentary': 'Mostly sitting',
  'tdee.ask.active': 'On my feet, or 10,000+ steps',
} as const;

export type S17Key = keyof typeof s17Strings;

export function t17(key: S17Key, vars?: Vars): string {
  const s: string = s17Strings[key];
  return vars ? s.replace(/\{(\w+)\}/g, (m, n: string) => (n in vars ? String(vars[n]) : m)) : s;
}
