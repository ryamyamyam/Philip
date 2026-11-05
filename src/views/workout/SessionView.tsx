import { useEffect, useMemo, useState } from 'react';
import { DialogBar } from '../../components/DialogBar';
import { GymCharacter } from '../../components/GymCharacter';
import { Icon } from '../../components/Icon';
import { StatRow } from '../../components/StatRow';
import { addTm, saveWorkoutSession, setSlotChoice } from '../../db/repo';
import { newId } from '../../db/db';
import type { CycleRecord, TmRecord, TrainingProgram, WorkoutSession } from '../../db/types';
import { t, type StringKey } from '../../i18n';
import { todayYmd } from '../../lib/date';
import { parseDecimal } from '../../lib/numbers';
import { exerciseFor, menuSlot, slotKey, type ExerciseId, type Slot } from '../../lib/training/exercises';
import { DAY_LIFT, DELOAD_WEEK, epley, tmFromOneRm, type LiftId } from '../../lib/training/program';
import { nextSessionRef, tmsForCycle } from '../../lib/training/progress';
import { buildSession, SESSION_BUDGET_MIN, type PlannedSession } from '../../lib/training/session';
import { createSession, lastSetsFor, summarize, toSessionExercise, type SessionSummary } from '../../lib/training/sessionLog';
import { useUI } from '../../ui';
import { ExerciseCard } from './ExerciseCard';
import { UnitSwitch } from './SetupView';
import { fmtBoth, fmtIn, fromDisplay, fmtRest } from './units';

const LIFT_KEY: Record<LiftId, StringKey> = { squat: 'exercise.squat', bench: 'exercise.bench', rdl: 'exercise.rdl', ohp: 'exercise.ohp' };

interface Props {
  program: TrainingProgram;
  cycle: CycleRecord;
  sessions: readonly WorkoutSession[];
  tmHistory: readonly TmRecord[];
  choices: Readonly<Record<string, ExerciseId>>;
  open: WorkoutSession | null;
}

/** Today's session (Story 5 §5, T-013): start screen, live log, finish summary. */
export function SessionView({ program, cycle, sessions, tmHistory, choices, open }: Props) {
  const [summary, setSummary] = useState<{ s: SessionSummary; lift: LiftId } | null>(null);
  if (summary) return <Summary summary={summary.s} lift={summary.lift} unit={program.weightUnit} />;
  if (open) return <LiveSession program={program} session={open} sessions={sessions} choices={choices} cycle={cycle} tmHistory={tmHistory} onFinished={setSummary} />;
  return <StartScreen program={program} cycle={cycle} sessions={sessions} tmHistory={tmHistory} choices={choices} />;
}

function planFor(
  program: TrainingProgram,
  cycle: CycleRecord,
  sessions: readonly WorkoutSession[],
  tmHistory: readonly TmRecord[],
  choices: Readonly<Record<string, ExerciseId>>,
  week: 1 | 2 | 3 | 4,
  day: 1 | 2 | 3 | 4,
): { plan: PlannedSession | null; missing: LiftId | null } {
  const tms = tmsForCycle(tmHistory, cycle.index);
  const lift = DAY_LIFT[day];
  if (tms[lift] === null) return { plan: null, missing: lift };
  return {
    plan: buildSession({
      cycle: cycle.index,
      week,
      day,
      phase: cycle.phase,
      tms: { squat: tms.squat ?? 0, bench: tms.bench ?? 0, rdl: tms.rdl ?? 0, ohp: tms.ohp ?? 0 },
      choices,
      lastSets: (id) => lastSetsFor(sessions, id),
      bar: program.bar,
      weightUnit: program.weightUnit,
    }),
    missing: null,
  };
}

function StartScreen({ program, cycle, sessions, tmHistory, choices }: Omit<Props, 'open'>) {
  const ref = nextSessionRef(sessions, cycle.index);
  const { plan, missing } = ref ? planFor(program, cycle, sessions, tmHistory, choices, ref.week, ref.day) : { plan: null, missing: null };
  if (!ref) return <p>{t('session.cycleDone')}</p>;
  if (missing) return <Calibration lift={missing} cycle={cycle.index} unit={program.weightUnit} />;
  if (!plan) return null;
  const start = () => void saveWorkoutSession(createSession(plan, newId(), todayYmd(), Date.now()));
  const skipDay = () => {
    const s = createSession(plan, newId(), todayYmd(), Date.now());
    void saveWorkoutSession({ ...s, status: 'skipped', finishedAt: Date.now() });
  };
  const deload = plan.week === DELOAD_WEEK;
  return (
    <div className="stack">
      <DialogBar speaker={t('coach.speaker')} portrait={<GymCharacter pose={deload ? 'cross-smug' : 'point-down-smirk'} framing="bust" scale={2} className="pm-dialog-portrait" />}>
        {t(deload ? 'session.startDeload' : 'session.startLine', { lift: t(LIFT_KEY[plan.lift]) })}
      </DialogBar>
      <section className="card stack-sm" aria-labelledby="start-h">
        <h2 id="start-h">{t('home.workout.dayTitle', { day: plan.day, lift: t(LIFT_KEY[plan.lift]) })}</h2>
        <p className="num">
          {t('home.workout.blockLine', { block: plan.block, week: plan.week })} · {t('home.workout.minutes', { n: plan.estMinutes })}
        </p>
        <ul className="start-list">
          {plan.exercises.map((e) => (
            <PreviewRow key={e.slot} e={e} day={plan.day} block={plan.block} choices={choices} />
          ))}
        </ul>
        <p className="small muted">{t('session.checkHint')}</p>
      </section>
      <button type="button" className="btn btn-primary btn-block" onClick={start}>
        {t('session.start')}
      </button>
      <button type="button" className="btn btn-ghost btn-block" onClick={skipDay}>
        {t('session.skipDay')}
      </button>
    </div>
  );
}

