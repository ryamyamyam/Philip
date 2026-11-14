import { useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DialogBar } from '../../components/DialogBar';
import { GymCharacter } from '../../components/GymCharacter';
import { Icon } from '../../components/Icon';
import { StatRow } from '../../components/StatRow';
import { addTm, allCoachNotes, applyCheckin, applyReview, deleteWorkoutSession, isPastCycleLog, META, saveWorkoutSession, setDayOrder, setSlotChoice, type ReviewChange } from '../../db/repo';
import { exerciseHistory } from '../../lib/coach/brief';
import { useMeta, useProfile, useWeightEntries } from '../../hooks/useData';
import { beep, cancelRestAlert, pushConfig, scheduleRestAlert, type StoredSubscription } from '../../services/restPush';
import { newId } from '../../db/db';
import type { CycleRecord, SessionExercise, TmRecord, TrainingProgram, WorkoutSession } from '../../db/types';
import { incrementKg } from '../../lib/training/plates';
import { t, type StringKey } from '../../i18n';
import { todayYmd } from '../../lib/date';
import { parseDecimal } from '../../lib/numbers';
import { exerciseFor, menuSlot, slotKey, type ExerciseId, type Slot } from '../../lib/training/exercises';
import { DAY_LIFT, DELOAD_WEEK, epley, tmFromOneRm, type LiftId } from '../../lib/training/program';
import { nextSessionRef, tmsForCycle } from '../../lib/training/progress';
import { buildSession, liftOutlook, SESSION_BUDGET_MIN, type PlannedSession } from '../../lib/training/session';
import { createSession, infoFor, lastSessionIdFor, lastSetsFor, summarize, swapInSession, type SessionSummary } from '../../lib/training/sessionLog';
import { fmtDate } from '../../lib/format';
import { applyOrder, orderOf } from '../../lib/training/order';
import { ReorderList } from './ReorderList';
import { CARDIO_MINUTES, plannedCardio } from '../../lib/training/cardio';
import { CardioCard, cardioValue } from './CardioCard';
import { CoachReport } from './CoachReport';
import { startingWeight } from '../../lib/training/cycleGoal';
import { useUI } from '../../ui';
import { ExerciseCard, type CheckinProposal } from './ExerciseCard';
import {
  adjustedTm,
  applyTodayChange,
  checkinPrompt,
  parseCoachReply,
  remainingWork,
  reviewSession,
  addLaterRest,
  checkinOptions,
  isNoChange,
  mergeOptions,
  repsShort,
  type CheckinOption,
  type CheckinFlag,
  type ReviewItem,
} from '../../lib/training/checkin';
import { UnitSwitch } from './SetupView';
import { fmtBoth, fmtIn, fromDisplay, fmtRest } from './units';
import { useCloudPaired } from '../../hooks/useCoach';

const LIFT_KEY: Record<LiftId, StringKey> = { squat: 'exercise.squat', bench: 'exercise.bench', rdl: 'exercise.rdl', ohp: 'exercise.ohp' };

interface Props {
  program: TrainingProgram;
  cycle: CycleRecord;
  sessions: readonly WorkoutSession[];
  tmHistory: readonly TmRecord[];
  choices: Readonly<Record<string, ExerciseId>>;
  open: WorkoutSession | null;
  /** Back to the calendar (Story 6): `finished` plays today's stamp press. */
  onBack?: (finished: boolean) => void;
}

/** Today's session (Story 5 §5, T-013): start screen, live log, finish summary. */
export function SessionView({ program, cycle, sessions, tmHistory, choices, open, onBack }: Props) {
  const [summary, setSummary] = useState<{ s: SessionSummary; lift: LiftId; session: WorkoutSession } | null>(null);
  if (summary) {
    // The live row, so Philip's report and chat update as they're saved.
    const live = sessions.find((s) => s.id === summary.session.id) ?? summary.session;
    return (
      <Summary summary={summary.s} lift={summary.lift} unit={program.weightUnit} session={live} cycle={cycle} tmHistory={tmHistory} program={program} choices={choices} onBack={onBack} />
    );
  }
  if (open) return <LiveSession program={program} session={open} sessions={sessions} choices={choices} cycle={cycle} tmHistory={tmHistory} onFinished={setSummary} onDiscarded={() => onBack?.(false)} />;
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
  bodyWeightKg: number | null = null,
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
      restBonusSec: cycle.restBonusSec ?? 0,
      bodyWeightKg,
      ...(program.availability ? { budgetMin: program.availability.strengthMin } : {}),
      // Story 7: a next-time order from an applied report, until the exercise is logged again.
      override: (id) => {
        const o = program.nextOverrides?.find((x) => x.exerciseId === id);
        return o && lastSessionIdFor(sessions, id) === o.afterSessionId ? o : null;
      },
    }),
    missing: null,
  };
}

