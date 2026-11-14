import { useEffect, useMemo, useRef, useState } from 'react';
import { DialogBar } from '../../components/DialogBar';
import { GymCharacter } from '../../components/GymCharacter';
import { Sheet } from '../../components/Sheet';
import { useToast } from '../../components/Toast';
import { applyGoalPlan, GoalApplyError, undoGoalPlan, updatePlanChange } from '../../db/goalRepo';
import { updateProfile } from '../../db/repo';
import type { GoalChoice, GoalPlanItems, PlanChange } from '../../db/types';
import { useGoalState } from '../../hooks/useGoal';
import { useProfile, useSlotChoices, useTargetPlans, useTrainingProgram, useWeightEntries, useWorkoutSessions, useCycles } from '../../hooks/useData';
import { t, type StringKey } from '../../i18n';
import { tg, type GoalKey } from '../../i18n/goal';
import { addDays, daysBetween, isValidYmd, todayYmd, toYmd } from '../../lib/date';
import { fmtDate, fmtNum } from '../../lib/format';
import { parseDecimal } from '../../lib/numbers';
import { planForDate } from '../../lib/nutrition';
import { clampDeadline, suggestDeadline, weeksUntil } from '../../lib/goal/deadline';
import { GOAL_RULES } from '../../lib/goal/goalCheck';
import { carbDays } from '../../lib/goal/carbDays';
import { macrosFor } from '../../lib/goal/proposal';
import { GOAL_WEEKS, ownGoal, philipNextGoal, recommendNextPhase, repeatGoal, type PrevGoal } from '../../lib/goal/nextGoal';
import { CARDIO_MINUTES } from '../../lib/training/cardio';
import { RATE_PCT, rollingWeight, startingWeight, type GoalIssue } from '../../lib/training/cycleGoal';
import { exerciseFor, type ExerciseId } from '../../lib/training/exercises';
import { blockForCycle, type Phase } from '../../lib/training/program';
import { nextCycleIndex } from '../../lib/training/progress';
import { trainingDaysOrDefault } from '../../lib/training/schedule';
import { useUI } from '../../ui';
import { fmtIn, fromDisplay } from '../workout/units';
import { createRequest, pasteReply, prepareRequest, resumeWaiting, sendRequest, type SendOutcome } from './request';

type Mode = 'repeat' | 'keep' | 'philip' | 'own';
const PHASES: Phase[] = ['lose', 'maintain', 'gain'];
const wd = (d: number) => t(`training.wd.${d}` as StringKey);
const exName = (id: string) => t(`exercise.${id}` as StringKey);

/**
 * Story 11: "Goal reached" (or "Off the plan"). Steps: what happened → next goal (same again,
 * Philip's pick or your own) → Philip's plan (his picks inside the engine's ranges) → review with a
 * switch per change → Apply (Undo for 24 h).
 *
 * Story 12: `manual` = "Re-plan with Philip", the same sheet opened on demand mid-cycle. Keep this goal is
 * preselected (the cycle continues, the levers apply now); a new goal restarts the cycle. Every new goal
 * has a goal date: Philip suggests it, the owner can move it, and the pace follows.
 */
