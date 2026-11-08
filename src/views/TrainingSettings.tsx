import { useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { newId } from '../db/db';
import { addTm, resetTrainingProgram, saveWorkoutSession, setSlotChoice, setTrainingDays, updateTrainingProgram } from '../db/repo';
import type { IsoWeekday, TrainingProgram, WorkoutSession } from '../db/types';
import { DEFAULT_TRAINING_DAYS, squatRdlTooClose, TRAINING_DAYS_PER_WEEK, trainingDaysOrDefault } from '../lib/training/schedule';
import { useSlotChoices, useTrainingProgram, useWorkoutSessions } from '../hooks/useData';
import { t, type StringKey } from '../i18n';
import { todayYmd } from '../lib/date';
import { parseDecimal } from '../lib/numbers';
import { exerciseFor, menuSlot, slotKey, type ExerciseId } from '../lib/training/exercises';
import { KG_PLATES, LB_PLATES, type PlateUnit } from '../lib/training/plates';
import { blockForCycle, epley, LIFTS, tmFromOneRm, type Block, type Day, type LiftId } from '../lib/training/program';
import { useUI } from '../ui';
import { UnitSwitch } from './workout/SetupView';
import { fmtIn, fromDisplay } from './workout/units';

const LIFT_KEY: Record<LiftId, StringKey> = { squat: 'exercise.squat', bench: 'exercise.bench', rdl: 'exercise.rdl', ohp: 'exercise.ohp' };
const exName = (id: string) => t(`exercise.${id}` as StringKey);

/** Settings › Training (Story 5 §7, T-014). */
export function TrainingSettings() {
  const program = useTrainingProgram();
  const sessions = useWorkoutSessions();
  const choices = useSlotChoices();
  const { navigate } = useUI();
  if (program === undefined || !sessions || !choices) return null;
  return (
    <section className="card stack" aria-labelledby="training-h">
      <h2 id="training-h">{t('training.title')}</h2>
      {!program ? (
        <button type="button" className="btn btn-secondary btn-block" onClick={() => navigate('workout')}>
          {t('training.setUp')}
        </button>
      ) : (
        <>
          <TrainingDays program={program} />
          <Retest program={program} />
          <BarSettings program={program} />
          <Menu program={program} choices={Object.fromEntries(choices.map((c) => [c.slotKey, c.exerciseId])) as Record<string, ExerciseId>} />
          <Danger program={program} sessions={sessions} />
        </>
      )}
    </section>
  );
}

/** Story 6 §3.1: the weekdays Philip plans workout dates on. Exactly 4; Philip's pick is the default. */
function TrainingDays({ program }: { program: TrainingProgram }) {
  const toast = useToast();
  const [days, setDays] = useState<IsoWeekday[]>(() => trainingDaysOrDefault(program.trainingDays));
  const isPick = (d: readonly IsoWeekday[]) => d.length === DEFAULT_TRAINING_DAYS.length && d.every((x) => DEFAULT_TRAINING_DAYS.includes(x));
  const toggle = (d: IsoWeekday) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b)));
  const ok = days.length === TRAINING_DAYS_PER_WEEK;
  return (
    <div className="stack-sm" role="group" aria-labelledby="days-h">
      <h3 id="days-h">{t('training.days')}</h3>
      <p className="small muted">{t('training.daysHint')}</p>
      <div className="days-row">
        {([1, 2, 3, 4, 5, 6, 7] as const).map((d) => (
          <button key={d} type="button" className="btn btn-sm btn-secondary day-toggle" aria-pressed={days.includes(d)} onClick={() => toggle(d)}>
            {t(`training.wd.${d}` as StringKey)}
          </button>
        ))}
      </div>
      <p className="small num" aria-live="polite">
        {isPick(days) ? t('training.daysPick') : t('training.daysCount', { n: days.length })}
      </p>
      {ok && squatRdlTooClose(days) && <p className="small">{t('training.daysClose')}</p>}
      <div className="ex-actions">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!ok}
          onClick={() => ok && void setTrainingDays(isPick(days) ? null : days).then(() => toast(t('training.daysSaved')))}
        >
          {t('training.daysSave')}
        </button>
        {!isPick(days) && (
          <button type="button" className="btn btn-ghost" onClick={() => setDays([...DEFAULT_TRAINING_DAYS])}>
            {t('training.daysUsePick')}
          </button>
        )}
      </div>
    </div>
  );
}

