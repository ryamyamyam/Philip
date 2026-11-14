import { useLiveQuery } from 'dexie-react-hooks';
import { useToast } from '../../components/Toast';
import { db } from '../../db/db';
import { canUndo, undoGoalPlan } from '../../db/goalRepo';
import { useCycles, useWorkoutSessions } from '../../hooks/useData';
import { tg } from '../../i18n/goal';
import { addDays, daysBetween, todayYmd, toYmd } from '../../lib/date';
import { fmtDate } from '../../lib/format';
import { fmtIn } from '../workout/units';

/**
 * Story 11 §6.5: each cycle's goal, planned vs what happened (reached, early, in progress), newest
 * first, with Undo for the last applied plan while it's still allowed.
 */
export function GoalHistory({ unit }: { unit: 'kg' | 'lb' }) {
  const toast = useToast();
  const cycles = useCycles();
  const sessions = useWorkoutSessions();
  const changes = useLiveQuery(() => db.planChanges.orderBy('at').toArray(), []);
  if (!cycles || !sessions || !changes || cycles.length === 0) return null;
  const today = todayYmd();
  const last = [...changes].reverse().find((c) => c.status === 'applied');
  const undoable = last && canUndo(last, sessions, Date.now()) === 'ok' ? last : null;
  return (
    <section className="card stack-sm" aria-labelledby="goal-hist-h">
      <h2 id="goal-hist-h">{tg('goal.history.title')}</h2>
      <ol className="goal-history">
        {[...cycles].reverse().map((c) => {
          const start = toYmd(new Date(c.startedAt));
          const planned = addDays(start, 28);
          const status = c.reachedAt
            ? `${tg('goal.history.reached', { date: fmtDate(c.reachedAt, 'short') })}${daysBetween(c.reachedAt, planned) > 0 ? ` · ${tg('goal.history.early', { days: daysBetween(c.reachedAt, planned) })}` : ''}`
            : c.endedEarly
              ? tg('goal.history.ended')
              : today <= planned
                ? tg('goal.history.active')
                : '';
          return (
            <li key={c.index} className="stack-xs">
              <span className="num">{tg('goal.history.row', { n: c.index, start: fmtIn(c.goal.startWeightKg, unit), end: fmtIn(c.goal.endWeightKg, unit) })}</span>
              {status && <span className="small muted">{status}</span>}
            </li>
          );
        })}
      </ol>
      {undoable?.id !== undefined && (
        <button
          type="button"
          className="btn btn-ghost btn-block"
          onClick={() =>
            void undoGoalPlan(undoable.id as number, today)
              .then(() => toast(tg('goal.undone')))
              .catch(() => toast(tg('goal.stale')))
          }
        >
          {tg('goal.history.undo')}
        </button>
      )}
    </section>
  );
}