/**
 * One line of the day's preview. Accessories open Philip's approved swaps on tap (owner: "let me click
 * the item I don't have during the checking phase and swap it"). The pick sticks for that slot.
 */
function PreviewRow({
  e,
  day,
  block,
  choices,
}: {
  e: PlannedSession['exercises'][number];
  day: PlannedSession['day'];
  block: PlannedSession['block'];
  choices: Readonly<Record<string, ExerciseId>>;
}) {
  const [open, setOpen] = useState(false);
  const sets = t('session.sets', { n: e.prescription.filter((p) => p.kind !== 'warmup').length });
  const name = t(`exercise.${e.exerciseId}` as StringKey);
  if (e.slot === 'main') {
    return (
      <li className="num">
        <span className="pm-pill pm-pill-quiet">{t('session.slot.main')}</span> {name} · {sets}
      </li>
    );
  }
  const slot = e.slot as Slot;
  const m = menuSlot(day, slot, block);
  const current = exerciseFor(day, slot, block, choices);
  return (
    <li className="num preview-row">
      <button type="button" className="preview-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="pm-pill pm-pill-quiet">{e.slot}</span> {name} · {sets}
        <span className="preview-swap small">{t('session.swap')}</span>
      </button>
      {open && (
        <div className="ex-swap" role="radiogroup" aria-label={t('session.swapTitle')}>
          {[m.pick, ...m.swaps].map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={current === id}
              className="btn btn-sm btn-secondary menu-option"
              onClick={() => {
                setOpen(false);
                void setSlotChoice(slotKey(day, slot, block), id);
              }}
            >
              {current === id && <Icon name="check" />} {t(`exercise.${id}` as StringKey)}
              {id === m.pick ? ` · ${t('session.philipsPick')}` : ''}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

function Calibration({ lift, cycle, unit: defaultUnit }: { lift: LiftId; cycle: number; unit: 'kg' | 'lb' }) {
  const [unit, setUnit] = useState(defaultUnit);
  const [w, setW] = useState('');
  const [r, setR] = useState('');
  const kg = parseDecimal(w);
  const reps = parseDecimal(r);
  const ok = kg !== null && Number.isFinite(kg) && kg > 0 && reps !== null && Number.isInteger(reps) && reps >= 1 && reps <= 10;
  const tm = ok ? tmFromOneRm(epley(fromDisplay(kg, unit), reps)) : null;
  return (
    <div className="stack">
      <DialogBar speaker={t('coach.speaker')} portrait={<GymCharacter pose="cross-unimpressed" framing="bust" scale={2} className="pm-dialog-portrait" />}>
        {t('calib.line', { lift: t(LIFT_KEY[lift]) })}
      </DialogBar>
      <section className="card stack-sm" aria-labelledby="calib-h">
        <div className="setup-head">
          <h2 id="calib-h">{t('calib.title', { lift: t(LIFT_KEY[lift]) })}</h2>
          <UnitSwitch value={unit} onChange={setUnit} label={t('setup.entryUnit')} />
        </div>
        <p>{t('calib.how')}</p>
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
        {tm !== null && <p className="num">{t('calib.result', { tm: fmtIn(tm, unit) })}</p>}
      </section>
      <button type="button" className="btn btn-primary btn-block" disabled={tm === null} onClick={() => tm !== null && void addTm({ lift, tmKg: tm, effectiveCycle: cycle, reason: 'setup' })}>
        {t('calib.save')}
      </button>
    </div>
  );
}

function useNow(ms: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

function LiveSession({
  program,
  session,
  sessions,
  choices,
  cycle,
  tmHistory,
  onFinished,
}: {
  program: TrainingProgram;
  session: WorkoutSession;
  sessions: readonly WorkoutSession[];
  choices: Readonly<Record<string, ExerciseId>>;
  cycle: CycleRecord;
  tmHistory: readonly TmRecord[];
  onFinished: (s: { s: SessionSummary; lift: LiftId }) => void;
}) {
  const [unit, setUnit] = useState(program.weightUnit);
  const [restEnds, setRestEnds] = useState<number | null>(null);
  const now = useNow(1000);
  const elapsedMin = Math.floor((now - session.startedAt) / 60000);
  const [restDur, setRestDur] = useState(0);
  const restLeft = restEnds === null ? 0 : Math.min(restDur, Math.ceil((restEnds - now) / 1000));
  const lift = DAY_LIFT[session.day];
  const over = elapsedMin >= SESSION_BUDGET_MIN;

  useEffect(() => {
    if (restEnds !== null && restLeft <= 0) setRestEnds(null);
  }, [restEnds, restLeft]);

  const save = (next: WorkoutSession) => void saveWorkoutSession(next);
  const swap = (index: number, to: ExerciseId) => {
    const ex = session.exercises[index];
    if (!ex || ex.slot === 'main') return;
    const slot = ex.slot as Slot;
    const nextChoices = { ...choices, [slotKey(session.day, slot, session.block)]: to };
    const { plan } = planFor(program, cycle, sessions, tmHistory, nextChoices, session.week, session.day);
    const fresh = plan?.exercises.find((e) => e.slot === slot);
    if (!fresh) return;
    void setSlotChoice(slotKey(session.day, slot, session.block), to);
    save({
      ...session,
      exercises: session.exercises.map((e, i) =>
        i === index ? { ...toSessionExercise(fresh), swappedFrom: e.swappedFrom ?? e.exerciseId, note: e.note } : e,
      ),
    });
  };
  const finish = () => {
    const done: WorkoutSession = { ...session, status: 'done', finishedAt: Date.now() };
    save(done);
    onFinished({ s: summarize(done, sessions, Date.now()), lift });
  };

  return (
    <div className="stack session">
      <header className="session-head">
        <div>
          <h2 className="pm-display">{t('home.workout.dayTitle', { day: session.day, lift: t(LIFT_KEY[lift]) })}</h2>
          <p className="small num">
            {t('home.workout.blockLine', { block: session.block, week: session.week })} ·{' '}
            {t('session.elapsed', { n: elapsedMin, est: session.estMinutes })}
          </p>
        </div>
        <UnitSwitch value={unit} onChange={setUnit} label={t('session.unitFirst')} />
      </header>
      {over && (
        <DialogBar speaker={t('coach.speaker')} live portrait={<GymCharacter pose="phone" framing="bust" scale={2} className="pm-dialog-portrait" />}>
          {t('session.overTime')}
        </DialogBar>
      )}
      {session.exercises.map((ex, i) => (
        <ExerciseCard
          key={`${ex.slot}-${ex.exerciseId}`}
          ex={ex}
          day={session.day}
          block={session.block}
          unit={unit}
          bar={program.bar}
          onChange={(next) => save({ ...session, exercises: session.exercises.map((e, j) => (j === i ? next : e)) })}
          onRest={(sec) => {
            setRestDur(sec);
            setRestEnds(Date.now() + sec * 1000);
          }}
          onSwap={(to) => swap(i, to)}
        />
      ))}
      <button type="button" className="btn btn-primary btn-block" onClick={finish}>
        {t('session.finish')}
      </button>
      {restEnds !== null && restLeft > 0 && (
        <div className="rest-bar" role="timer" aria-label={t('session.restLabel')}>
          <span className="pm-display num">{t('session.restLeft', { t: fmtRest(restLeft) })}</span>
          <button type="button" className="btn btn-sm" onClick={() => setRestEnds(null)}>
            {t('session.restSkip')}
          </button>
        </div>
      )}
    </div>
  );
}

function Summary({ summary, lift, unit }: { summary: SessionSummary; lift: LiftId; unit: 'kg' | 'lb' }) {
  const { navigate } = useUI();
  const line: StringKey = summary.pain ? 'summary.pain' : summary.pr ? 'summary.pr' : summary.missed ? 'summary.miss' : 'summary.done';
  const pose = summary.pr ? 'fist-pump' : summary.missed ? 'cross-unimpressed' : 'cross-smug';
  const rows = useMemo(
    () => [
      [t('summary.sets'), t('summary.setsValue', { done: summary.setsDone, total: summary.setsTotal })],
      [t('summary.time'), t('summary.timeValue', { n: summary.minutes })],
      ...(summary.e1rmKg !== null ? [[t('summary.e1rm', { lift: t(LIFT_KEY[lift]) }), fmtBoth(summary.e1rmKg, unit)]] : []),
    ],
    [summary, lift, unit],
  );
  return (
    <div className="stack">
      <DialogBar speaker={summary.pain ? undefined : t('coach.speaker')} portrait={summary.pain ? undefined : <GymCharacter pose={pose} framing="bust" scale={2} className="pm-dialog-portrait" />}>
        {t(line)}
      </DialogBar>
      <section className="card stack-sm" aria-labelledby="sum-h">
        <h2 id="sum-h">{t('summary.title')}</h2>
        {summary.pr && <p className="pm-pill">{t('summary.prBadge')}</p>}
        <dl className="pm-rows">
          {rows.map(([k, v]) => (
            <StatRow key={k} label={k ?? ''} value={v ?? ''} />
          ))}
        </dl>
      </section>
      <button type="button" className="btn btn-primary btn-block" onClick={() => navigate('home')}>
        {t('summary.home')}
      </button>
    </div>
  );
}