function Retest({ program }: { program: TrainingProgram }) {
  const toast = useToast();
  const [lift, setLift] = useState<LiftId>('squat');
  const [unit, setUnit] = useState<PlateUnit>('kg');
  const [w, setW] = useState('');
  const [r, setR] = useState('');
  const kg = parseDecimal(w);
  const reps = parseDecimal(r);
  const ok = kg !== null && Number.isFinite(kg) && kg > 0 && reps !== null && Number.isInteger(reps) && reps >= 3 && reps <= 10;
  const tm = ok ? tmFromOneRm(epley(fromDisplay(kg, unit), reps)) : null;
  return (
    <div className="stack-sm">
      <div className="setup-head">
        <h3>{t('training.retest')}</h3>
        <UnitSwitch value={unit} onChange={setUnit} label={t('setup.entryUnit')} />
      </div>
      <p className="small muted">{t('training.retestHint')}</p>
      <div className="segmented segmented-sm" role="radiogroup" aria-label={t('training.lift')}>
        {LIFTS.map((l) => (
          <button key={l} type="button" role="radio" aria-checked={lift === l} onClick={() => setLift(l)}>
            {t(`training.liftShort.${l}` as StringKey)}
          </button>
        ))}
      </div>
      <div className="setup-inputs">
        <label className="field">
          <span className="field-label">{t(unit === 'kg' ? 'setup.weightKg' : 'setup.weightLb')}</span>
          <input className="input num" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">{t('setup.reps')}</span>
          <input className="input num" inputMode="numeric" value={r} onChange={(e) => setR(e.target.value)} />
        </label>
      </div>
      {tm !== null && <p className="num small">{t('calib.result', { tm: fmtIn(tm, unit) })}</p>}
      <button
        type="button"
        className="btn btn-secondary btn-block"
        disabled={tm === null}
        onClick={() => {
          if (tm === null) return;
          void addTm({ lift, tmKg: tm, effectiveCycle: Math.max(1, program.currentCycle), reason: 'retest' }).then(() => {
            toast(t('training.retestSaved', { lift: t(LIFT_KEY[lift]) }));
            setW('');
            setR('');
          });
        }}
      >
        {t('training.retestSave')}
      </button>
    </div>
  );
}

function BarSettings({ program }: { program: TrainingProgram }) {
  const toast = useToast();
  const [bar, setBar] = useState(String(program.bar.barKg));
  const [plateUnit, setPlateUnit] = useState<PlateUnit>(program.bar.plateUnit);
  const barKg = parseDecimal(bar);
  const ok = barKg !== null && Number.isFinite(barKg) && barKg >= 5 && barKg <= 30;
  return (
    <div className="stack-sm">
      <h3>{t('setup.bar')}</h3>
      <label className="field">
        <span className="field-label">{t('setup.barKg')}</span>
        <input className="input num" inputMode="decimal" value={bar} aria-invalid={!ok || undefined} onChange={(e) => setBar(e.target.value)} />
      </label>
      <div className="setup-head">
        <span className="field-label">{t('setup.plates')}</span>
        <UnitSwitch value={plateUnit} onChange={setPlateUnit} label={t('setup.plates')} />
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-block"
        disabled={!ok}
        onClick={() =>
          ok &&
          void updateTrainingProgram({
            bar: { barKg, plateUnit, plates: [...(plateUnit === 'lb' ? LB_PLATES : KG_PLATES)] },
            weightUnit: plateUnit,
          }).then(() => toast(t('training.barSaved')))
        }
      >
        {t('training.barSave')}
      </button>
    </div>
  );
}

