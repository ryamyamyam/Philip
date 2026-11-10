/**
 * Philip's brief (Story 9): a compact, token-budgeted summary of the lifter's whole history that
 * goes in front of every Gemini coaching prompt (report, chat under it, mid-set check-in, Ask Philip).
 *
 * Pure: data in, text out. The DB read lives in `loadBrief.ts`. Sections are added in priority order
 * and the brief stops at BRIEF_BUDGET.chars, so a long history never blows the free-tier request size
 * or slows the reply. Facts only; no advice is generated here.
 */
import type { CoachNote, CycleRecord, Macros, Sex, TmRecord, WeightEntry, WorkoutSession, YMD } from '../../db/types';
import { ageOn, addDays, toYmd } from '../date';
import { rollingWeight } from '../training/cycleGoal';
import { blockForCycle, DAY_LIFT, epley, EPLEY_MAX_REPS, isKeySet, LIFTS, type LiftId } from '../training/program';
import { tmsForCycle } from '../training/progress';
import { infoFor, liftOf } from '../training/sessionLog';
import { weeklyTrend } from '../weight';

export const BRIEF_BUDGET = {
  /** Hard cap on the brief (≈1,500 tokens). D-031. */
  chars: 6000,
  recentSessions: 6,
  topSetsPerLift: 5,
  accessories: 12,
  chatLines: 12,
  chatChars: 220,
  /** Pain/flag notes look back this many days. */
  issueDays: 42,
  noteLines: 40,
} as const;

export interface BriefProfile {
  sex: Sex | null;
  birthDate: YMD | null;
  heightCm: number | null;
  bodyFatPct: number | null;
  targetWeightKg: number | null;
  targetBodyFatPct: number | null;
}

export interface BriefFoodDay {
  date: YMD;
  calories: number;
  proteinG: number;
}

/** One chat line from any thread, with where it was said ("Ask" or the workout date). */
export interface BriefChatLine {
  from: 'me' | 'philip';
  text: string;
  at: number;
  where: string;
}

export interface BriefInput {
  today: YMD;
  /** Null when the owner turned body and food sharing off (Settings › Philip's memory). */
  profile: BriefProfile | null;
  weights: readonly WeightEntry[];
  food: { days: readonly BriefFoodDay[]; target: Macros | null } | null;
  currentCycle: number;
  cycles: readonly CycleRecord[];
  tmHistory: readonly TmRecord[];
  sessions: readonly WorkoutSession[];
  notes: readonly CoachNote[];
  chat: readonly BriefChatLine[];
  /** A session the prompt already details (today's report): left out of "Recent workouts". */
  excludeSessionId?: string | null;
  name: (exerciseId: string) => string;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const md = (ymd: string) => ymd.slice(5);
const one = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max);

/** Best set of a done main lift: highest e1RM among key sets, else the heaviest done work set. */
export function topSet(s: WorkoutSession): { lift: LiftId; kg: number; reps: number; e1rm: number | null } | null {
  const ex = s.exercises.find((e) => e.slot === 'main');
  const lift = ex ? liftOf(ex.exerciseId) : null;
  if (!ex || !lift) return null;
  let best: { kg: number; reps: number; e1rm: number | null } | null = null;
  for (const a of ex.actual) {
    const p = ex.prescription.find((x) => x.order === a.order);
    if (!p || p.kind === 'warmup' || !a.done || a.kg === null || a.reps === null || a.reps < 1) continue;
    const e = isKeySet(p.kind) && a.reps <= EPLEY_MAX_REPS ? r1(epley(a.kg, a.reps)) : null;
    const better = !best || (e ?? 0) > (best.e1rm ?? 0) || ((e ?? 0) === (best.e1rm ?? 0) && a.kg > best.kg);
    if (better) best = { kg: a.kg, reps: a.reps, e1rm: e };
  }
  return best ? { lift, ...best } : null;
}

function notesSection(i: BriefInput): string[] {
  if (!i.notes.length) return [];
  const sorted = [...i.notes].sort((a, b) => a.createdAt - b.createdAt).slice(-BRIEF_BUDGET.noteLines);
  return ['Your notes about the lifter (from earlier chats; keep them in mind):', ...sorted.map((n) => `- ${one(n.text, 160)}`)];
}

