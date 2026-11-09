import { useState } from 'react';
import type { CycleRecord, TmRecord, TrainingProgram, WorkoutSession } from '../../db/types';
import { t, type StringKey } from '../../i18n';
import { exerciseFor, type ExerciseId } from '../../lib/training/exercises';
import { blockForCycle, DAY_LIFT, DELOAD_WEEK, LIFTS, tmIncrement, type Day, type LiftId, type Week } from '../../lib/training/program';
import { tmsForCycle } from '../../lib/training/progress';
import { buildSession } from '../../lib/training/session';
import { lastSetsFor } from '../../lib/training/sessionLog';
import { fmtIn } from './units';
import { infoFor } from '../../lib/training/sessionLog';

const DAYS: Day[] = [1, 2, 3, 4];
const WEEKS: Week[] = [1, 2, 3, 4];
const LIFT_KEY: Record<LiftId, StringKey> = { squat: 'exercise.squat', bench: 'exercise.bench', rdl: 'exercise.rdl', ohp: 'exercise.ohp' };
const PHASE_KEY = { lose: 'home.phase.cut', maintain: 'home.phase.maintain', gain: 'home.phase.bulk' } as const;
const exName = (id: string) => t(`exercise.${id}` as StringKey);

/**
 * Cycle plan (Story 5 §6, T-014): read-only. Block, phase and TMs, why this block, week tabs with every
 * ordered weight (finished days show what you actually did), and a preview of the next block.
 */
export function PlanView({
  program,
  cycle,
  sessions,
  tmHistory,
  choices,
}: {
  program: TrainingProgram;
  cycle: CycleRecord;
  sessions: readonly WorkoutSession[];
  tmHistory: readonly TmRecord[];
  choices: Readonly<Record<string, ExerciseId>>;
}) {
  const unit = program.weightUnit;
  const tms = tmsForCycle(tmHistory, cycle.index);
  const [week, setWeek] = useState<Week>(() => {
    const open = WEEKS.find((w) => DAYS.some((d) => !sessions.some((s) => s.cycle === cycle.index && s.week === w && s.day === d && s.status !== 'in_progress')));
    return open ?? 1;
  });
  const nextBlock = blockForCycle(cycle.index + 1);

  return (
    <div className="stack plan">
      <section className="card stack-sm" aria-labelledby="plan-h">
        <h2 id="plan-h">{t('brief.title', { n: cycle.index, block: cycle.block })}</h2>
        <p className="small">{t(`plan.focus.${cycle.block}` as StringKey)}</p>
        <p className="small num">{t('plan.phase', { phase: t(PHASE_KEY[cycle.phase]) })}</p>
        <ul className="plan-tms num">
          {LIFTS.map((l) => (
            <li key={l}>
              {t(LIFT_KEY[l])}: {tms[l] !== null ? t('plan.tm', { tm: fmtIn(tms[l] ?? 0, unit) }) : t('plan.tmNone')}
            </li>
          ))}
        </ul>
      </section>

      <details className="card plan-why">
        <summary>{t('plan.whyTitle')}</summary>
        <p>{t(`plan.why.${cycle.block}` as StringKey)}</p>
        <p className="small muted">{t('plan.evidence')}</p>
      </details>

      <div className="segmented" role="tablist" aria-label={t('plan.weeks')}>
        {WEEKS.map((w) => (
          <button key={w} type="button" role="tab" aria-selected={week === w} aria-pressed={week === w} onClick={() => setWeek(w)}>
            {w === DELOAD_WEEK ? t('home.deload') : t('plan.weekN', { n: w })}
          </button>
        ))}
      </div>

      {DAYS.map((day) => {
        const lift = DAY_LIFT[day];
        const done = sessions.find((s) => s.cycle === cycle.index && s.week === week && s.day === day && s.status !== 'in_progress');
        const known = LIFTS.every((l) => tms[l] !== null);
        const plan = known
          ? buildSession({
              cycle: cycle.index,
              week,
              day,
              phase: cycle.phase,
              tms: { squat: tms.squat ?? 0, bench: tms.bench ?? 0, rdl: tms.rdl ?? 0, ohp: tms.ohp ?? 0 },
              choices,
              lastSets: (id) => lastSetsFor(sessions, id),
              bar: program.bar,
              weightUnit: unit,
            })
          : null;
        return (
          <section key={day} className="card stack-sm plan-day" aria-labelledby={`plan-d${day}`}>
            <div className="setup-head">
              <h3 id={`plan-d${day}`}>{t('home.workout.dayTitle', { day, lift: t(LIFT_KEY[lift]) })}</h3>
              {done && <span className="pm-pill">{t(done.status === 'done' ? 'plan.done' : 'plan.skipped')}</span>}
            </div>
            {plan ? (
              <>
                <p className="small muted num">{t('home.workout.minutes', { n: plan.estMinutes })}</p>
                <ul className="plan-ex">
                  {plan.exercises.map((e) => {
                    const work = e.prescription.filter((p) => p.kind !== 'warmup');
                    const logged = done?.exercises.find((x) => x.slot === e.slot);
                    const best = logged?.actual.filter((a) => a.done && a.kg !== null).sort((a, b) => (b.kg ?? 0) - (a.kg ?? 0))[0];
                    return (
                      <li key={e.slot} className="num">
                        <strong>{exName(e.exerciseId)}</strong>{' '}
                        {e.slot === 'main'
                          ? work.map((p) => `${p.kg !== null ? fmtIn(p.kg, unit) : '?'}×${p.repMax}${p.kind === 'amrap' ? '+' : ''}`).join(' · ')
                          : `${work.length}×${work[0]?.repMin === work[0]?.repMax ? work[0]?.repMax : `${work[0]?.repMin}–${work[0]?.repMax}`}${work[0]?.kg != null ? ` @ ${infoFor(e.exerciseId).pair ? t('session.pair', { w: fmtIn(work[0].kg, unit) }) : fmtIn(work[0].kg, unit)}` : ''}`}
                        {best && <span className="small plan-did"> {t('plan.did', { weight: fmtIn(best.kg ?? 0, unit), reps: best.reps ?? 0 })}</span>}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p className="small muted">{t('plan.needsTm')}</p>
            )}
          </section>
        );
      })}

      <section className="card stack-sm plan-next" aria-labelledby="plan-next">
        <h2 id="plan-next">{t('plan.nextTitle', { block: nextBlock })}</h2>
        <p className="small">{t(`plan.focus.${nextBlock}` as StringKey)}</p>
        <ul className="plan-tms num">
          {LIFTS.map((l) =>
            tms[l] !== null ? (
              <li key={l}>
                {t(LIFT_KEY[l])}: {t('plan.tmNext', { tm: fmtIn((tms[l] ?? 0) + tmIncrement(l, cycle.phase), unit) })}
              </li>
            ) : null,
          )}
        </ul>
        <p className="small muted">{t('plan.nextNote')}</p>
        <ul className="plan-ex">
          {DAYS.map((d) => (
            <li key={d} className="small">
              <strong>{t('plan.dayN', { n: d })}</strong>{' '}
              {(['A1', 'A2', 'B'] as const).map((slot) => exName(exerciseFor(d, slot, nextBlock, choices))).join(' · ')}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
