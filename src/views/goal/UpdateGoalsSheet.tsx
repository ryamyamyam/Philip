import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState, type ReactNode } from 'react';
import { DialogBar } from '../../components/DialogBar';
import { GymCharacter } from '../../components/GymCharacter';
import { Sheet } from '../../components/Sheet';
import { useToast } from '../../components/Toast';
import { db } from '../../db/db';
import { applyGoalPlan, GoalApplyError, undoGoalPlan, updatePlanChange } from '../../db/goalRepo';
import { logWeight, updateProfile } from '../../db/repo';
import type { Basis, GoalPlanItems, GoalProposalRecord, IsoWeekday, PlanChange } from '../../db/types';
import { useGoalState } from '../../hooks/useGoal';
import { useProfile, useTargetPlans, useTrainingProgram, useWeightEntries } from '../../hooks/useData';
import { t, type StringKey } from '../../i18n';
import { tg, type GoalKey } from '../../i18n/goal';
import { todayYmd } from '../../lib/date';
import { fmtDate, fmtNum } from '../../lib/format';
import { parseDecimal } from '../../lib/numbers';
import { planForDate } from '../../lib/nutrition';
import { carbDays } from '../../lib/goal/carbDays';
import { suggestDeadline } from '../../lib/goal/deadline';
import { ownGoal } from '../../lib/goal/nextGoal';
import { macrosFor } from '../../lib/goal/proposal';
import { draftProposal, estimateDate, inferPhase, macroPct, macrosWithFat, refinePrompt, UPDATE_RULES } from '../../lib/goal/update';
import { CARDIO_MINUTES } from '../../lib/training/cardio';
import { RATE_PCT, rollingWeight, startingWeight, type GoalIssue } from '../../lib/training/cycleGoal';
import type { Phase } from '../../lib/training/program';
import { trainingDaysOrDefault } from '../../lib/training/schedule';
import { useUI } from '../../ui';
import { BasisTag } from '../learn/BasisTag';
import { fmtIn, fromDisplay } from '../workout/units';
import { createRequest, pasteReply, prepareRequest, sendRequest, type SendOutcome } from './request';

const wd = (d: number) => t(`training.wd.${d}` as StringKey);
const exName = (id: string) => t(`exercise.${id}` as StringKey);
const num = (s: string): number | null => {
  const v = parseDecimal(s);
  return v !== null && Number.isFinite(v) && v > 0 ? v : null;
};

/**
 * Story 15: "Update goals" (Progress › Goals, Workout › Plan, Ask Philip, the weigh-in hand-off).
 * 1. Now: weight and body fat, unchanged or a new number (a new weight is logged as today's weigh-in).
 * 2. Target: weight and body fat.
 * 3. Generate plan: Philip (cloud, then this phone's key) proposes calories, P/F/C, gym-day carbs,
 *    cardio, days a week, lift weights and accessory sets/reps; the goal date is estimated from the
 *    calories. With no connection, the app's formula draft (refining then goes through Claude by paste).
 * 4. Tick what to implement and write anything else in Others: a note goes back to Philip for a revised
 *    plan; no note → the final plan to confirm. "Yes, confirm" applies it (the cycle keeps going), Undo 24 h.
 */
