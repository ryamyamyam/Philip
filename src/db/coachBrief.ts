/**
 * Story 9: reads everything Philip's brief needs from the database in one read transaction and
 * builds it. Kept apart from `lib/coach/brief.ts` so the builder stays pure and unit-tested.
 */
import { db, type PhilipDB } from './db';
import { META } from './repo';
import { t, type StringKey } from '../i18n';
import { addDays } from '../lib/date';
import { targetForDate } from '../lib/nutrition';
import { buildBrief, type BriefChatLine, type BriefFoodDay } from '../lib/coach/brief';

const exName = (id: string) => t(`exercise.${id}` as StringKey);

export async function loadBrief(today: string, opts: { excludeSessionId?: string | null; excludeAsk?: boolean } = {}, database: PhilipDB = db): Promise<string> {
  const tables = [database.profile, database.meta, database.weightEntries, database.foodEntries, database.targetPlans, database.trainingProgram, database.cycles, database.tmHistory, database.workoutSessions, database.coachNotes, database.coachMessages];
  return database.transaction('r', tables, async () => {
    const share = ((await database.meta.get(META.coachShareBody))?.value as boolean | undefined) !== false;
    const profile = await database.profile.get('me');
    const from = addDays(today, -6);
    const [weights, foods, plans, program, cycles, tmHistory, sessions, notes, ask] = await Promise.all([
      share ? database.weightEntries.toArray() : Promise.resolve([]),
      share ? database.foodEntries.where('date').between(from, today, true, true).toArray() : Promise.resolve([]),
      share ? database.targetPlans.toArray() : Promise.resolve([]),
      database.trainingProgram.get('me'),
      database.cycles.toArray(),
      database.tmHistory.toArray(),
      database.workoutSessions.toArray(),
      database.coachNotes.toArray(),
      opts.excludeAsk ? Promise.resolve([]) : database.coachMessages.orderBy('at').reverse().limit(12).toArray(),
    ]);
    const byDay = new Map<string, BriefFoodDay>();
    for (const f of foods) {
      const d = byDay.get(f.date) ?? { date: f.date, calories: 0, proteinG: 0 };
      d.calories += f.calories;
      d.proteinG += f.proteinG;
      byDay.set(f.date, d);
    }
    const chat: BriefChatLine[] = [
      ...ask.map((m) => ({ from: m.from, text: m.text, at: m.at, where: 'Ask' })),
      ...sessions.filter((s) => s.id !== opts.excludeSessionId).flatMap((s) => (s.coach?.messages ?? []).map((m) => ({ from: m.from, text: m.text, at: m.at, where: `workout ${s.date}` }))),
    ];
    return buildBrief({
      today,
      profile:
        share && profile
          ? {
              sex: profile.sex,
              birthDate: profile.birthDate,
              heightCm: profile.heightCm,
              bodyFatPct: profile.bodyFatPct,
              targetWeightKg: profile.targetWeightKg,
              targetBodyFatPct: profile.targetBodyFatPct,
            }
          : null,
      weights,
      food: share ? { days: [...byDay.values()], target: targetForDate(plans, today) } : null,
      currentCycle: program?.currentCycle ?? 0,
      cycles,
      tmHistory,
      sessions,
      notes,
      chat,
      excludeSessionId: opts.excludeSessionId ?? null,
      name: exName,
    });
  });
}