/** Body weight for bodyweight-anchored starting estimates (Story 6 §6): same source rule as the briefing. */
function useBodyWeightKg(): number | null {
  const profile = useProfile();
  const weights = useWeightEntries();
  return useMemo(() => startingWeight(weights ?? [], todayYmd(), profile?.weightKg ?? null)?.kg ?? null, [weights, profile?.weightKg]);
}

function StartScreen({ program, cycle, sessions, tmHistory, choices }: Omit<Props, 'open'>) {
  const bodyWeightKg = useBodyWeightKg();
  const ref = nextSessionRef(sessions, cycle.index);
  const { plan, missing } = ref ? planFor(program, cycle, sessions, tmHistory, choices, ref.week, ref.day, bodyWeightKg) : { plan: null, missing: null };
  if (!ref) return <p>{t('session.cycleDone')}</p>;
  if (missing) return <Calibration lift={missing} cycle={cycle.index} unit={program.weightUnit} />;
  if (!plan) return null;
  // Story 12: his cardio minutes are a ceiling for the planned walk.
  const cardioPlan = program.availability ? Math.min(cycle.cardioMin ?? CARDIO_MINUTES[cycle.phase], program.availability.cardioMin) : (cycle.cardioMin ?? null);
  const opts = { cardioMin: cardioPlan, order: program.dayOrder?.[String(plan.day)] ?? null, speedUnit: program.treadmill?.scale ?? (program.weightUnit === 'lb' ? ('mph' as const) : ('kmh' as const)) };
  const start = () => void saveWorkoutSession(createSession(plan, newId(), todayYmd(), Date.now(), opts));
  const skipDay = () => {
    const s = createSession(plan, newId(), todayYmd(), Date.now(), opts);
    void saveWorkoutSession({ ...s, status: 'skipped', finishedAt: Date.now() });
  };
  const deload = plan.week === DELOAD_WEEK;
  return (
    <div className="stack">
      <DialogBar speaker={t('coach.speaker')} portrait={<GymCharacter pose={deload ? 'cross-smug' : 'point-down-smirk'} framing="bust" scale={2} className="pm-dialog-portrait" />}>
        {t(deload ? 'session.startDeload' : 'session.startLine', { lift: t(LIFT_KEY[plan.lift]), min: program.availability?.strengthMin ?? SESSION_BUDGET_MIN })}
      </DialogBar>
      <section className="card stack-sm" aria-labelledby="start-h">
        <h2 id="start-h">{t('home.workout.dayTitle', { day: plan.day, lift: t(LIFT_KEY[plan.lift]) })}</h2>
        <p className="num">
          {t('home.workout.blockLine', { block: plan.block, week: plan.week })} · {t('home.workout.minutes', { n: plan.estMinutes })}
        </p>
        <ul className="start-list">
          {applyOrder(plan.exercises, opts.order).map((e) => (
            <PreviewRow key={e.slot} e={e} day={plan.day} block={plan.block} choices={choices} />
          ))}
          <li className="num">{t('cardio.preview', { n: plannedCardio(plan.phase, 'mph', cardioPlan).planMin, min: program.availability?.strengthMin ?? SESSION_BUDGET_MIN })}</li>
        </ul>
        <p className="small muted">{t('session.checkHint')}</p>
      </section>
      <Outlook program={program} cycle={cycle} tmHistory={tmHistory} lift={plan.lift} week={plan.week} />
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

/**
 * This lift's 4 weeks at a glance, and next cycle's first week if the top sets are hit
 * (owner feedback, Nov 5: "so I can feel how much I'll grow").
 */
function Outlook({
  program,
  cycle,
  tmHistory,
  lift,
  week,
}: {
  program: TrainingProgram;
  cycle: CycleRecord;
  tmHistory: readonly TmRecord[];
  lift: LiftId;
  week: number;
}) {
  const tm = tmsForCycle(tmHistory, cycle.index)[lift];
  if (tm === null) return null;
  const o = liftOutlook(lift, tm, cycle.index, cycle.phase, program.bar);
  const unit = program.weightUnit;
  const line = (sets: { kg: number; reps: number; plus: boolean }[]) => {
    const first = sets[0];
    // Straight sets read shorter as "4 × 8 @ 199 lb".
    if (first && sets.every((x) => x.kg === first.kg && x.reps === first.reps && x.plus === first.plus)) {
      return `${sets.length} × ${first.reps}${first.plus ? '+' : ''} @ ${fmtIn(first.kg, unit)}`;
    }
    return sets.map((x) => `${fmtIn(x.kg, unit)} × ${x.reps}${x.plus ? '+' : ''}`).join(' · ');
  };
  return (
    <section className="card stack-sm" aria-labelledby="outlook-h">
      <h2 id="outlook-h">{t('outlook.title', { lift: t(LIFT_KEY[lift]) })}</h2>
      <ul className="plan-ex num outlook">
        {o.weeks.map((w) => (
          <li key={w.week} className={w.week === week ? 'is-now' : undefined} aria-current={w.week === week ? 'step' : undefined}>
            <strong>{w.week === DELOAD_WEEK ? t('home.deload') : t('plan.weekN', { n: w.week })}</strong> {line(w.sets)}
          </li>
        ))}
        <li className="outlook-next">
          <strong>{t('outlook.next', { block: o.next.block })}</strong> {line(o.next.sets)}
        </li>
      </ul>
      <p className="small muted">{t('outlook.note', { tm: fmtIn(tm, unit), next: fmtIn(o.next.tmKg, unit) })}</p>
    </section>
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

/**
 * Story 8 (battery): a clock that ticks every `ms`, only while the page is visible, and catches up
 * at once when it becomes visible again. Keep it in the smallest component that shows the time,
 * so a tick never re-renders the whole session.
 */
function useNow(ms: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let id: number | undefined;
    const tick = () => setNow(Date.now());
    const start = () => {
      window.clearInterval(id);
      id = undefined;
      if (document.visibilityState === 'hidden') return;
      tick();
      id = window.setInterval(tick, ms);
    };
    start();
    document.addEventListener('visibilitychange', start);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', start);
    };
  }, [ms]);
  return now;
}

/** Runs `fn` once at `at` (ms epoch), or right away if that's past; re-checked when the page shows again. */
function useAt(at: number | null, fn: () => void): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (at === null) return;
    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      ref.current();
    };
    const id = window.setTimeout(fire, Math.max(0, at - Date.now()));
    const onShow = () => {
      if (document.visibilityState === 'visible' && Date.now() >= at) fire();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [at]);
}