export default function UpdateGoalsSheet() {
  const { closeSheet } = useUI();
  const toast = useToast();
  const state = useGoalState();
  const profile = useProfile();
  const weights = useWeightEntries();
  const plans = useTargetPlans();
  const program = useTrainingProgram();
  const today = todayYmd();
  const cycle = state?.cycle ?? null;
  const open = state?.openManual ?? null;
  // The plan before a follow-up note: shown again if the follow-up can't be answered.
  const prev = useLiveQuery(
    async () => (cycle && open ? ((await db.planChanges.where('cycle').equals(cycle.index).toArray()).filter((c) => c.event === 'manual' && c.status === 'ready' && c.id !== open.id).at(-1) ?? null) : null),
    [cycle?.index, open?.id],
  );
  const unit = profile?.unitPrefs.weight ?? 'kg';

  const avgKg = useMemo(() => (weights ? (rollingWeight(weights, today) ?? startingWeight(weights, today, profile?.weightKg ?? null)?.kg ?? null) : null), [weights, today, profile?.weightKg]);
  const [wMode, setWMode] = useState<'same' | 'new'>('same');
  const [wNew, setWNew] = useState('');
  const [bfMode, setBfMode] = useState<'same' | 'new'>('same');
  const [bfNew, setBfNew] = useState('');
  const [tW, setTW] = useState<string | null>(null);
  const [tBf, setTBf] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<SendOutcome | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState('');
  const [claudeOpen, setClaudeOpen] = useState(false);
  const [pasted, setPasted] = useState('');
  const [pasteBad, setPasteBad] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!state || !cycle || !profile || !weights || !plans || program === undefined) {
    return (
      <Sheet title={tg('upd.title')} onClose={closeSheet}>
        <p className="small muted"> </p>
      </Sheet>
    );
  }

  const bfNow = profile.bodyFatPct;
  const weightMode = avgKg === null ? 'new' : wMode;
  const nowKg = weightMode === 'new' ? (num(wNew) !== null ? fromDisplay(num(wNew) as number, unit) : null) : avgKg;
  const bfEff = bfMode === 'new' ? num(bfNew) : bfNow;
  const targetStr = tW ?? fmtNum(unit === 'kg' ? cycle.goal.endWeightKg : cycle.goal.endWeightKg / 0.45359237, 1);
  const tBfStr = tBf ?? (cycle.goal.bfLinePct !== null ? fmtNum(cycle.goal.bfLinePct, 1) : '');
  const targetKg = num(targetStr) !== null ? fromDisplay(num(targetStr) as number, unit) : null;
  const phase: Phase | null = nowKg !== null && targetKg !== null ? inferPhase(nowKg, targetKg) : null;
  const choice =
    nowKg !== null && targetKg !== null && phase
      ? (() => {
          const s = suggestDeadline(phase, nowKg, targetKg, today);
          return { ...ownGoal(nowKg, bfEff, phase, targetKg, num(tBfStr), s.weeks), deadline: s.date };
        })()
      : null;
  const errors = choice?.issues.filter((i) => i.level === 'error') ?? [];
  const bfBad = bfMode === 'new' && (bfEff === null || bfEff < 3 || bfEff > 60);

  const ready = open?.status === 'ready' ? open.proposal : null;
  const waiting = open?.status === 'waiting' && !open.failed;
  const failedOpen = open?.status === 'waiting' && open.failed === true;
  const isFollowUp = !!open && open.prompt.includes('--- Follow-up ---');
  const showReview = !!ready && !!open && !editing;
  const plan = planForDate(plans, today);
  const curDays = trainingDaysOrDefault(program?.trainingDays);

  const generate = async () => {
    if (!choice || errors.length || bfBad) return;
    setBusy(true);
    setOutcome(null);
    try {
      // Now: a new weight is today's weigh-in; a new body fat updates the profile (fresh as of today).
      if (weightMode === 'new' && nowKg !== null) await logWeight(today, Math.round(nowKg * 10) / 10);
      if (bfMode === 'new' && bfEff !== null) await updateProfile({ bodyFatPct: bfEff, bodyFatDate: today });
      const { issues: _i, ...c } = choice;
      const prepared = await prepareRequest(cycle, c, 'manual', 'manual', false, today, { update: true });
      if (open?.id !== undefined) await updatePlanChange(open.id, { status: 'dismissed' });
      const id = await createRequest(cycle, c, 'manual', 'manual', false, prepared);
      const o = await sendRequest(id);
      setOutcome(o);
      // No Philip right now: the app's formula draft, so there is always a plan to look at.
      if (o === 'noAi' || o === 'failed' || o === 'offline') await applyDraft(id, prepared.ranges);
      setEditing(false);
      setOff({});
      setNote('');
    } finally {
      setBusy(false);
    }
  };

  const applyDraft = async (id: number, ranges: PlanChange['ranges']) => {
    if (!ranges) return;
    await updatePlanChange(id, { status: 'ready', failed: false, jobId: null, proposal: draftProposal(ranges, tg('upd.draftMsg'), Date.now()) });
  };

  const items = (p: GoalProposalRecord): GoalPlanItems => ({
    kcal: p.kcal !== null && !off.kcal ? p.kcal : null,
    proteinG: p.proteinG !== null && !off.macros ? p.proteinG : null,
    fatG: p.fatG != null && !off.macros ? p.fatG : null,
    carbDays: p.carbDays != null && !off.carbDays ? p.carbDays : null,
    cardioMin: p.cardioMin !== null && !off.cardioMin ? p.cardioMin : null,
    days: p.days && !off.days ? p.days : null,
    swaps: p.swaps.filter((s) => !off[`swap-${s.day}-${s.slot}`]),
    tms: (p.tms ?? []).filter((x) => !off[`tm-${x.lift}`]),
    loads: (p.loads ?? []).filter((x) => !off[`load-${x.exerciseId}`]),
  });

  const sendNote = async () => {
    if (!open || open.id === undefined || !ready || !note.trim()) return;
    setBusy(true);
    setOutcome(null);
    try {
      const prompt = refinePrompt(open.prompt, ready, items(ready), note.trim());
      // The plan he answered stays (ready) until the revised one is in, so "Back" can return to it.
      const id = await createRequest(cycle, open.choice, 'manual', 'manual', false, { prompt, ranges: open.ranges as NonNullable<PlanChange['ranges']>, window: null as never });
      setOutcome(await sendRequest(id));
      setNote('');
      setOff({});
    } finally {
      setBusy(false);
    }
  };

  const back = async () => {
    // Drop the unanswered follow-up: the plan before it shows again.
    if (open?.id !== undefined) await updatePlanChange(open.id, { status: 'dismissed' });
    setOutcome(null);
  };

  const confirm = async () => {
    if (!open || open.id === undefined || !ready) return;
    setBusy(true);
    try {
      const it = items(ready);
      // The goal date follows the calories that apply (his current ones if he unticked Philip's).
      const est = open.ranges?.update ? estimateDate(open.ranges.update, it.kcal ?? plan?.calories ?? open.ranges.update.maintenanceKcal) : null;
      if (est) await updatePlanChange(open.id, { choice: { ...open.choice, deadline: est.date, weeks: est.weeks, weeklyRatePct: est.weeklyRatePct } });
      const noteText = `Updated goals on ${fmtDate(today, 'short')}: ${fmtIn(open.choice.startWeightKg, unit)} -> ${fmtIn(open.choice.endWeightKg, unit)}${est ? ` by ${fmtDate(est.date, 'short')}` : ''}.`.slice(0, 140);
      await applyGoalPlan(open.id, it, today, noteText);
      // Older plans from this round are answered now.
      const rest = (await db.planChanges.where('cycle').equals(cycle.index).toArray()).filter((c) => c.event === 'manual' && (c.status === 'ready' || c.status === 'waiting') && c.id !== open.id);
      for (const c of rest) if (c.id !== undefined) await updatePlanChange(c.id, { status: 'dismissed' });
      const id = open.id;
      closeSheet();
      toast(tg('upd.applied'), {
        label: tg('goal.undo'),
        run: () => void undoGoalPlan(id, todayYmd()).then(() => toast(tg('goal.undone'))).catch(() => toast(tg('goal.stale'))),
      });
    } catch (e) {
      toast(e instanceof GoalApplyError && e.code === 'workoutOpen' ? tg('goal.workoutOpen') : tg('goal.stale'));
    } finally {
      setBusy(false);
    }
  };

  const copyPrompt = async () => {
    if (!open?.prompt) return;
    try {
      await navigator.clipboard.writeText(open.prompt);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const usePaste = async () => {
    if (open?.id === undefined) return;
    const ok = await pasteReply(open.id, pasted);
    setPasteBad(!ok);
    if (ok) {
      setPasted('');
      setClaudeOpen(false);
      setOutcome(null);
    }
  };

  const line = showReview ? (confirming ? tg('upd.line.confirm') : (ready as GoalProposalRecord).message) : tg('upd.line');

  return (
    <Sheet title={tg('upd.title')} onClose={closeSheet} full footer={showReview ? footer() : undefined}>
      <div className="stack goal-sheet upd-sheet">
        <DialogBar speaker={t('coach.speaker')} portrait={<GymCharacter pose="point-up" framing="bust" scale={2} className="pm-dialog-portrait" />}>
          {line}
        </DialogBar>

        {!showReview && (
          <>
            <section className="card stack-sm" aria-labelledby="upd-now">
              <h3 id="upd-now">{tg('upd.now')}</h3>
              <span className="field-label">{tg('upd.weight')}</span>
              {avgKg !== null && (
                <div className="segmented" role="radiogroup" aria-label={tg('upd.weight')}>
                  <button type="button" role="radio" aria-checked={weightMode === 'same'} onClick={() => setWMode('same')}>
                    {tg('upd.unchanged', { v: fmtIn(avgKg, unit) })}
                  </button>
                  <button type="button" role="radio" aria-checked={weightMode === 'new'} onClick={() => setWMode('new')}>
                    {tg('upd.newNumber')}
                  </button>
                </div>
              )}
              {weightMode === 'new' && (
                <label className="field">
                  <span className="field-label">{tg(unit === 'kg' ? 'upd.weightNowKg' : 'upd.weightNowLb')}</span>
                  <input className="input num" inputMode="decimal" value={wNew} onChange={(e) => setWNew(e.target.value)} />
                </label>
              )}
              {weightMode === 'same' && <p className="small muted">{tg('upd.avgNote')}</p>}
              <span className="field-label">{tg('upd.bf')}</span>
              <div className="segmented" role="radiogroup" aria-label={tg('upd.bf')}>
                <button type="button" role="radio" aria-checked={bfMode === 'same'} onClick={() => setBfMode('same')}>
                  {bfNow !== null ? tg('upd.unchanged', { v: `${fmtNum(bfNow, 1)}%` }) : tg('upd.unknown')}
                </button>
                <button type="button" role="radio" aria-checked={bfMode === 'new'} onClick={() => setBfMode('new')}>
                  {tg('upd.newNumber')}
                </button>
              </div>
              {bfMode === 'new' && (
                <label className="field">
                  <span className="field-label">{tg('upd.bfNow')}</span>
                  <input className="input num" inputMode="decimal" value={bfNew} onChange={(e) => setBfNew(e.target.value)} />
                </label>
              )}
              {bfMode === 'same' && bfNow !== null && profile.bodyFatDate && <p className="small muted num">{tg('upd.bfDate', { date: fmtDate(profile.bodyFatDate, 'short') })}</p>}
            </section>

            <section className="card stack-sm" aria-labelledby="upd-target">
              <h3 id="upd-target">{tg('upd.target')}</h3>
              <div className="setup-inputs">
                <label className="field">
                  <span className="field-label">{tg(unit === 'kg' ? 'upd.targetKg' : 'upd.targetLb')}</span>
                  <input className="input num" inputMode="decimal" value={targetStr} onChange={(e) => setTW(e.target.value)} />
                </label>
                <label className="field">
                  <span className="field-label">{tg('upd.targetBf')}</span>
                  <input className="input num" inputMode="decimal" value={tBfStr} onChange={(e) => setTBf(e.target.value)} />
                </label>
              </div>
              {choice && phase && (
                <p className="small num">
                  {tg(`upd.phaseLine.${phase}` as GoalKey, { change: fmtIn(Math.abs(choice.endWeightKg - choice.startWeightKg), unit), min: fmtNum(Math.abs(RATE_PCT[phase].min), 2), max: fmtNum(Math.abs(RATE_PCT[phase].max), 2) })}
                </p>
              )}
              {choice?.issues.map((i) => (
                <p key={i.code} className={`small ${i.level === 'error' ? 'field-error' : 'warn-text'}`} role={i.level === 'error' ? 'alert' : undefined}>
                  {issueText(i)}
                </p>
              ))}
              {bfBad && bfNew.trim() !== '' && (
                <p className="small field-error" role="alert">
                  {tg('upd.bfRange')}
                </p>
              )}
              <p className="small muted">{tg('upd.keepsCycle', { n: cycle.index })}</p>
            </section>

            <section className="card stack-sm" aria-labelledby="upd-gen">
              <h3 id="upd-gen">{tg('upd.planStep')}</h3>
              {busy && <p className="small" role="status">{tg('goal.asking')}</p>}
              {!busy && waiting && <p className="small" role="status">{tg(open?.jobId ? 'goal.waitingCloud' : 'goal.waitingOffline')}</p>}
              {!busy && failedOpen && isFollowUp && <p className="small">{tg('upd.noteNoAi')}</p>}
              {!busy && outcome === 'noAi' && !isFollowUp && <p className="small">{tg('upd.draftNoAi')}</p>}
              {(!open || !isFollowUp || editing) && (
                <button type="button" className="btn btn-primary btn-block" disabled={busy || !choice || errors.length > 0 || bfBad} onClick={() => void generate()}>
                  {tg('upd.generate')}
                </button>
              )}
              {!busy && !choice && <p className="small muted">{tg(nowKg === null ? 'upd.needNow' : 'upd.needTarget')}</p>}
              {!busy && waiting && open?.id !== undefined && !isFollowUp && (
                <button type="button" className="btn btn-ghost btn-block" onClick={() => void applyDraft(open.id as number, open.ranges)}>
                  {tg('upd.useDraft')}
                </button>
              )}
              {open && isFollowUp && !ready && prev && (
                <button type="button" className="btn btn-ghost btn-block" disabled={busy} onClick={() => void back()}>
                  {tg('upd.backToPlan')}
                </button>
              )}
              {editing && ready && (
                <button type="button" className="btn btn-ghost btn-block" onClick={() => setEditing(false)}>
                  {tg('goal.backToPlan')}
                </button>
              )}
              {open && !ready && (
                <>
                  <button type="button" className="btn btn-ghost btn-block" aria-expanded={claudeOpen} onClick={() => setClaudeOpen((v) => !v)}>
                    {tg('goal.claude')}
                  </button>
                  {claudeOpen && (
                    <div className="stack-sm">
                      <p className="small">{tg('goal.claudeSteps')}</p>
                      <button type="button" className="btn btn-sm" onClick={() => void copyPrompt()}>
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
            </section>
          </>
        )}

        {showReview && open && ready && review(open, ready)}
      </div>
    </Sheet>
  );

  function footer() {
    const hasNote = note.trim().length > 0;
    if (confirming)
      return (
        <div className="stack-sm">
          <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => void confirm()}>
            {tg('upd.yes')}
          </button>
          <button type="button" className="btn btn-ghost btn-block" disabled={busy} onClick={() => setConfirming(false)}>
            {tg('upd.back')}
          </button>
        </div>
      );
    return (
      <div className="stack-sm">
        <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => (hasNote ? void sendNote() : setConfirming(true))}>
          {tg(hasNote ? 'upd.sendNote' : 'upd.looksGood')}
        </button>
      </div>
    );
  }

  function review(pc: PlanChange, p: GoalProposalRecord) {
    const u = pc.ranges?.update ?? null;
    const it = items(p);
    const kcalUsed = it.kcal ?? plan?.calories ?? null;
    const est = u && kcalUsed !== null ? estimateDate(u, kcalUsed) : null;
    const days = (it.days ?? curDays) as IsoWeekday[];
    const prot = it.proteinG ?? plan?.proteinG ?? null;
    const m = kcalUsed !== null && prot !== null ? (it.fatG != null ? macrosWithFat(kcalUsed, prot, it.fatG) : macrosFor(kcalUsed, prot, pc.choice.startWeightKg, profile?.heightCm ?? null)) : null;
    const pm = p.kcal !== null && p.proteinG !== null ? (p.fatG != null ? macrosWithFat(p.kcal, p.proteinG, p.fatG) : macrosFor(p.kcal, p.proteinG, pc.choice.startWeightKg, profile?.heightCm ?? null)) : null;
    const split = pm ? carbDays(pm, trainingDaysOrDefault(p.days ?? program?.trainingDays), profile?.sex ?? null) : null;
    const curPct = plan ? macroPct(plan) : null;
    const newPct = pm ? macroPct(pm) : null;
    const curCardio = cycle?.cardioMin ?? (cycle ? CARDIO_MINUTES[cycle.phase] : 0);
    const sr = (sets: number | null | undefined, reps: number | null | undefined) => (sets || reps ? ` · ${sets ?? '–'} × ${reps ?? '–'}` : '');

    if (confirming)
      return (
        <section className="card stack-sm" aria-labelledby="upd-final">
          <h3 id="upd-final">{tg('upd.final')}</h3>
          <ul className="upd-final stack-xs">
            <li className="num">{dateText(est, pc)}</li>
            {it.kcal !== null && <li className="num">{tg('upd.f.kcal', { n: it.kcal })}</li>}
            {m && (it.proteinG !== null || it.fatG != null) && <li className="num">{tg('upd.f.macros', { ...macroPct(m), pg: m.proteinG, fg: m.fatG, cg: m.carbsG })}</li>}
            {it.carbDays != null && <li>{it.carbDays ? tg('upd.f.carbOn', { days: days.map(wd).join(' ') }) : tg('upd.f.carbOff')}</li>}
            {it.cardioMin !== null && <li className="num">{tg('upd.f.cardio', { n: it.cardioMin })}</li>}
            {it.days && <li>{tg('upd.f.days', { n: it.days.length, days: it.days.map(wd).join(' ') })}</li>}
            {(it.tms ?? []).map((x) => (
              <li key={x.lift} className="num">
                {tg('goal.row.tm', { lift: exName(x.lift) })}: {fmtIn(x.toKg, unit)}
              </li>
            ))}
            {(it.loads ?? []).map((x) => (
              <li key={x.exerciseId} className="num">
                {exName(x.exerciseId)}: {fmtIn(x.toKg, unit)}
                {sr(x.sets, x.reps)}
              </li>
            ))}
            {it.swaps.map((s) => (
              <li key={`${s.day}-${s.slot}`}>{tg('goal.row.swap', { day: s.day, slot: s.slot })}: {exName(s.exerciseId)}</li>
            ))}
            {nothingKept(it) && <li className="muted">{tg('upd.f.nothing')}</li>}
          </ul>
          <p className="small muted">{tg('upd.keepsCycle', { n: cycle?.index ?? 0 })}</p>
        </section>
      );

    return (
      <>
        <section className="card stack-sm" aria-labelledby="upd-review">
          <h3 id="upd-review">{tg('upd.review')}</h3>
          <p className="small muted">
            {tg(p.source.kind === 'engine' ? 'upd.source.engine' : p.source.kind === 'claude-paste' ? 'goal.source.claude' : p.source.kind === 'gemini-cloud' ? 'goal.source.cloud' : 'goal.source.device')}
          </p>
          <div className="goal-row stack-xs upd-date">
            <span className="goal-row-label">{tg('upd.row.date')}</span>
            <strong className="num">{dateText(est, pc)}</strong>
            {u && <span className="small muted">{tg(u.maintenanceSource === 'measured' ? 'upd.maintMeasured' : 'upd.maintFormula', { n: u.maintenanceKcal })}</span>}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
            {tg('upd.changeGoals')}
          </button>
        </section>

        <section className="card stack-sm" aria-labelledby="upd-food">
          <h3 id="upd-food">{tg('upd.nutrition')}</h3>
          {p.kcal !== null && <Row off={off} setOff={setOff} id="kcal" label={tg('goal.row.kcal')} from={plan ? tg('goal.kcal', { n: plan.calories }) : '–'} to={tg('goal.kcal', { n: p.kcal })} why={p.why.kcal} basis={p.basis?.kcal} />}
          {pm && newPct && (
            <Row
              off={off}
              setOff={setOff}
              id="macros"
              label={tg('upd.row.macros')}
              from={curPct ? tg('upd.pct', curPct) : '–'}
              to={tg('upd.pct', newPct)}
              why={[p.why.proteinG, p.why.fatG].filter(Boolean).join(' ')}
              basis={p.basis?.proteinG}
            >
              <span className="small num">{tg('upd.grams', { pg: pm.proteinG, fg: pm.fatG, cg: pm.carbsG })}</span>
            </Row>
          )}
          {p.carbDays != null && (
            <Row off={off} setOff={setOff} id="carbDays" label={tg('upd.row.carbDays')} from={program?.carbDays === false ? tg('upd.carbEven') : tg('upd.carbOnShort')} to={p.carbDays ? tg('upd.carbOnShort') : tg('upd.carbEven')} why={p.why.carbDays}>
              {p.carbDays && split && (
                <span className="small num">{tg('upd.carbSplit', { days: trainingDaysOrDefault(p.days ?? program?.trainingDays).map(wd).join(' '), train: split.train.calories, rest: split.rest.calories })}</span>
              )}
            </Row>
          )}
        </section>

        <section className="card stack-sm" aria-labelledby="upd-train">
          <h3 id="upd-train">{tg('upd.training')}</h3>
          {p.days && (
            <Row
              off={off}
              setOff={setOff}
              id="days"
              label={tg('upd.row.days')}
              from={tg('upd.daysVal', { n: curDays.length, days: curDays.map(wd).join(' ') })}
              to={tg('upd.daysVal', { n: p.days.length, days: p.days.map(wd).join(' ') })}
              why={p.why.days}
              basis={p.basis?.days}
            />
          )}
          {(p.tms ?? []).map((x) => (
            <Row off={off} setOff={setOff} key={x.lift} id={`tm-${x.lift}`} label={tg('goal.row.tm', { lift: exName(x.lift) })} from={fmtIn(x.fromKg, unit)} to={fmtIn(x.toKg, unit)} why={p.why.tms?.[x.lift]} />
          ))}
          {(p.loads ?? []).map((x) => (
            <Row
              off={off}
              setOff={setOff}
              key={x.exerciseId}
              id={`load-${x.exerciseId}`}
              label={tg('goal.row.load', { name: exName(x.exerciseId) })}
              from={`${fmtIn(x.fromKg, unit)}${sr(x.fromSets, x.fromReps)}`}
              to={`${fmtIn(x.toKg, unit)}${sr(x.sets ?? x.fromSets, x.reps ?? x.fromReps)}`}
              why={p.why.loads?.[x.exerciseId]}
            />
          ))}
          {p.swaps.map((s, k) => (
            <Row off={off} setOff={setOff} key={`${s.day}-${s.slot}`} id={`swap-${s.day}-${s.slot}`} label={tg('goal.row.swap', { day: s.day, slot: s.slot })} from="" to={exName(s.exerciseId)} why={k === 0 ? p.why.swaps : undefined} />
          ))}
          {p.cardioMin !== null && <Row off={off} setOff={setOff} id="cardioMin" label={tg('goal.row.cardio')} from={tg('goal.min', { n: curCardio })} to={tg('goal.min', { n: p.cardioMin })} why={p.why.cardioMin} basis={p.basis?.cardioMin} />}
          {!p.days && !(p.tms ?? []).length && !(p.loads ?? []).length && !p.swaps.length && <p className="small muted">{tg('upd.trainSame')}</p>}
          {p.clamps.map((c) => (
            <p key={c.lever} className="small warn-text">
              {tg('goal.capped', { asked: c.asked, used: c.used })}
            </p>
          ))}
        </section>

        <section className="card stack-sm" aria-labelledby="upd-others">
          <h3 id="upd-others">{tg('upd.others')}</h3>
          <label className="field">
            <span className="field-label">{tg('upd.othersLabel')}</span>
            <textarea className="textarea" rows={3} maxLength={UPDATE_RULES.noteMax} value={note} placeholder={tg('upd.othersHint')} onChange={(e) => setNote(e.target.value)} />
          </label>
          <p className="small muted">{tg(note.trim() ? 'upd.othersWillSend' : 'upd.othersNone')}</p>
          {busy && <p className="small" role="status">{tg('goal.asking')}</p>}
        </section>
      </>
    );
  }

  function dateText(est: ReturnType<typeof estimateDate>, pc: PlanChange): string {
    if (pc.choice.phase === 'maintain') return tg('upd.dateMaintain');
    // No maintenance to work from (no body stats and not enough food logged): say what's missing.
    if (!pc.ranges?.update) return tg('upd.dateNoStats');
    if (!est) return tg('upd.dateNone');
    return tg('upd.dateLine', { date: fmtDate(est.date, 'short'), weeks: fmtNum(est.weeks, 1), rate: fmtNum(Math.abs(est.weeklyRatePct), 2) });
  }
}

function nothingKept(it: GoalPlanItems): boolean {
  return it.kcal === null && it.proteinG === null && it.fatG == null && it.carbDays == null && it.cardioMin === null && !it.days && !it.swaps.length && !it.tms?.length && !it.loads?.length;
}

function issueText(i: GoalIssue): string {
  switch (i.code) {
    case 'bfBelowFloor':
      return tg('goal.issue.bfFloor', { min: i.min });
    case 'bfLow':
      return tg('goal.issue.bfLow', { warn: i.warnBelow });
    case 'rateOutOfRange':
    case 'directionMismatch':
      return tg('goal.issue.direction');
  }
}

function Row({
  id,
  label,
  from,
  to,
  why,
  basis,
  children,
  off,
  setOff,
}: {
  id: string;
  label: string;
  from: string;
  to: string;
  why?: string | undefined;
  basis?: Basis | undefined;
  children?: ReactNode;
  off: Record<string, boolean>;
  setOff: (f: (o: Record<string, boolean>) => Record<string, boolean>) => void;
}) {
  return (
    <label className="review-item goal-row">
      <input type="checkbox" checked={!off[id]} onChange={(e) => setOff((o) => ({ ...o, [id]: !e.target.checked }))} aria-label={`${tg('goal.keep')}: ${label}`} />
      <span className="stack-xs">
        <span className="goal-row-label">{label}</span>
        <span className="num">
          {from ? `${from} → ` : ''}
          <strong>{to}</strong>
        </span>
        {children}
        {why && <span className="small muted">{why}</span>}
        {basis && <BasisTag basis={basis} />}
      </span>
    </label>
  );
}
