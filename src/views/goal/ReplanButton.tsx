import { useGoalState } from '../../hooks/useGoal';
import { tg } from '../../i18n/goal';
import { replanButton } from '../../lib/goal/replan';
import { useUI } from '../../ui';

/**
 * Story 12: "Re-plan with Philip" (Workout › Plan, Progress › Goals, Ask Philip). Hidden with no active
 * cycle, disabled with a plain line while a workout is open, and "See Philip's plan" when a request is
 * already waiting or ready (it reopens that one; no second request).
 */
export default function ReplanButton({ line = false }: { line?: boolean }) {
  const { openSheet } = useUI();
  const state = useGoalState();
  if (!state) return null;
  const b = replanButton({ cycleActive: !!state.cycle && !state.cycle.endedEarly && !state.cycleDone, workoutOpen: state.workoutOpen, open: state.open, openManual: state.openManual });
  if (b.state === 'hidden') return null;
  const disabled = b.state === 'disabled';
  return (
    <div className="stack-sm replan" data-replan={b.state}>
      {line && <p className="small">{tg('replan.line')}</p>}
      <button
        type="button"
        className="btn btn-secondary btn-block"
        disabled={disabled}
        onClick={() => openSheet(b.state === 'see' && !b.manual ? { kind: 'goal' } : { kind: 'goal', manual: true })}
      >
        {tg(b.state === 'see' ? 'replan.see' : 'replan.button')}
      </button>
      {disabled && <p className="small muted">{tg('replan.workoutOpen')}</p>}
    </div>
  );
}
