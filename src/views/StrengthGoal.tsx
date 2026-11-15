import { useMemo } from 'react';
import { StatPanel } from '../components/StatPanel';
import { StatRow } from '../components/StatRow';
import { useCycles, useTrainingProgram, useWorkoutSessions } from '../hooks/useData';
import { t, type StringKey } from '../i18n';
import { tp } from '../i18n/playbook';
import { fmtDate } from '../lib/format';
import { combinedStrengthDate, linesFor, planSeries, projection } from '../lib/strength/e1rm';
import { todayYmd } from '../lib/date';
import { LIFTS, type LiftId } from '../lib/training/program';
import { fmtIn } from './workout/units';

const LIFT_KEY: Record<LiftId, StringKey> = { squat: 'exercise.squat', bench: 'exercise.bench', rdl: 'exercise.rdl', ohp: 'exercise.ohp' };

/**
 * Story 16 (PB-8.2): the strength goal. Each Big-4 target comes from the cycle plan (flat on a cut);
 * one combined date when all four are projected to get there on the trend of their recent sessions.
 * Shown on Progress › Strength and next to the body-weight goal.
 */
export function StrengthGoal() {
  const program = useTrainingProgram();
  const sessions = useWorkoutSessions();
  const cycles = useCycles();
  const cycle = program && program.currentCycle > 0 ? (cycles?.find((c) => c.index === program.currentCycle) ?? null) : null;
  const lines = useMemo(() => (cycle ? linesFor(cycle) : null), [cycle]);
  const date = useMemo(() => (cycle && sessions && cycles ? combinedStrengthDate(sessions, cycles, cycle, todayYmd()) : null), [cycle, sessions, cycles]);
  if (!program || !cycle || !lines || !date || !sessions || !cycles) return null;
  const unit = program.weightUnit;
  const head =
    date.kind === 'date'
      ? tp('sg.date', { date: fmtDate(date.date, 'medium') })
      : date.kind === 'reached'
        ? tp('sg.reached')
        : date.kind === 'notEnough'
          ? tp('sg.dateNone')
          : tp('sg.dateOff');
  return (
    <StatPanel title={tp('sg.title')}>
      <p className="small" data-testid="strength-goal-date">
        <strong>{head}</strong>
      </p>
      <dl className="pm-rows">
        {LIFTS.map((l) => {
          const line = lines[l];
          if (!line) return null;
          const tr = projection(planSeries(sessions, l, cycles), line, todayYmd());
          return (
            <StatRow
              key={l}
              label={t(LIFT_KEY[l])}
              value={`${tr ? fmtIn(tr.now, unit) : '–'} → ${cycle.phase === 'lose' ? tp('sg.hold', { kg: fmtIn(line.target, unit) }) : tp('sg.target', { kg: fmtIn(line.target, unit), date: fmtDate(line.targetDate, 'short') })}`}
            />
          );
        })}
      </dl>
    </StatPanel>
  );
}