function lifterSection(i: BriefInput): string[] {
  const p = i.profile;
  if (!p) return ['Lifter: body and food data not shared (owner setting).'];
  const bits = [
    p.sex,
    p.birthDate ? `${ageOn(p.birthDate, i.today)} y` : null,
    p.heightCm ? `${Math.round(p.heightCm)} cm` : null,
  ].filter(Boolean);
  const lines = [`Lifter: ${bits.length ? bits.join(', ') : 'no profile yet'}.`];
  const targets = [p.targetWeightKg ? `${r1(p.targetWeightKg)} kg` : null, p.targetBodyFatPct ? `${p.targetBodyFatPct}% body fat` : null].filter(Boolean);
  if (targets.length) lines.push(`Long-term target: ${targets.join(', ')}.`);
  const avg = rollingWeight(i.weights, i.today);
  const latest = [...i.weights].sort((a, b) => b.date.localeCompare(a.date))[0];
  const trend = weeklyTrend(i.weights, i.today);
  const w: string[] = [];
  if (avg !== null) w.push(`7-day average ${r1(avg)} kg`);
  else if (latest) w.push(`last weigh-in ${r1(latest.weightKg)} kg on ${latest.date}`);
  if (trend !== null) w.push(`trend ${trend > 0 ? '+' : ''}${trend} kg/week over 4 weeks`);
  if (p.bodyFatPct !== null) w.push(`body fat ${p.bodyFatPct}% (estimate)`);
  if (w.length) lines.push(`Body: ${w.join('; ')}.`);
  if (i.food) {
    const from = addDays(i.today, -6);
    const days = i.food.days.filter((d) => d.date >= from && d.date <= i.today && d.calories > 0);
    if (days.length) {
      const avgK = Math.round(days.reduce((s, d) => s + d.calories, 0) / days.length);
      const avgP = Math.round(days.reduce((s, d) => s + d.proteinG, 0) / days.length);
      const tgt = i.food.target ? `; target ${Math.round(i.food.target.calories)} kcal, ${Math.round(i.food.target.proteinG)} g protein` : '';
      lines.push(`Food, last 7 days: logged ${days.length} of 7 days; average on logged days ${avgK} kcal, ${avgP} g protein${tgt}.`);
    } else lines.push('Food, last 7 days: nothing logged.');
  }
  return lines;
}

function programSection(i: BriefInput): string[] {
  if (i.currentCycle < 1) return i.sessions.length ? [] : ['Program: not started yet.'];
  const cycle = i.cycles.find((c) => c.index === i.currentCycle) ?? null;
  const tms = tmsForCycle(i.tmHistory, i.currentCycle);
  const lines = [
    `Program: cycle ${i.currentCycle} (block ${blockForCycle(i.currentCycle)})${cycle ? `, phase ${cycle.phase}, started ${toYmd(new Date(cycle.startedAt))}` : ''}.`,
    `Training maxes now (kg): ${LIFTS.map((l) => `${l} ${tms[l] ?? '?'}`).join(', ')}.`,
  ];
  if (i.currentCycle > 1) {
    const first = tmsForCycle(i.tmHistory, 1);
    lines.push(`Cycle 1 training maxes (kg): ${LIFTS.map((l) => `${l} ${first[l] ?? '?'}`).join(', ')}.`);
  }
  if (cycle?.goal) lines.push(`This cycle's goal: ${r1(cycle.goal.startWeightKg)} → ${r1(cycle.goal.endWeightKg)} kg${cycle.goal.bfLinePct !== null ? `, body fat line ${cycle.goal.bfLinePct}%` : ''}.`);
  return lines;
}

const done = (i: BriefInput) => i.sessions.filter((s) => s.status === 'done').sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt);

function mainLiftSection(i: BriefInput): string[] {
  const by: Record<LiftId, string[]> = { squat: [], bench: [], rdl: [], ohp: [] };
  for (const s of done(i)) {
    const t = topSet(s);
    if (!t || by[t.lift].length >= BRIEF_BUDGET.topSetsPerLift) continue;
    by[t.lift].push(`${md(s.date)} ${r1(t.kg)}x${t.reps}${t.e1rm !== null ? ` (e1RM ${t.e1rm})` : ''}`);
  }
  const lines = LIFTS.filter((l) => by[l].length).map((l) => `- ${l}: ${by[l].join(', ')}`);
  return lines.length ? ['Main lifts, best set per session, newest first (kg):', ...lines] : [];
}

function workoutsSection(i: BriefInput): string[] {
  const list = done(i)
    .filter((s) => s.id !== i.excludeSessionId)
    .slice(0, BRIEF_BUDGET.recentSessions);
  if (!list.length) return [];
  const lines = list.map((s) => {
    const work = s.exercises.flatMap((e) => e.actual.filter((a) => e.prescription.find((p) => p.order === a.order)?.kind !== 'warmup'));
    const doneSets = work.filter((a) => a.done).length;
    const flags = work.map((a) => a.flag).filter(Boolean);
    const min = s.finishedAt ? Math.round((s.finishedAt - s.startedAt) / 60000) : null;
    const bits = [
      `${s.date} W${s.week} D${s.day} ${DAY_LIFT[s.day]}`,
      min !== null ? `${min} min` : null,
      `${doneSets}/${work.length} sets`,
      s.exercises.some((e) => e.skipped) ? `skipped ${s.exercises.filter((e) => e.skipped).map((e) => i.name(e.exerciseId)).join(', ')}` : null,
      s.cardio ? (s.cardio.done ? `cardio ${s.cardio.minutes ?? '?'} min` : 'cardio not done') : null,
      flags.length ? `flags: ${flags.join(', ')}` : null,
      s.coach?.report ? `your report: "${one(s.coach.report, 140)}"` : null,
    ].filter(Boolean);
    return `- ${bits.join('; ')}`;
  });
  return ['Recent workouts, newest first:', ...lines];
}

