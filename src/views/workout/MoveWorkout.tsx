import { useToast } from '../../components/Toast';
import { setWeekDays } from '../../db/repo';
import type { TrainingProgram, WorkoutSession, YMD } from '../../db/types';
import { t17 } from '../../i18n/s17';
import { parseYmd, startOfWeek } from '../../lib/date';
import { weekOf } from '../../lib/goal/gymDays';
import { isoWeekday, isTrainingDate, moveDay, squatRdlTooClose, trainingDaysOrDefault, weekDaysFor } from '../../lib/training/schedule';

/**
 * Story 17 (OBS-F17324): move a planned workout to another free day of THIS week. Next week goes back
 * to the usual days (Settings › Training days stays the permanent change). Food follows on its own:
 * carb-day targets read the week's gym days.
 */
/** "Saturday": this week only, so the weekday says it all. */
const dayName = (d: YMD) => new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(parseYmd(d));

export function MoveWorkout({ date, today, program, sessions }: { date: YMD; today: YMD; program: TrainingProgram; sessions: readonly WorkoutSession[] }) {
  const toast = useToast();
  const thisWeek = startOfWeek(today);
  if (startOfWeek(date) !== thisWeek || date < today) return null;
  if (!isTrainingDate(date, program.trainingDays, program.weekDays)) return null;
  const busy = new Set(sessions.filter((s) => s.status !== 'skipped').map((s) => s.date));
  if (busy.has(date)) return null;
  const current = weekDaysFor(today, program.weekDays) ?? trainingDaysOrDefault(program.trainingDays);
  const from = isoWeekday(date);
  const targets = weekOf(today).filter((d) => d >= today && !busy.has(d) && moveDay(current, from, isoWeekday(d)) !== null);
  const moved = weekDaysFor(today, program.weekDays) !== null;

  const move = async (to: YMD) => {
    const days = moveDay(current, from, isoWeekday(to));
    if (!days) return;
    await setWeekDays({ weekStart: thisWeek, days });
    const done = t17('move.done', { weekday: dayName(to) });
    toast(squatRdlTooClose(days) ? `${done} ${t17('move.close')}` : done);
  };
  const reset = async () => {
    await setWeekDays(null);
    toast(t17('move.resetDone'));
  };

  return (
    <details className="cal-session move-workout">
      <summary>{t17('move.title')}</summary>
      <div className="stack-sm">
        <p className="small muted">{t17('move.hint')}</p>
        {targets.length === 0 ? (
          <p className="small">{t17('move.none')}</p>
        ) : (
          <div className="ex-actions">
            {targets.map((d) => (
              <button key={d} type="button" className="btn btn-secondary" onClick={() => void move(d)}>
                {t17('move.to', { weekday: dayName(d) })}
              </button>
            ))}
          </div>
        )}
        {moved && (
          <button type="button" className="btn btn-ghost" onClick={() => void reset()}>
            {t17('move.reset')}
          </button>
        )}
      </div>
    </details>
  );
}