/** The ticking rest countdown. Owns its 1 s clock so the session cards don't re-render each second. */
function RestBar({ ends, dur, onSkip }: { ends: number; dur: number; onSkip: () => void }) {
  const now = useNow(1000);
  const left = Math.min(dur, Math.ceil((ends - now) / 1000));
  if (left <= 0) return null;
  return (
    <div className="rest-bar" role="timer" aria-label={t('session.restLabel')}>
      <span className="pm-display num">{t('session.restLeft', { t: fmtRest(left) })}</span>
      <button type="button" className="btn btn-sm" onClick={onSkip}>
        {t('session.restSkip')}
      </button>
    </div>
  );
}

function LiveSession({
  program,
  session,
  sessions,
  choices,
  cycle,
  tmHistory,
  onFinished,
  onDiscarded,
}: {
  program: TrainingProgram;
  session: WorkoutSession;
  sessions: readonly WorkoutSession[];
  choices: Readonly<Record<string, ExerciseId>>;
  cycle: CycleRecord;
  tmHistory: readonly TmRecord[];
  onFinished: (s: { s: SessionSummary; lift: LiftId; session: WorkoutSession }) => void;
  onDiscarded: () => void;
}) {
  const [discarding, setDiscarding] = useState(false);
  const [unit, setUnit] = useState(program.weightUnit);
  const profile = useProfile();
  const cloud = useCloudPaired();
  const bodyWeightKg = useBodyWeightKg();
  const [pending, setPending] = useState<{ index: number; order: number; proposal: CheckinProposal } | null>(null);
  const [thinking, setThinking] = useState<number | null>(null);
  const [restEnds, setRestEnds] = useState<number | null>(null);
  // Story 8: the header only shows whole minutes, so the session itself ticks once a minute.
  const now = useNow(60_000);
  const elapsedMin = Math.floor((now - session.startedAt) / 60000);
  const [restDur, setRestDur] = useState(0);
  const lift = DAY_LIFT[session.day];
  const over = !session.editing && elapsedMin >= (program.availability?.strengthMin ?? SESSION_BUDGET_MIN);

  // Story 6 §8: rest end → "Time's up" banner (8 s), a beep, and a push alert scheduled at rest start.
  const soundOff = useMeta<boolean>(META.restSound) === false;
  const alertSub = useMeta<StoredSubscription>(META.restAlertSub) ?? null;
  const push = pushConfig();
  const [timesUp, setTimesUp] = useState<{ endedAt: number; shownAt: number } | null>(null);
  const alertPending = useRef(false);
  const cancelAlert = () => {
    if (alertPending.current && push && alertSub) void cancelRestAlert(push, alertSub);
    alertPending.current = false;
  };
  useAt(restEnds, () => {
    if (restEnds === null) return;
    const shownAt = Date.now();
    setTimesUp({ endedAt: restEnds, shownAt });
    alertPending.current = false; // the Worker already sent (or will send) it
    if (!soundOff && document.visibilityState === 'visible' && shownAt - restEnds < 3000) beep();
    setRestEnds(null);
  });
  useAt(timesUp ? timesUp.shownAt + 8000 : null, () => setTimesUp(null));
  // Leaving the session (finish, discard, back) cancels a pending alert.
  const cancelRef = useRef(cancelAlert);
  cancelRef.current = cancelAlert;
  useEffect(() => () => cancelRef.current(), []);

  const next = nextSetLabel(session);
  const startRest = (sec: number) => {
    const ends = Date.now() + sec * 1000;
    setRestDur(sec);
    setRestEnds(ends);
    setTimesUp(null);
    if (push && alertSub) {
      const body = next ? t('session.timesUpNextBody', { name: next.name, n: next.n }) : '';
      alertPending.current = true;
      void scheduleRestAlert(push, alertSub, ends, t('session.timesUp'), body);
    }
  };
  const stopRest = () => {
    setRestEnds(null);
    cancelAlert();
  };

  const save = (next: WorkoutSession) => void saveWorkoutSession(next);
  // Story 6 §7: `keep` writes the sticky slot choice; otherwise the swap is for today only.
  /** First-set weight Philip would order for a swap option (shown in the swap list). */
  const swapPreview = (index: number, to: ExerciseId): number | null => {
    const ex = session.exercises[index];
    if (!ex || ex.slot === 'main') return null;
    const slot = ex.slot as Slot;
    const { plan } = planFor(program, cycle, sessions, tmHistory, { ...choices, [slotKey(session.day, slot, session.block)]: to }, session.week, session.day, bodyWeightKg);
    return plan?.exercises.find((e) => e.slot === slot)?.prescription[0]?.kg ?? null;
  };
  const swap = (index: number, to: ExerciseId, keep = false) => {
    const ex = session.exercises[index];
    if (!ex || ex.slot === 'main') return;
    const slot = ex.slot as Slot;
    const nextChoices = { ...choices, [slotKey(session.day, slot, session.block)]: to };
    const { plan } = planFor(program, cycle, sessions, tmHistory, nextChoices, session.week, session.day, bodyWeightKg);
    const fresh = plan?.exercises.find((e) => e.slot === slot);
    if (!fresh) return;
    const next = swapInSession(session, index, fresh);
    if (!next) return;
    if (keep) void setSlotChoice(slotKey(session.day, slot, session.block), to);
    save(next);
  };
  // Owner tells Philip how a set went (Nov 5). OBS-097D6D: a flag tap answers at once with Philip's
  // options (rules, no network); a typed note can also go to Gemini, whose read is added as one more option.
  const unitStep = incrementKg(program.weightUnit);
  const laterCount = (index: number) => session.exercises.filter((e, i) => i > index && !e.skipped && remainingWork(e).length > 0).length;
  const offer = (index: number, order: number, ex: SessionExercise, flag: CheckinFlag, message: string) => {
    const options = usefulOptions(checkinOptions(flag, ex, order, laterCount(index), unitStep).map((o) => withPreview(o, ex)), ex);
    setPending(options.length ? { index, order, proposal: { message, options, source: 'rules' } } : null);
  };
  const withPreview = (o: CheckinOption, ex: SessionExercise): CheckinOption & { previewKg?: number } => {
    if (o.change.loadFactor === 1) return o;
    const after = applyTodayChange(ex, o.change, program.bar, program.weightUnit);
    const kg = remainingWork(after)[0]?.kg;
    return kg !== null && kg !== undefined ? { ...o, previewKg: kg } : o;
  };
  // A load option that rounds back to today's weight (or to another option's weight) isn't a choice.
  const usefulOptions = (opts: (CheckinOption & { previewKg?: number })[], ex: SessionExercise) => {
    const now = remainingWork(ex)[0]?.kg ?? null;
    const seen = new Set<number>();
    return opts.filter((o) => {
      if (o.previewKg === undefined || o.id === 'ai') return true;
      if (o.previewKg === now || seen.has(o.previewKg)) return false;
      seen.add(o.previewKg);
      return true;
    });
  };
  const checkin = async (index: number, order: number, flag: CheckinFlag | null, note: string, ask: boolean) => {
    const ex = session.exercises[index];
    if (!ex) return;
    const logged = ex.actual.map((a) => (a.order === order ? { ...a, flag: flag ?? undefined, note: note || undefined, pain: a.pain || flag === 'pain' } : a));
    const updated = { ...ex, actual: logged };
    save({ ...session, exercises: session.exercises.map((e, i) => (i === index ? updated : e)) });
    if (flag === 'pain') {
      setPending(null);
      return; // Hurts: the exercise stops with plain text, no proposal.
    }
    if (flag) offer(index, order, updated, flag, t(`checkin.rule.${flag}${updated.slot === 'main' ? 'Main' : ''}` as StringKey));
    if (!(ask && note && (profile?.geminiKey || cloud))) return;
    setThinking(index);
    try {
      const { coachJson } = await import('../../services/coachAi');
      const p = updated.prescription.find((x) => x.order === order);
      const a = logged.find((x) => x.order === order);
      const { raw } = await coachJson(
        checkinPrompt({
          exercise: t(`exercise.${updated.exerciseId}` as StringKey),
          slot: updated.slot,
          setNumber: order + 1,
          ordered: p ? `${p.kg ?? '?'} kg x ${p.targetReps ?? p.repMax}` : '?',
          logged: a ? `${a.kg ?? '?'} kg x ${a.reps ?? '?'}` : 'nothing yet',
          flag,
          note,
          remaining: String(remainingWork(updated).length),
          phase: cycle.phase,
          // Story 9: this exercise's history and Philip's notes, so the check-in isn't blind.
          history: [
            exerciseHistory(sessions, updated.exerciseId, session.id),
            ...(await allCoachNotes()).slice(-10).map((n, k) => (k === 0 ? 'Your notes about the lifter: ' : '') + n.text),
          ].join('\n'),
        }),
        { apiKey: profile?.geminiKey ?? null, model: profile?.geminiModel ?? null },
      );
      const reply = parseCoachReply(raw);
      if (reply?.stop) {
        save({ ...session, exercises: session.exercises.map((e, i) => (i === index ? { ...updated, actual: logged.map((x) => (x.order === order ? { ...x, pain: true } : x)) } : e)) });
        setPending(null);
      } else if (reply) {
        const rules = flag ? checkinOptions(flag, updated, order, laterCount(index), unitStep) : [];
        const ai: CheckinOption = { id: 'ai', group: 'ai', scope: 'exercise', change: reply.change };
        const options = usefulOptions((isNoChange(reply.change) ? rules : [ai, ...rules]).map((o) => withPreview(o, updated)), updated);
        setPending(options.length || reply.message ? { index, order, proposal: { message: reply.message || t('checkin.geminiFallbackLine'), options, source: 'gemini' } } : null);
      }
    } catch {
      // No connection or a bad reply: Philip's rule options (if any) stay up.
    } finally {
      setThinking(null);
    }
  };
  // OBS-2C086C: a set logged 2+ reps under the order gets Philip's fixes straight away, unasked.
  const missed = (index: number, order: number, ex: SessionExercise) => {
    const short = repsShort(ex, order);
    if (short < 2 || remainingWork(ex).length === 0) return;
    offer(index, order, ex, 'heavy', t('checkin.miss', { n: short }));
  };
  const accept = (picked: readonly CheckinOption[]) => {
    if (!pending) return;
    const ex = session.exercises[pending.index];
    if (!ex) return;
    const { exercise, laterRestSec } = mergeOptions(picked);
    const next = isNoChange(exercise) ? ex : applyTodayChange(ex, exercise, program.bar, program.weightUnit);
    const exercises = addLaterRest(
      session.exercises.map((e, i) => (i === pending.index ? next : e)),
      pending.index,
      laterRestSec,
      program.bar,
      program.weightUnit,
    );
    void applyCheckin({ ...session, exercises });
    setPending(null);
  };

  // Story 7 (OBS-F52773) / Story 10 (OBS-DD5F16): long-press a title bar, drag, Save. The new order is
  // remembered for this day.
  const [reordering, setReordering] = useState(false);
  const saveOrder = (exercises: SessionExercise[]) => {
    setReordering(false);
    setPending(null);
    save({ ...session, exercises });
    void setDayOrder(session.day, orderOf(exercises));
  };
  const canReorder = session.exercises.filter((e) => e.slot !== 'main').length > 1;
  // Older in-progress sessions have no cardio yet: show the plan, store it on first edit.
  const cardio = session.cardio ?? plannedCardio(cycle.phase, program.treadmill?.scale ?? (program.weightUnit === 'lb' ? 'mph' : 'kmh'), cycle.cardioMin);

  const finish = () => {
    cancelAlert();
    // Story 10 (OBS-7BAD75): a reopened log keeps its original finish time.
    const finishedAt = session.editing && session.finishedAt ? session.finishedAt : Date.now();
    const done: WorkoutSession = { ...session, status: 'done', finishedAt };
    delete done.editing;
    save(done);
    onFinished({ s: summarize(done, sessions, finishedAt), lift, session: done });
  };
  // OBS-7BAD75: Finish first shows what was logged; "Yes" completes, "No" goes back to editing.
  const [checking, setChecking] = useState(false);
  if (checking) {
    return (
      <FinishCheck
        session={session}
        unit={unit}
        cardio={session.cardio ?? null}
        onYes={finish}
        onNo={() => {
          setChecking(false);
          window.scrollTo({ top: 0 });
        }}
      />
    );
  }

  return (
    <div className="stack session">
      <header className="session-head">
        <div>
          <h2 className="pm-display">{t('home.workout.dayTitle', { day: session.day, lift: t(LIFT_KEY[lift]) })}</h2>
          <p className="small num">
            {t('home.workout.blockLine', { block: session.block, week: session.week })} ·{' '}
            {session.editing ? t('session.editingLine', { date: fmtDate(session.date, 'weekday') }) : t('session.elapsed', { n: elapsedMin, est: session.estMinutes })}
          </p>
        </div>
        <UnitSwitch value={unit} onChange={setUnit} label={t('session.unitFirst')} />
      </header>
      {over && (
        <DialogBar speaker={t('coach.speaker')} live portrait={<GymCharacter pose="phone" framing="bust" scale={2} className="pm-dialog-portrait" />}>
          {t('session.overTime')}
        </DialogBar>
      )}
      {canReorder && !reordering && (
        <button type="button" className="btn btn-sm btn-ghost reorder-open" onClick={() => setReordering(true)}>
          {t('reorder.tip')}
        </button>
      )}
      {reordering && <ReorderList exercises={session.exercises} onSave={saveOrder} onCancel={() => setReordering(false)} />}
      {!reordering && session.exercises.map((ex, i) => (
        <ExerciseCard
          key={`${ex.slot}-${ex.exerciseId}`}
          ex={ex}
          day={session.day}
          block={session.block}
          unit={unit}
          bar={program.bar}
          onChange={(next) => save({ ...session, exercises: session.exercises.map((e, j) => (j === i ? next : e)) })}
          onRest={startRest}
          onSwap={(to, keep) => swap(i, to, keep)}
          swapPreviewKg={(to) => swapPreview(i, to)}
          onCheckin={(order, flag, note, ask) => void checkin(i, order, flag, note, ask)}
          onMissed={(order, next) => missed(i, order, next)}
          proposal={pending?.index === i ? pending.proposal : null}
          proposalOrder={pending?.index === i ? pending.order : null}
          thinking={thinking === i}
          onAccept={accept}
          onDecline={() => setPending(null)}
          onReorder={canReorder ? () => setReordering(true) : undefined}
        />
      ))}
      <CardioCard cardio={cardio} cut={cycle.phase === 'lose'} treadmill={program.treadmill} budgetMin={program.availability?.strengthMin ?? SESSION_BUDGET_MIN} onChange={(next) => save({ ...session, cardio: next })} />
      <button type="button" className="btn btn-primary btn-block" onClick={() => setChecking(true)}>
        {t(session.editing ? 'session.finishEdit' : 'session.finish')}
      </button>
      {!session.editing && (
        <button type="button" className="btn btn-ghost btn-block" onClick={() => setDiscarding(true)}>
          {t('session.discard')}
        </button>
      )}
      {discarding && (
        <ConfirmDialog
          title={t('session.discardTitle')}
          body={<p>{t('session.discardBody')}</p>}
          confirmLabel={t('session.discardConfirm')}
          destructive
          onConfirm={() => {
            setDiscarding(false);
            void deleteWorkoutSession(session.id).then(onDiscarded);
          }}
          onCancel={() => setDiscarding(false)}
        />
      )}
      {restEnds !== null && <RestBar ends={restEnds} dur={restDur} onSkip={stopRest} />}
      {timesUp && (
        <div className="rest-bar is-up" role="alert">
          <span className="pm-display">
            {(() => {
              const ago = Math.round((timesUp.shownAt - timesUp.endedAt) / 1000);
              if (ago >= 3) return next ? t('session.timesUpAgoNext', { s: ago, name: next.name, n: next.n }) : t('session.timesUpAgo', { s: ago });
              return next ? t('session.timesUpNext', { name: next.name, n: next.n }) : t('session.timesUp');
            })()}
          </span>
          <button type="button" className="btn btn-sm" onClick={() => setTimesUp(null)}>
            {t('session.timesUpDismiss')}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Story 10 (OBS-7BAD75): before a workout is completed, Philip reads back what was logged. "Yes" goes
 * to the summary; "No" goes back to the session to fix numbers. Nothing is saved by this screen.
 */
function FinishCheck({
  session,
  unit,
  cardio,
  onYes,
  onNo,
}: {
  session: WorkoutSession;
  unit: 'kg' | 'lb';
  cardio: WorkoutSession['cardio'] | null;
  onYes: () => void;
  onNo: () => void;
}) {
  const rows = finishRows(session, unit);
  return (
    <div className="stack session">
      <DialogBar speaker={t('coach.speaker')} portrait={<GymCharacter pose="phone" framing="bust" scale={2} className="pm-dialog-portrait" />}>
        {t('finishCheck.line')}
      </DialogBar>
      <section className="card stack-sm" aria-labelledby="finish-check-h">
        <h2 id="finish-check-h">{t('finishCheck.title')}</h2>
        <ul className="finish-check">
          {rows.map((r) => (
            <li key={r.key}>
              <strong>{r.name}</strong>
              <span className="num">{r.text}</span>
            </li>
          ))}
          {cardio && !cardio.skipped && cardio.done && (
            <li>
              <strong>{t('cardio.summary')}</strong>
              <span className="num">{cardioValue(cardio)}</span>
            </li>
          )}
        </ul>
      </section>
      <button type="button" className="btn btn-primary btn-block" onClick={onYes}>
        {t('finishCheck.yes')}
      </button>
      <button type="button" className="btn btn-secondary btn-block" onClick={onNo}>
        {t('finishCheck.no')}
      </button>
    </div>
  );
}

/** One line per exercise: the done work sets ("2 × 12.5 kg × 10" for dumbbell pairs), or Skipped / Nothing logged. */
export function finishRows(session: WorkoutSession, unit: 'kg' | 'lb'): { key: string; name: string; text: string }[] {
  return session.exercises.map((e) => {
    const name = t(`exercise.${e.exerciseId}` as StringKey);
    const key = `${e.slot}-${e.exerciseId}`;
    if (e.skipped) return { key, name, text: t('session.skipped') };
    const pair = !!infoFor(e.exerciseId).pair;
    const sets = e.actual
      .filter((a) => a.done && e.prescription.find((p) => p.order === a.order)?.kind !== 'warmup')
      .map((a) => {
        const w = a.kg === null ? null : pair ? t('session.pair', { w: fmtIn(a.kg, unit) }) : fmtIn(a.kg, unit);
        return `${w ? `${w} × ` : ''}${a.reps ?? '?'}`;
      });
    return { key, name, text: sets.length ? t('finishCheck.sets', { n: sets.length, list: sets.join(', ') }) : t('finishCheck.none') };
  });
}

function Summary({
  summary,
  lift,
  unit,
  session,
  cycle,
  tmHistory,
  program,
  choices,
  onBack,
}: {
  summary: SessionSummary;
  lift: LiftId;
  unit: 'kg' | 'lb';
  session: WorkoutSession;
  cycle: CycleRecord;
  tmHistory: readonly TmRecord[];
  program: TrainingProgram;
  choices: Readonly<Record<string, string>>;
  onBack?: (finished: boolean) => void;
}) {
  const { navigate } = useUI();
  const line: StringKey = summary.pain ? 'summary.pain' : summary.pr ? 'summary.pr' : summary.missed ? 'summary.miss' : 'summary.done';
  const pose = summary.pr ? 'fist-pump' : summary.missed ? 'cross-unimpressed' : 'cross-smug';
  const rows = useMemo(
    () => [
      [t('summary.sets'), t('summary.setsValue', { done: summary.setsDone, total: summary.setsTotal })],
      [t('summary.time'), t('summary.timeValue', { n: summary.minutes })],
      ...(summary.e1rmKg !== null ? [[t('summary.e1rm', { lift: t(LIFT_KEY[lift]) }), fmtBoth(summary.e1rmKg, unit)]] : []),
      ...(session.cardio ? [[t('cardio.summary'), cardioValue(session.cardio)]] : []),
    ],
    [summary, lift, unit, session.cardio],
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
      {/* OBS-59DEFD: a fixed log from a finished cycle changes the record only; its TMs were set long ago. */}
      {isPastCycleLog(session, program) ? (
        <p className="small muted">{t('summary.pastCycle')}</p>
      ) : (
        <>
          <Review session={session} cycle={cycle} tmHistory={tmHistory} unit={unit} />
          <CoachReport session={session} program={program} cycle={cycle} tmHistory={tmHistory} choices={choices} unit={unit} auto />
        </>
      )}
      {onBack && (
        <button type="button" className="btn btn-primary btn-block" onClick={() => onBack(true)}>
          {t('summary.calendar')}
        </button>
      )}
      <button type="button" className={`btn btn-block ${onBack ? 'btn-secondary' : 'btn-primary'}`} onClick={() => navigate('home')}>
        {t('summary.home')}
      </button>
    </div>
  );
}

/**
 * Philip's look back at today (owner feedback, Nov 5): what he noticed and what he'd change for the
 * rest of this cycle. Nothing changes until the owner taps OK; each change can be unticked.
 */
function Review({ session, cycle, tmHistory, unit }: { session: WorkoutSession; cycle: CycleRecord; tmHistory: readonly TmRecord[]; unit: 'kg' | 'lb' }) {
  const items = useMemo(() => reviewSession(session), [session]);
  const changes = items.filter((i): i is Exclude<ReviewItem, { kind: 'note' }> => i.kind !== 'note');
  const notes = items.filter((i): i is Extract<ReviewItem, { kind: 'note' }> => i.kind === 'note');
  const [on, setOn] = useState<boolean[]>(() => changes.map(() => true));
  const [answered, setAnswered] = useState(false);
  const tms = tmsForCycle(tmHistory, cycle.index);
  if (items.length === 0) return null;
  const label = (c: (typeof changes)[number]) => {
    if (c.kind === 'rest') return t('dayReview.rest', { s: c.extraSec });
    const tm = tms[c.lift];
    return t(c.why === 'miss' ? 'dayReview.tmMiss' : 'dayReview.tmFlag', {
      lift: t(LIFT_KEY[c.lift]),
      from: tm !== null ? fmtIn(tm, unit) : '–',
      to: tm !== null ? fmtIn(adjustedTm(tm, c.factor), unit) : '–',
    });
  };
  const apply = async () => {
    // Story 6 §4: one transaction that also records what changed, so deleting the log can undo it.
    const picked: ReviewChange[] = changes.flatMap((c, i): ReviewChange[] =>
      !on[i] ? [] : c.kind === 'tm' ? [{ kind: 'tm', lift: c.lift, factor: c.factor }] : [{ kind: 'rest', extraSec: c.extraSec }],
    );
    await applyReview(session.id, picked);
    setAnswered(true);
  };
  return (
    <section className="card stack-sm" aria-labelledby="review-h">
      <h2 id="review-h">{t('dayReview.title')}</h2>
      {notes.map((n) => (
        <p key={n.note} className={n.note === 'pain' ? 'ex-pain' : 'small'}>
          {t(`dayReview.note.${n.note}` as StringKey)}
        </p>
      ))}
      {changes.length > 0 &&
        (answered ? (
          <p className="small" role="status">
            {t('dayReview.done')}
          </p>
        ) : (
          <>
            <p className="small">{t('dayReview.propose')}</p>
            {changes.map((c, i) => (
              <label key={i} className="review-item">
                <input type="checkbox" checked={on[i] ?? false} onChange={(e) => setOn((o) => o.map((v, j) => (j === i ? e.target.checked : v)))} />
                <span>{label(c)}</span>
              </label>
            ))}
            <div className="ex-actions">
              <button type="button" className="btn btn-sm btn-primary" onClick={() => void apply()}>
                {t('dayReview.ok')}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => void saveWorkoutSession({ ...session, reviewed: true }).then(() => setAnswered(true))}
              >
                {t('dayReview.no')}
              </button>
            </div>
          </>
        ))}
    </section>
  );
}

/** The next set to do (first unticked set of a live exercise), for the "Time's up" line. */
function nextSetLabel(session: WorkoutSession): { name: string; n: number } | null {
  for (const ex of session.exercises) {
    if (ex.skipped || ex.actual.some((a) => a.pain)) continue;
    const a = ex.actual.find((x) => !x.done);
    if (a) return { name: t(`exercise.${ex.exerciseId}` as StringKey), n: a.order + 1 };
  }
  return null;
}