function accessorySection(i: BriefInput): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const s of done(i)) {
    for (const e of s.exercises) {
      if (e.slot === 'main' || seen.has(e.exerciseId) || lines.length >= BRIEF_BUDGET.accessories) continue;
      const sets = e.actual.filter((a) => a.done);
      if (!sets.length) continue;
      seen.add(e.exerciseId);
      const best = sets.reduce((b, a) => ((a.kg ?? 0) > (b.kg ?? 0) || ((a.kg ?? 0) === (b.kg ?? 0) && (a.reps ?? 0) > (b.reps ?? 0)) ? a : b));
      const per = infoFor(e.exerciseId).pair ? ' per hand' : '';
      const load = best.kg === null || best.kg === 0 ? 'bodyweight' : `${r1(best.kg)} kg${per}`;
      lines.push(`- ${i.name(e.exerciseId)}: ${md(s.date)}, ${sets.length} sets, best ${load} x ${best.reps ?? '?'}`);
    }
  }
  return lines.length ? ['Accessories, latest log each:', ...lines] : [];
}

function issuesSection(i: BriefInput): string[] {
  const from = addDays(i.today, -BRIEF_BUDGET.issueDays);
  const lines: string[] = [];
  for (const s of done(i)) {
    if (s.date < from) continue;
    for (const e of s.exercises) {
      for (const a of e.actual) {
        if (!a.pain && !a.note && a.flag !== 'pain') continue;
        lines.push(`- ${md(s.date)} ${i.name(e.exerciseId)} set ${a.order + 1}: ${a.pain || a.flag === 'pain' ? 'PAIN' : a.flag ?? 'note'}${a.note ? ` "${one(a.note, 120)}"` : ''}`);
      }
      if (e.note) lines.push(`- ${md(s.date)} ${i.name(e.exerciseId)}: "${one(e.note, 120)}"`);
    }
  }
  return lines.length ? [`What the lifter reported during sets (last ${BRIEF_BUDGET.issueDays / 7} weeks):`, ...lines.slice(0, 12)] : [];
}

function chatSection(i: BriefInput): string[] {
  const lines = [...i.chat].sort((a, b) => a.at - b.at).slice(-BRIEF_BUDGET.chatLines);
  if (!lines.length) return [];
  return [
    'Earlier conversations, oldest first:',
    ...lines.map((m) => `- [${m.where}] ${m.from === 'me' ? 'Lifter' : 'Philip'}: ${one(m.text, BRIEF_BUDGET.chatChars)}`),
  ];
}

/**
 * The brief. Sections in priority order; whole lines are added until BRIEF_BUDGET.chars, then
 * a "(brief cut short)" line. Never longer than the budget.
 */
export function buildBrief(i: BriefInput): string {
  const sections = [notesSection, lifterSection, programSection, mainLiftSection, issuesSection, workoutsSection, accessorySection, chatSection];
  const head = '--- Philip\'s brief: what you know about this lifter (facts from the app; use them, do not invent more) ---';
  const tail = '--- end of brief ---';
  const cut = '(brief cut short)';
  const max = BRIEF_BUDGET.chars - tail.length - cut.length - 2;
  const out: string[] = [head];
  let len = head.length;
  let truncated = false;
  for (const f of sections) {
    for (const line of f(i)) {
      if (len + line.length + 1 > max) {
        truncated = true;
        break;
      }
      out.push(line);
      len += line.length + 1;
    }
    if (truncated) break;
  }
  if (truncated) out.push(cut);
  out.push(tail);
  return out.join('\n');
}

/** Short history of one exercise for the mid-set check-in: its last 3 logs. */
export function exerciseHistory(sessions: readonly WorkoutSession[], exerciseId: string, excludeSessionId: string | null): string {
  const lines: string[] = [];
  for (const s of [...sessions].filter((x) => x.status === 'done' && x.id !== excludeSessionId).sort((a, b) => b.date.localeCompare(a.date))) {
    const e = s.exercises.find((x) => x.exerciseId === exerciseId);
    if (!e) continue;
    const sets = e.actual.filter((a) => a.done && e.prescription.find((p) => p.order === a.order)?.kind !== 'warmup');
    if (!sets.length) continue;
    lines.push(`${s.date}: ${sets.map((a) => `${a.kg ?? 'bw'}x${a.reps ?? '?'}${a.flag ? ` [${a.flag}]` : ''}`).join(', ')}`);
    if (lines.length >= 3) break;
  }
  return lines.length ? `Earlier logs of this exercise (kg x reps): ${lines.join(' | ')}` : 'First time logging this exercise.';
}
