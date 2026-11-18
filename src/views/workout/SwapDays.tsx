import { useState } from 'react';
import { useToast } from '../../components/Toast';
import { setDayOrderScope } from '../../db/repo';
import type { CycleRecord, TrainingProgram, WorkoutSession } from '../../db/types';
import { t, type StringKey } from '../../i18n';
import { t17 } from '../../i18n/s17';
import { DAY_LIFT, type Day, type LiftId } from '../../lib/training/program';
import { nextSessionRef } from '../../lib/training/progress';
import { dayOrderFor, squatRdlAdjacent, swapDays } from '../../lib/training/schedule';

const LIFT_KEY: Record<LiftId, StringKey> = { squat: 'exercise.squat', bench: 'exercise.bench', rdl: 'exercise.rdl', ohp: 'exercise.ohp' };
const liftOf = (d: Day) => t(LIFT_KEY[DAY_LIFT[d]]);

/**
 * Story 17 (OBS-4DC2DF): swap which lift comes next, e.g. shoulder day with leg day. Only days not yet
 * trained this program week can move. "This week only" or "from now on". The cycle stays 16 sessions and
 * every lift keeps its own week of the %TM wave (PB-4.4), so no weight changes.
 */
export function SwapDays({ program, cycle, sessions }: { program: TrainingProgram; cycle: CycleRecord; sessions: readonly WorkoutSession[] }) {
  const toast = useToast();
  const [first, setFirst] = useState<Day | null>(null);
  const [pair, setPair] = useState<[Day, Day] | null>(null);
  const ref = nextSessionRef(sessions, cycle.index, program);
  if (!ref) return null;
  const week = ref.week;
  const order = dayOrderFor(program, cycle.index, week);
  const closed = new Set(sessions.filter((s) => s.cycle === cycle.index && s.week === week && s.status !== 'in_progress').map((s) => s.day));
  const open = sessions.some((s) => s.cycle === cycle.index && s.status === 'in_progress');
  const free = order.filter((d) => !closed.has(d));
  const custom = order.join() !== '1,2,3,4';
  if (free.length < 2 || open) return null;

  const apply = async (scope: 'week' | 'always') => {
    if (!pair) return;
    const next = swapDays(order, pair[0], pair[1]);
    await setDayOrderScope(scope, next, { cycle: cycle.index, week });
    setPair(null);
    setFirst(null);
    const firstFree = next.find((d) => !closed.has(d)) ?? next[0];
    const done = t17('swap.done', { first: liftOf(firstFree as Day) });
    toast(squatRdlAdjacent(next) ? `${done} ${t17('swap.close')}` : done);
  };
  const reset = async () => {
    await setDayOrderScope('always', null, { cycle: cycle.index, week });
    toast(t17('swap.resetDone'));
  };

  return (
    <details className="card plan-swap">
      <summary>{t17('swap.title')}</summary>
      <div className="stack-sm">
        <p className="small muted">{t17('swap.hint')}</p>
        <p className="small num">{t17('swap.order', { order: order.map(liftOf).join(' · ') })}</p>
        {!pair && (
          <div className="ex-actions" role="group" aria-label={t17('swap.title')}>
            {free.map((d) =>
              first === null ? (
                <button key={d} type="button" className="btn btn-secondary" onClick={() => setFirst(d)}>
                  {liftOf(d)}
                </button>
              ) : d === first ? null : (
                <button key={d} type="button" className="btn btn-secondary" onClick={() => setPair([first, d])}>
                  {t17('swap.with', { a: liftOf(first), b: liftOf(d) })}
                </button>
              ),
            )}
            {first !== null && (
              <button type="button" className="btn btn-ghost" onClick={() => setFirst(null)}>
                {t17('swap.cancel')}
              </button>
            )}
          </div>
        )}
        {pair && (
          <div className="stack-xs" role="group" aria-label={t17('swap.scope')}>
            <p className="small">{t17('swap.scope')}</p>
            {squatRdlAdjacent(swapDays(order, pair[0], pair[1])) && <p className="small">{t17('swap.close')}</p>}
            <div className="ex-actions">
              <button type="button" className="btn btn-primary" onClick={() => void apply('week')}>
                {t17('swap.week')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => void apply('always')}>
                {t17('swap.always')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setPair(null)}>
                {t17('swap.cancel')}
              </button>
            </div>
          </div>
        )}
        {custom && !pair && (
          <button type="button" className="btn btn-ghost" onClick={() => void reset()}>
            {t17('swap.reset')}
          </button>
        )}
      </div>
    </details>
  );
}