export default function GoalSheet({ manual = false, autoAsk = false }: { manual?: boolean; autoAsk?: boolean }) {
  const { closeSheet } = useUI();
  const toast = useToast();
  const state = useGoalState();
  const profile = useProfile();
  const weights = useWeightEntries();
  const sessions = useWorkoutSessions();
  const cycles = useCycles();
  const plans = useTargetPlans();
  const program = useTrainingProgram();
  const choices = useSlotChoices();
  const today = todayYmd();

  const cycle = state?.cycle ?? null;
  const open = (manual ? state?.openManual : state?.open) ?? null;
  const prompt: { cycle: number; kind: PlanChange['event']; reason: PlanChange['reason'] } | null = manual
    ? cycle
      ? { cycle: cycle.index, kind: 'manual', reason: 'manual' }
      : null
    : (state?.pending ?? (open ? { cycle: open.cycle, kind: open.event, reason: open.reason } : null));
  const kind = manual ? 'manual' : (prompt?.kind ?? 'reached');
  const reason = manual ? 'manual' : (prompt?.reason ?? 'weight');
  const unit = profile?.unitPrefs.weight ?? 'kg';

  const nowKg = useMemo(() => {
    if (!weights) return null;
    return rollingWeight(weights, today) ?? startingWeight(weights, today, profile?.weightKg ?? null)?.kg ?? null;
  }, [weights, today, profile?.weightKg]);
  const start = cycle ? toYmd(new Date(cycle.startedAt)) : today;
  const daysIn = Math.max(0, daysBetween(start, today));
  const bfFresh = profile?.bodyFatPct != null && profile.bodyFatDate != null && profile.bodyFatDate >= addDays(today, -(GOAL_RULES.bfFreshDays - 1));
  const bf = profile?.bodyFatPct ?? null;
  const prev: PrevGoal | null = cycle ? { phase: cycle.phase, goal: cycle.goal } : null;
  const rec = prev ? recommendNextPhase(prev, bf, profile?.targetBodyFatPct ?? null) : null;

  // OBS-FF441B: a maintain goal (about 0% a week) never comes back as the default; Philip's bulk or cut does.
  const holding = cycle?.phase === 'maintain';
  const defaultMode: Mode = holding ? 'philip' : kind === 'reached' ? 'repeat' : reason === 'bfCeiling' ? 'philip' : 'keep';
  const [deadlineStr, setDeadlineStr] = useState<string | null>(null);
  // The default follows the event once the data is in; a pick by the owner wins from then on.
  const [modePick, setModePick] = useState<Mode | null>(null);
  const mode = modePick ?? defaultMode;
  // A new mode brings Philip's date back (the date belongs to the goal it was picked for).
  const setMode = (m: Mode) => {
    setModePick(m);
    setDeadlineStr(null);
  };
  const [phase, setPhase] = useState<Phase | null>(null);
  const [endW, setEndW] = useState('');
  const [bfT, setBfT] = useState('');
  const [bfNow, setBfNow] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<SendOutcome | 'waiting' | null>(null);
  const [claudeOpen, setClaudeOpen] = useState(false);
  const [pasted, setPasted] = useState('');
  const [pasteBad, setPasteBad] = useState(false);
  const [copied, setCopied] = useState(false);
  const [off, setOff] = useState<Record<string, boolean>>({});
  const pickPhase = phase ?? (mode === 'philip' ? (rec?.phase ?? cycle?.phase ?? 'gain') : (cycle?.phase ?? 'gain'));

  // A queued request: check once when the sheet opens.
  useEffect(() => {
    if (open?.status === 'waiting' && open.id !== undefined && open.jobId) void resumeWaiting(open.id).then((o) => setOutcome(o));
  }, [open?.id, open?.status, open?.jobId]);

  // The goal date: Philip's suggestion unless the owner moved it (not for Keep: that goal keeps its date).
  const ownEnd = parseDecimal(endW);
  const ownEndKg = ownEnd !== null && Number.isFinite(ownEnd) && ownEnd > 0 ? fromDisplay(ownEnd, unit) : null;
  const suggested = useMemo(() => {
    if (!prev || nowKg === null) return { weeks: GOAL_WEEKS, date: addDays(today, GOAL_WEEKS * 7) };
    if (mode === 'repeat') {
      const w = prev.goal.weeks ?? GOAL_WEEKS;
      return { weeks: w, date: addDays(today, Math.round(w * 7)) };
    }
    if (mode === 'own' && ownEndKg !== null) return suggestDeadline(pickPhase, nowKg, ownEndKg, today);
    return { weeks: GOAL_WEEKS, date: addDays(today, GOAL_WEEKS * 7) };
  }, [prev, nowKg, mode, ownEndKg, pickPhase, today]);
  const goalDate = clampDeadline(today, deadlineStr && isValidYmd(deadlineStr) ? deadlineStr : suggested.date);
  const goalWeeksPicked = Math.max(0.5, weeksUntil(today, goalDate));

  const choice: (GoalChoice & { issues?: GoalIssue[] }) | null = useMemo(() => {
    if (!cycle || !prev || nowKg === null) return null;
    if (mode === 'repeat') return { ...repeatGoal(prev, nowKg, bf, goalWeeksPicked), deadline: goalDate };
    if (mode === 'philip') return { ...philipNextGoal(prev, nowKg, bf, pickPhase, daysIn, goalWeeksPicked), deadline: goalDate };
    if (mode === 'keep') {
      const left = cycle.goal.deadline ? Math.max(7, daysBetween(today, cycle.goal.deadline)) : Math.max(7, 28 - daysIn);
      const rate = Math.round((((cycle.goal.endWeightKg - nowKg) / nowKg / (left / 7)) * 100) * 100) / 100;
      return {
        phase: cycle.phase,
        startWeightKg: Math.round(nowKg * 10) / 10,
        startBfPct: bf,
        endWeightKg: cycle.goal.endWeightKg,
        weeklyRatePct: rate,
        bfLinePct: cycle.goal.bfLinePct,
        source: cycle.goal.source,
        weeks: Math.round((left / 7) * 100) / 100,
        deadline: cycle.goal.deadline ?? addDays(today, left),
      };
    }
    if (ownEndKg === null) return null;
    const b = parseDecimal(bfT);
    return { ...ownGoal(nowKg, bf, pickPhase, ownEndKg, b !== null && Number.isFinite(b) ? b : null, goalWeeksPicked), deadline: goalDate };
  }, [cycle, prev, nowKg, mode, bf, pickPhase, daysIn, ownEndKg, bfT, goalWeeksPicked, goalDate, today]);
  const blocked = choice?.issues?.some((i) => i.level === 'error') ?? false;
  const restart = kind === 'reached' || mode !== 'keep';

  // 0.12.3: opened from a weigh-in ("Let Philip re-plan"): ask Philip straight away, once, with the goal kept.
  const askRef = useRef<() => Promise<void>>(async () => {});
  const autoFired = useRef(false);
  const loaded = !!state && !!profile && !!weights && !!sessions && !!cycles && !!plans && program !== undefined && !!choices;
  useEffect(() => {
    if (!autoAsk || autoFired.current || !loaded || !choice || blocked || open) return;
    autoFired.current = true;
    void askRef.current();
  }, [autoAsk, loaded, choice, blocked, open]);

  if (!state || !cycle || !profile || !weights || !sessions || !cycles || !plans || program === undefined || !choices || !prompt) {
    return (
      <Sheet title={tg('goal.title.reached')} onClose={closeSheet}>
        <p className="small muted">{' '}</p>
      </Sheet>
    );
  }

  const nextIndex = nextCycleIndex(cycles, sessions);
  const proposal = open?.status === 'ready' ? open.proposal : null;
  const lineKey: GoalKey = kind === 'manual' ? 'goal.line.manual' : kind === 'reached' ? 'goal.line.reached' : (`goal.line.offtrack.${reason}` as GoalKey);

  const ask = async () => {
    if (!choice || blocked) return;
    setBusy(true);
    setOutcome(null);
    try {
      // A failed request is re-sent as is; otherwise a fresh one for the goal picked now.
      let id = open?.id !== undefined && open.status === 'waiting' && open.failed ? open.id : undefined;
      if (id === undefined) {
        const prepared = await prepareRequest(cycle, stripIssues(choice), kind, reason, restart, today);
        if (open?.id !== undefined) await updatePlanChange(open.id, { status: 'dismissed' });
        id = await createRequest(cycle, stripIssues(choice), kind, reason, restart, prepared);
      }
      setOutcome(await sendRequest(id));
    } finally {
      setBusy(false);
    }
  };

  const saveBf = async () => {
    const v = parseDecimal(bfNow);
    if (v === null || !Number.isFinite(v) || v < 3 || v > 60) return;
    await updateProfile({ bodyFatPct: v, bodyFatDate: today });
    setBfNow('');
  };

  const copyPrompt = async () => {
    let text = open?.prompt ?? null;
    if (!text && choice) text = (await prepareRequest(cycle, choice, kind, reason, restart, today)).prompt;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const usePaste = async () => {
    let id = open?.id;
    if (id === undefined && choice) {
      const prepared = await prepareRequest(cycle, choice, kind, reason, restart, today);
      id = await createRequest(cycle, stripIssues(choice), kind, reason, restart, prepared);
    }
    if (id === undefined) return;
    const ok = await pasteReply(id, pasted);
    setPasteBad(!ok);
    if (ok) {
      setPasted('');
      setClaudeOpen(false);
    }
  };

  askRef.current = ask;

  const items = (pc: PlanChange): GoalPlanItems => {
    const p = pc.proposal;
    return {
      kcal: p && p.kcal !== null && !off.kcal ? p.kcal : null,
      proteinG: p && p.proteinG !== null && !off.proteinG ? p.proteinG : null,
      cardioMin: p && p.cardioMin !== null && !off.cardioMin ? p.cardioMin : null,
      days: p && p.days && !off.days ? p.days : null,
      swaps: (p?.swaps ?? []).filter((s) => !off[`swap-${s.day}-${s.slot}`]),
      tms: (p?.tms ?? []).filter((x) => !off[`tm-${x.lift}`]),
      loads: (p?.loads ?? []).filter((x) => !off[`load-${x.exerciseId}`]),
    };
  };

  const apply = async () => {
    if (!open || open.id === undefined) return;
    setBusy(true);
    try {
      const it = items(open);
      const note = noteFor(open, nowKg, today, unit);
      await applyGoalPlan(open.id, it, today, note);
      const id = open.id;
      closeSheet();
      toast(tg('goal.applied'), {
        label: tg('goal.undo'),
        run: () => void undoGoalPlan(id, todayYmd()).then(() => toast(tg('goal.undone'))).catch(() => toast(tg('goal.stale'))),
      });
    } catch (e) {
      toast(e instanceof GoalApplyError && e.code === 'workoutOpen' ? tg('goal.workoutOpen') : tg('goal.stale'));
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async () => {
    if (open?.id !== undefined) await updatePlanChange(open.id, { status: 'dismissed' });
    else if (choice) {
      // Nothing was asked yet: record the answer so the reminder stops for this event.
      const { addPlanChange } = await import('../../db/goalRepo');
      await addPlanChange({ at: Date.now(), cycle: cycle.index, event: kind, reason, restart: false, choice: stripIssues(choice), status: 'dismissed', prompt: '', jobId: null, ranges: null, proposal: null, accepted: null, undo: null, appliedAt: null });
    }
    closeSheet();
  };

  const plan = planForDate(plans, today);
  const curCardio = cycle.cardioMin ?? CARDIO_MINUTES[cycle.phase];
  const curDays = trainingDaysOrDefault(program?.trainingDays);
  const reviewBlock = open?.restart ? blockForCycle(nextIndex) : cycle.block;
  const choiceMap = Object.fromEntries(choices.map((c) => [c.slotKey, c.exerciseId])) as Record<string, ExerciseId>;
  const waiting = open?.status === 'waiting' && !open.failed;
  const failed = open?.failed === true || outcome === 'failed';

  return (
    <Sheet
      title={tg(kind === 'manual' ? 'goal.title.manual' : kind === 'reached' ? 'goal.title.reached' : 'goal.title.offtrack')}
      onClose={closeSheet}
      full
      footer={
        proposal ? (
          <div className="stack-sm">
            <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => void apply()}>
              {tg('goal.apply')}
            </button>
            <button type="button" className="btn btn-ghost btn-block" disabled={busy} onClick={() => void dismiss()}>
              {tg('goal.dismiss')}
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="stack goal-sheet">
        <DialogBar speaker={t('coach.speaker')} portrait={<GymCharacter pose={kind === 'reached' || kind === 'manual' ? 'point-up' : 'cross-smug'} framing="bust" scale={2} className="pm-dialog-portrait" />}>
          {proposal ? proposal.message : tg(lineKey)}
        </DialogBar>

        <section className="card stack-sm" aria-labelledby="goal-h1">
          <h3 id="goal-h1">{tg('goal.step.happened')}</h3>
          <p className="num">
            {tg('goal.weight', { start: fmtIn(cycle.goal.startWeightKg, unit), now: nowKg !== null ? fmtIn(nowKg, unit) : '–', days: daysIn })}
          </p>
          {nowKg !== null && daysIn >= 7 && (
            <p className="small num">
              {tg('goal.pace', {
                actual: fmtNum(Math.round((((nowKg - cycle.goal.startWeightKg) / cycle.goal.startWeightKg / (daysIn / 7)) * 100) * 100) / 100, 2),
                planned: fmtNum(cycle.goal.weeklyRatePct, 2),
              })}
            </p>
          )}
          {bf !== null && <p className="small num">{tg('goal.bf', { bf: fmtNum(bf, 1) })}</p>}
          {manual && state.recentPlan && !proposal && (
            <p className="small" role="note">
              {tg('goal.recentNote')}
            </p>
          )}
          {!bfFresh && !proposal && (
            <div className="stack-sm">
              <p className="small muted">{tg('goal.bfStale')}</p>
              <div className="setup-inputs">
                <label className="field">
                  <span className="field-label">{tg('goal.bfToday')}</span>
                  <input className="input num" inputMode="decimal" value={bfNow} onChange={(e) => setBfNow(e.target.value)} />
                </label>
                <button type="button" className="btn btn-sm" disabled={!bfNow.trim()} onClick={() => void saveBf()}>
                  {tg('goal.bfSave')}
                </button>
              </div>
            </div>
          )}
        </section>

        {!proposal && (
          <section className="card stack-sm" aria-labelledby="goal-h2">
            <h3 id="goal-h2">{tg(kind === 'reached' ? 'goal.step.next' : 'goal.step.revise')}</h3>
            <div className="segmented" role="radiogroup" aria-label={tg('goal.step.next')}>
              {(kind === 'reached' ? (['repeat', 'philip', 'own'] as const) : (['keep', 'philip', 'own'] as const)).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} disabled={waiting || (state.workoutOpen && m !== 'keep' && m !== 'repeat')}>
                  {tg(`goal.opt.${m}` as GoalKey)}
                </button>
              ))}
            </div>
            {(mode === 'philip' || mode === 'own') && (
              <div className="segmented" role="radiogroup" aria-label={t('brief.phaseTitle')}>
                {PHASES.map((p) => (
                  <button key={p} type="button" role="radio" aria-checked={pickPhase === p} onClick={() => setPhase(p)} disabled={waiting}>
                    {tg(`goal.phase.${p}` as GoalKey)}
                  </button>
                ))}
              </div>
            )}
            {mode === 'philip' && rec && rec.why !== 'same' && <p className="small">{tg(`goal.phaseWhy.${rec.why}` as GoalKey)}</p>}
            {mode === 'own' && (
              <div className="setup-inputs">
                <label className="field">
                  <span className="field-label">{tg(unit === 'kg' ? 'goal.endKg' : 'goal.endLb')}</span>
                  <input className="input num" inputMode="decimal" value={endW} onChange={(e) => setEndW(e.target.value)} />
                </label>
                <label className="field">
                  <span className="field-label">{tg('goal.bfLabel')}</span>
                  <input className="input num" inputMode="decimal" value={bfT} onChange={(e) => setBfT(e.target.value)} />
                </label>
              </div>
            )}
            {choice && <GoalLine choice={choice} unit={unit} repeat={mode === 'repeat' ? cycle.goal.endWeightKg - cycle.goal.startWeightKg : null} />}
            {choice?.issues?.map((i) => (
              <p key={i.code} className={`small ${i.level === 'error' ? 'field-error' : 'warn-text'}`} role={i.level === 'error' ? 'alert' : undefined}>
                {issueText(i, choice.phase)}
              </p>
            ))}
            {mode !== 'keep' && (
              <div className="stack-sm">
                <label className="field">
                  <span className="field-label">{tg('goal.dateLabel')}</span>
                  <input
                    className="input input-date num"
                    type="date"
                    min={addDays(today, 14)}
                    max={addDays(today, 182)}
                    value={goalDate}
                    disabled={waiting}
                    onChange={(e) => isValidYmd(e.target.value) && setDeadlineStr(e.target.value)}
                  />
                </label>
                <p className="small num">{tg(deadlineStr === null ? 'goal.dateSuggested' : 'goal.dateOwn', { date: fmtDate(goalDate, 'short'), weeks: fmtNum(Math.round(goalWeeksPicked * 10) / 10, 1) })}</p>
                {deadlineStr !== null && (
                  <button type="button" className="btn btn-sm btn-ghost" disabled={waiting} onClick={() => setDeadlineStr(null)}>
                    {tg('goal.dateReset')}
                  </button>
                )}
              </div>
            )}
            {state.workoutOpen && kind !== 'reached' && <p className="small muted">{tg('replan.workoutOpenGoal')}</p>}
            {mode === 'keep' && choice?.deadline && <p className="small num">{tg('goal.dateKept', { date: fmtDate(choice.deadline, 'short') })}</p>}
            <p className="small muted">
              {restart
                ? tg('goal.restartNote', { old: cycle.index, next: nextIndex, block: blockForCycle(nextIndex) })
                : tg('goal.continueNote', { n: cycle.index })}
            </p>
          </section>
        )}

        <section className="card stack-sm" aria-labelledby="goal-h3">
          <h3 id="goal-h3">{tg(proposal ? 'goal.review' : 'goal.step.plan')}</h3>
          {!proposal && (
            <>
              {busy && <p className="small" role="status">{tg('goal.asking')}</p>}
              {!busy && waiting && <p className="small" role="status">{tg(open?.jobId ? 'goal.waitingCloud' : 'goal.waitingOffline')}</p>}
              {!busy && outcome === 'offline' && !waiting && <p className="small">{tg('goal.waitingOffline')}</p>}
              {!busy && failed && <p className="small warn-text">{tg('goal.error')}</p>}
              {!busy && outcome === 'noAi' && <p className="small">{tg('goal.noAi')}</p>}
              {!waiting && (
                <button type="button" className="btn btn-primary btn-block" disabled={!choice || blocked || busy} onClick={() => void ask()}>
                  {tg(failed ? 'goal.retry' : 'goal.ask')}
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-block" aria-expanded={claudeOpen} onClick={() => setClaudeOpen((v) => !v)}>
                {tg('goal.claude')}
              </button>
              {claudeOpen && (
                <div className="stack-sm">
                  <p className="small">{tg('goal.claudeSteps')}</p>
                  <button type="button" className="btn btn-sm" disabled={!choice || blocked} onClick={() => void copyPrompt()}>
                    {tg(copied ? 'goal.claudeCopied' : 'goal.claudeCopy')}
                  </button>
                  <label className="field">
                    <span className="field-label">{tg('goal.claudePaste')}</span>
                    <textarea className="textarea" rows={5} value={pasted} onChange={(e) => setPasted(e.target.value)} />
                  </label>
                  {pasteBad && (
                    <p className="small field-error" role="alert">
                      {tg('goal.claudeBad')}
                    </p>
                  )}
                  <button type="button" className="btn btn-sm" disabled={!pasted.trim()} onClick={() => void usePaste()}>
                    {tg('goal.claudeUse')}
                  </button>
                </div>
              )}
            </>
          )}
          {proposal && open && (
            <>
              <p className="small muted">
                {tg(proposal.source.kind === 'claude-paste' ? 'goal.source.claude' : proposal.source.kind === 'gemini-cloud' ? 'goal.source.cloud' : 'goal.source.device')}
                {open.restart ? ` · ${tg('goal.restartNote', { old: cycle.index, next: nextIndex, block: blockForCycle(nextIndex) })}` : ` · ${tg('goal.continueNote', { n: cycle.index })}`}
              </p>
              <div className="goal-row">
                <span className="goal-row-label">{tg('goal.row.goal')}</span>
                <GoalLine choice={open.choice} unit={unit} repeat={null} />
                {open.choice.deadline && <span className="small num">{tg('goal.dateKept', { date: fmtDate(open.choice.deadline, 'short') })}</span>}
              </div>
              {proposal.kcal !== null && (
                <Row id="kcal" off={off} setOff={setOff} label={tg('goal.row.kcal')} from={plan ? tg('goal.kcal', { n: plan.calories }) : '–'} to={tg('goal.kcal', { n: proposal.kcal })} why={proposal.why.kcal} />
              )}
              {proposal.kcal !== null && (() => {
                // The full P/F/C: fat sits on the floor, carbs take the rest (lib/goal/carbDays.ts).
                const m = macrosFor(proposal.kcal, proposal.proteinG ?? plan?.proteinG ?? 0, open.choice.startWeightKg, profile.heightCm);
                return (
                  <p className="small num">
                    {tg('goal.pfc', { fromP: plan?.proteinG ?? '–', fromF: plan?.fatG ?? '–', fromC: plan?.carbsG ?? '–', p: m.proteinG, f: m.fatG, c: m.carbsG })}
                  </p>
                );
              })()}
              {proposal.kcal !== null && program?.carbDays !== false && (() => {
                const split = carbDays(macrosFor(proposal.kcal, proposal.proteinG ?? plan?.proteinG ?? 0, open.choice.startWeightKg, profile.heightCm), trainingDaysOrDefault(proposal.days ?? program?.trainingDays), profile.sex);
                return split ? <p className="small muted num">{tg('goal.carbSplit', { train: split.train.calories, rest: split.rest.calories })}</p> : null;
              })()}
              {proposal.proteinG !== null && (
                <Row id="proteinG" off={off} setOff={setOff} label={tg('goal.row.protein')} from={plan ? tg('goal.g', { n: plan.proteinG }) : '–'} to={tg('goal.g', { n: proposal.proteinG })} why={proposal.why.proteinG} />
              )}
              {proposal.cardioMin !== null && (
                <Row id="cardioMin" off={off} setOff={setOff} label={tg('goal.row.cardio')} from={tg('goal.min', { n: curCardio })} to={tg('goal.min', { n: proposal.cardioMin })} why={proposal.why.cardioMin} />
              )}
              {proposal.days && (
                <Row
                  id="days"
                  off={off}
                  setOff={setOff}
                  label={tg('goal.row.days')}
                  from={curDays.map(wd).join(' ')}
                  to={proposal.days.map(wd).join(' ')}
                  why={proposal.why.days}
                />
              )}
              {proposal.swaps.map((s, k) => (
                <Row
                  key={`${s.day}-${s.slot}`}
                  id={`swap-${s.day}-${s.slot}`}
                  off={off}
                  setOff={setOff}
                  label={tg('goal.row.swap', { day: s.day, slot: s.slot })}
                  from={exName(exerciseFor(s.day, s.slot, reviewBlock, choiceMap))}
                  to={exName(s.exerciseId)}
                  why={k === 0 ? proposal.why.swaps : undefined}
                />
              ))}
              {(proposal.tms ?? []).map((x) => (
                <Row
                  key={`tm-${x.lift}`}
                  id={`tm-${x.lift}`}
                  off={off}
                  setOff={setOff}
                  label={tg('goal.row.tm', { lift: exName(x.lift) })}
                  from={fmtIn(x.fromKg, unit)}
                  to={fmtIn(x.toKg, unit)}
                  why={proposal.why.tms?.[x.lift]}
                />
              ))}
              {(proposal.loads ?? []).map((x) => (
                <Row
                  key={`load-${x.exerciseId}`}
                  id={`load-${x.exerciseId}`}
                  off={off}
                  setOff={setOff}
                  label={tg('goal.row.load', { name: exName(x.exerciseId) })}
                  from={fmtIn(x.fromKg, unit)}
                  to={fmtIn(x.toKg, unit)}
                  why={proposal.why.loads?.[x.exerciseId]}
                />
              ))}
              {proposal.clamps.map((c) => (
                <p key={c.lever} className="small warn-text">
                  {tg('goal.capped', { asked: c.asked, used: c.used })}
                </p>
              ))}
            </>
          )}
        </section>
      </div>
    </Sheet>
  );
}

function stripIssues(c: GoalChoice & { issues?: GoalIssue[] }): GoalChoice {
  const { issues: _i, ...rest } = c;
  return rest;
}

function Row({
  id,
  label,
  from,
  to,
  why,
  off,
  setOff,
}: {
  id: string;
  label: string;
  from: string;
  to: string;
  why?: string;
  off: Record<string, boolean>;
  setOff: (f: (o: Record<string, boolean>) => Record<string, boolean>) => void;
}) {
  return (
    <label className="review-item goal-row">
      <input type="checkbox" checked={!off[id]} onChange={(e) => setOff((o) => ({ ...o, [id]: !e.target.checked }))} aria-label={`${tg('goal.keep')}: ${label}`} />
      <span className="stack-xs">
        <span className="goal-row-label">{label}</span>
        <span className="num">
          {from} → <strong>{to}</strong>
        </span>
        {why && <span className="small muted">{why}</span>}
      </span>
    </label>
  );
}

function GoalLine({ choice, unit, repeat }: { choice: GoalChoice; unit: 'kg' | 'lb'; repeat: number | null }) {
  const weeks = fmtNum(Math.round((choice.weeks ?? 4) * 10) / 10, 1);
  const bfKey: GoalKey = choice.phase === 'gain' ? 'goal.bfLine.gain' : choice.phase === 'lose' ? 'goal.bfLine.lose' : 'goal.bfLine.maintain';
  return (
    <span className="stack-xs">
      <span className="num">
        {repeat !== null
          ? tg('goal.repeatLine', { change: `${repeat >= 0 ? '+' : '−'}${fmtIn(Math.abs(repeat), unit)}`, end: fmtIn(choice.endWeightKg, unit), weeks })
          : tg('goal.goalLine', {
              phase: tg(`goal.phase.${choice.phase}` as GoalKey),
              start: fmtIn(choice.startWeightKg, unit),
              end: fmtIn(choice.endWeightKg, unit),
              rate: fmtNum(choice.weeklyRatePct, 2),
              weeks,
            })}
      </span>
      {choice.bfLinePct !== null && <span className="small num">{tg(bfKey, { bf: fmtNum(choice.bfLinePct, 1) })}</span>}
    </span>
  );
}

function issueText(i: GoalIssue, phase: Phase): string {
  switch (i.code) {
    case 'rateOutOfRange':
      return tg('goal.issue.rate', { min: fmtNum(RATE_PCT[phase].min, 2), max: fmtNum(RATE_PCT[phase].max, 2) });
    case 'directionMismatch':
      return tg('goal.issue.direction');
    case 'bfBelowFloor':
      return tg('goal.issue.bfFloor', { min: i.min });
    case 'bfLow':
      return tg('goal.issue.bfLow', { warn: i.warnBelow });
  }
}

/** The note Philip keeps on Apply ("Reached 75 kg on 20 Nov; next: 77 kg, BF ≤ 15%"). Plain facts only. */
function noteFor(pc: PlanChange, nowKg: number | null, today: string, unit: 'kg' | 'lb'): string {
  const c = pc.choice;
  const head =
    pc.event === 'reached'
      ? `Reached the cycle ${pc.cycle} goal${nowKg !== null ? ` at ${fmtIn(nowKg, unit)}` : ''} on ${fmtDate(today, 'short')}`
      : pc.event === 'manual'
        ? `Asked for a fresh plan in cycle ${pc.cycle} on ${fmtDate(today, 'short')}`
        : `Off track in cycle ${pc.cycle} (${pc.reason}) on ${fmtDate(today, 'short')}`;
  const next = `${pc.event === 'manual' && !pc.restart ? 'goal' : 'next goal'} ${fmtIn(c.endWeightKg, unit)} ${c.deadline ? `by ${fmtDate(c.deadline, 'short')}` : 'in 4 weeks'}${c.bfLinePct !== null ? `, BF line ${fmtNum(c.bfLinePct, 1)}%` : ''}`;
  return `${head}; ${next}.`.slice(0, 140);
}
