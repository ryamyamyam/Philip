import { useMemo } from 'react';
import type { WorkoutSession, YMD } from '../../db/types';
import { t } from '../../i18n';
import { tp } from '../../i18n/playbook';
import { bodyweightRatio, lastWeekLine, setRatio, statusOf, thisWeekLine, type StrengthStatus, type WeekLine } from '../../lib/strength/e1rm';
import { infoFor } from '../../lib/training/sessionLog';
import type { Prescribed } from '../../lib/training/session';
import { fmtIn } from './units';

const STATUS_KEY: Record<StrengthStatus, 'strip.ahead' | 'strip.onTrack' | 'strip.behind'> = { ahead: 'strip.ahead', onTrack: 'strip.onTrack', behind: 'strip.behind' };

function lineText(l: WeekLine | null, pair: boolean, unit: 'kg' | 'lb', bw = false): string {
  if (!l) return tp('strip.none');
  // Story 17 (PB-4.8): on a bodyweight move the kg is added load.
  const w = l.kg === null || (bw && l.kg <= 0) ? t('cal.bw') : bw ? `${t('cal.bw')} + ${fmtIn(l.kg, unit)}` : pair ? t('session.pair', { w: fmtIn(l.kg, unit) }) : fmtIn(l.kg, unit);
  return tp('strip.line', { w, reps: l.reps, sets: l.sets });
}

/**
 * Story 16 (PB-8.3): last week and this week as weight × reps × sets, and the e1RM now vs the plan
 * (On track / Behind / Ahead): did the last session hit the e1RM its order asked for (the order is the
 * plan, so the Big 4 follow the cycle's wave and accessories their double progression).
 */
export function StrengthStrip({
  exerciseId,
  prescription,
  sessions,
  date,
  excludeId,
  unit,
  bodyWeightKg = null,
}: {
  exerciseId: string;
  prescription: readonly Prescribed[];
  sessions: readonly WorkoutSession[];
  date: YMD;
  excludeId?: string;
  unit: 'kg' | 'lb';
  /** Story 17 (PB-4.8): body weight for a bodyweight move's e1RM (body weight + added load). */
  bodyWeightKg?: number | null;
}) {
  const pair = !!infoFor(exerciseId).pair;
  const bw = !!infoFor(exerciseId).bodyweight;
  // e1RM is per hand for dumbbells (PB-8.1).
  const pw = (kg: number) => (pair ? t('session.pair', { w: fmtIn(kg, unit) }) : fmtIn(kg, unit));
  const data = useMemo(() => {
    const past = sessions.filter((s) => s.id !== excludeId && s.date <= date);
    const last = lastWeekLine(past, exerciseId, date);
    const now = thisWeekLine(prescription);
    // The latest session that logged it: what he achieved vs what its order asked (PB-8.1, PB-8.3).
    let e1: number | null = null;
    let planned: number | null = null;
    const latest = [...past].filter((x) => x.status === 'done').sort((a, b) => b.date.localeCompare(a.date) || (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
    for (const x of latest) {
      const e = x.exercises.find((y) => y.exerciseId === exerciseId && !y.skipped);
      const r = e ? (bw ? bodyweightRatio(e, bodyWeightKg) : setRatio(e)) : null;
      if (r) {
        e1 = r.actual;
        planned = r.ordered;
        break;
      }
    }
    return { last, now, e1, planned };
  }, [sessions, excludeId, date, exerciseId, prescription, bw, bodyWeightKg]);
  return (
    <div className="ex-strip small num" data-testid="strength-strip">
      <p>
        <span className="ex-strip-k">{tp('strip.last')}</span> {lineText(data.last, pair, unit, bw)}
      </p>
      <p>
        <span className="ex-strip-k">{tp('strip.this')}</span> {lineText(data.now, pair, unit, bw)}
      </p>
      {data.e1 !== null && data.planned !== null && (
        <p>
          {tp('strip.e1rm', { now: pw(data.e1), plan: pw(data.planned) })} <span className="pm-pill">{tp(STATUS_KEY[statusOf(data.e1, data.planned)])}</span>
        </p>
      )}
    </div>
  );
}