function Menu({ program, choices }: { program: TrainingProgram; choices: Record<string, ExerciseId> }) {
  const [day, setDay] = useState<Day>(1);
  const [block, setBlock] = useState<Block>(blockForCycle(Math.max(1, program.currentCycle)));
  return (
    <div className="stack-sm">
      <h3>{t('training.menu')}</h3>
      <p className="small muted">{t('training.menuHint')}</p>
      <div className="segmented segmented-sm" role="radiogroup" aria-label={t('training.day')}>
        {([1, 2, 3, 4] as const).map((d) => (
          <button key={d} type="button" role="radio" aria-checked={day === d} onClick={() => setDay(d)}>
            {t('plan.dayN', { n: d })}
          </button>
        ))}
      </div>
      <div className="segmented segmented-sm" role="radiogroup" aria-label={t('training.block')}>
        {(['A', 'B', 'C', 'D'] as const).map((b) => (
          <button key={b} type="button" role="radio" aria-checked={block === b} onClick={() => setBlock(b)}>
            {t('training.blockN', { b })}
          </button>
        ))}
      </div>
      {(['A1', 'A2', 'B'] as const).map((slot) => {
        const m = menuSlot(day, slot, block);
        const current = exerciseFor(day, slot, block, choices);
        return (
          <fieldset key={slot} className="setup-lift">
            <legend>{t(`session.slot.${slot}` as StringKey)}</legend>
            <div className="menu-options" role="radiogroup" aria-label={t(`session.slot.${slot}` as StringKey)}>
              {[m.pick, ...m.swaps].map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={current === id}
                  className="btn btn-sm btn-secondary menu-option"
                  onClick={() => void setSlotChoice(slotKey(day, slot, block), id)}
                >
                  {current === id && <Icon name="check" />} {exName(id)}
                  {id === m.pick ? ` · ${t('session.philipsPick')}` : ''}
                </button>
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

function Danger({ program, sessions }: { program: TrainingProgram; sessions: readonly WorkoutSession[] }) {
  const toast = useToast();
  const [confirm, setConfirm] = useState<'next' | 'reset' | null>(null);
  // Ends the cycle early: an open session is closed as done (its log is kept), every day not yet
  // trained is recorded as skipped, and Workout moves on to the next cycle's briefing.
  const skipRest = async () => {
    const c = program.currentCycle;
    if (c < 1) return;
    const now = Date.now();
    for (const s of sessions) {
      if (s.cycle === c && s.status === 'in_progress') await saveWorkoutSession({ ...s, status: 'done', finishedAt: now });
    }
    for (const week of [1, 2, 3, 4] as const) {
      for (const day of [1, 2, 3, 4] as const) {
        if (sessions.some((s) => s.cycle === c && s.week === week && s.day === day)) continue;
        await saveWorkoutSession({
          id: newId(),
          date: todayYmd(),
          cycle: c,
          block: blockForCycle(c),
          week,
          day,
          status: 'skipped',
          estMinutes: 0,
          startedAt: now,
          finishedAt: now,
          exercises: [],
        });
      }
    }
  };
  return (
    <div className="stack-sm">
      {program.currentCycle > 0 && (
        <button type="button" className="btn btn-secondary btn-block" onClick={() => setConfirm('next')}>
          {t('training.nextNow')}
        </button>
      )}
      <button type="button" className="btn btn-danger btn-block" onClick={() => setConfirm('reset')}>
        {t('training.reset')}
      </button>
      {confirm === 'next' && (
        <ConfirmDialog
          title={t('training.nextNowTitle')}
          body={<p>{t('training.nextNowBody')}</p>}
          confirmLabel={t('training.nextNowConfirm')}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            void skipRest().then(() => toast(t('training.nextNowDone')));
          }}
        />
      )}
      {confirm === 'reset' && (
        <ConfirmDialog
          title={t('training.resetTitle')}
          body={<p>{t('training.resetBody')}</p>}
          confirmLabel={t('training.resetConfirm')}
          destructive
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            void resetTrainingProgram().then(() => toast(t('training.resetDone')));
          }}
        />
      )}
    </div>
  );
}
