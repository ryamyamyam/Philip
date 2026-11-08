import { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DialogBar } from '../../components/DialogBar';
import { GymCharacter } from '../../components/GymCharacter';
import { Icon } from '../../components/Icon';
import { StatRow } from '../../components/StatRow';
import { addTm, applyCheckin, applyReview, deleteWorkoutSession, saveWorkoutSession, setSlotChoice, type ReviewChange } from '../../db/repo';
import { useProfile, useWeightEntries } from '../../hooks/useData';
import { newId } from '../../db/db';
import type { CycleRecord, TmRecord, TrainingProgram, WorkoutSession } from '../../db/types';
import { t, type StringKey } from '../../i18n';
import { todayYmd } from '../../lib/date';
import { parseDecimal } from '../../lib/numbers';
import { exerciseFor, menuSlot, slotKey, type ExerciseId, type Slot } from '../../lib/training/exercises';
import { DAY_LIFT, DELOAD_WEEK, epley, tmFromOneRm, type LiftId } from '../../lib/training/program';
import { nextSessionRef, tmsForCycle } from '../../lib/training/progress';
import { buildSession, liftOutlook, SESSION_BUDGET_MIN, type PlannedSession } from '../../lib/training/session';
import { createSession, lastSetsFor, summarize, swapInSession, type SessionSummary } from '../../lib/training/sessionLog';
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
  ruleChange,
  type CheckinFlag,
  type ReviewItem,
} from '../../lib/training/checkin';
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
  /** Back to the calendar (Story 6): `finished` plays today's stamp press. */
  onBack?: (finished: boolean) => void;
}

/** Today's session (Story 5 §5, T-013): start screen, live log, finish summary. */
export function SessionView({ program, cycle, sessions, tmHistory, choices, open, onBack }: Props) {
  const [summary, setSummary] = useState<{ s: SessionSummary; lift: LiftId; session: WorkoutSession } | null>(null);
  if (summary)
    return <Summary summary={summary.s} lift={summary.lift} unit={program.weightUnit} session={summary.session} cycle={cycle} tmHistory={tmHistory} onBack={onBack} />;
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
  const bodyWeightKg = useBodyWeightKg();
  const [pending, setPending] = useState<{ index: number; proposal: CheckinProposal } | null>(null);
  const [thinking, setThinking] = useState<number | null>(null);
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
  // Story 6 §7: `keep` writes the sticky slot choice; otherwise the swap is for today only.
  // T-021 adds the "Keep this swap" checkbox; until then the card keeps today's behaviour (keep).
  const swap = (index: number, to: ExerciseId, keep = true) => {
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
  // Owner tells Philip how a set went (Nov 5): save it, then propose a change for the rest of today.
  const checkin = async (index: number, order: number, flag: CheckinFlag | null, note: string) => {
    const ex = session.exercises[index];
    if (!ex) return;
    const logged = ex.actual.map((a) => (a.order === order ? { ...a, flag: flag ?? undefined, note: note || undefined, pain: a.pain || flag === 'pain' } : a));
    const updated = { ...ex, actual: logged };
    save({ ...session, exercises: session.exercises.map((e, i) => (i === index ? updated : e)) });
    if (flag === 'pain') return; // Hurts: the exercise stops with plain text, no proposal.
    const rules = (): CheckinProposal | null =>
      flag ? { change: ruleChange(flag, updated), message: t(`checkin.rule.${flag}${updated.slot === 'main' ? 'Main' : ''}` as StringKey), source: 'rules' } : null;
    let proposal = rules();
    if (note && profile?.geminiKey) {
      setThinking(index);
      try {
        const { coachCheckinWithGemini, DEFAULT_GEMINI_MODEL, normalizeModel } = await import('../../services/foodAnalysis/gemini');
        const p = updated.prescription.find((x) => x.order === order);
        const a = logged.find((x) => x.order === order);
        const raw = await coachCheckinWithGemini({
          apiKey: profile.geminiKey,
          model: normalizeModel(profile.geminiModel ?? DEFAULT_GEMINI_MODEL),
          text: checkinPrompt({
            exercise: t(`exercise.${updated.exerciseId}` as StringKey),
            slot: updated.slot,
            setNumber: order + 1,
            ordered: p ? `${p.kg ?? '?'} kg x ${p.repMax}` : '?',
            logged: a ? `${a.kg ?? '?'} kg x ${a.reps ?? '?'}` : 'nothing yet',
            flag,
            note,
            remaining: String(remainingWork(updated).length),
            phase: cycle.phase,
          }),
        });
        const reply = parseCoachReply(raw);
        if (reply?.stop) {
          save({ ...session, exercises: session.exercises.map((e, i) => (i === index ? { ...updated, actual: logged.map((x) => (x.order === order ? { ...x, pain: true } : x)) } : e)) });
          proposal = null;
        } else if (reply) {
          proposal = { change: reply.change, message: reply.message || t('checkin.geminiFallbackLine'), source: 'gemini' };
        }
      } catch {
        // No connection or a bad reply: Philip's rules still answer.
      } finally {
        setThinking(null);
      }
    }
    setPending(proposal ? { index, proposal } : null);
  };
  const accept = () => {
    if (!pending) return;
    const ex = session.exercises[pending.index];
    if (!ex) return;
    const next = applyTodayChange(ex, pending.proposal.change, program.bar, program.weightUnit);
    void applyCheckin({ ...session, exercises: session.exercises.map((e, i) => (i === pending.index ? next : e)) });
    setPending(null);
  };

  const finish = () => {
    const done: WorkoutSession = { ...session, status: 'done', finishedAt: Date.now() };
    save(done);
    onFinished({ s: summarize(done, sessions, Date.now()), lift, session: done });
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
          onCheckin={(order, flag, note) => void checkin(i, order, flag, note)}
          proposal={pending?.index === i ? pending.proposal : null}
          thinking={thinking === i}
          onAccept={accept}
          onDecline={() => setPending(null)}
        />
      ))}
      <button type="button" className="btn btn-primary btn-block" onClick={finish}>
        {t('session.finish')}
      </button>
      <button type="button" className="btn btn-ghost btn-block" onClick={() => setDiscarding(true)}>
        {t('session.discard')}
      </button>
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

function Summary({
  summary,
  lift,
  unit,
  session,
  cycle,
  tmHistory,
  onBack,
}: {
  summary: SessionSummary;
  lift: LiftId;
  unit: 'kg' | 'lb';
  session: WorkoutSession;
  cycle: CycleRecord;
  tmHistory: readonly TmRecord[];
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
      <Review session={session} cycle={cycle} tmHistory={tmHistory} unit={unit} />
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
